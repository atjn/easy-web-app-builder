/* global ewabConfig ewabRuntime */

/**
 * @file
 * These functions handle
 */

import path from "path";
import fs from "fs-extra";


import { hashElement as folderHash } from "folder-hash";
import objectHash from "object-hash";


import jsdom from "jsdom";
import glob from "tiny-glob";


import { log, bar } from "./log.js";
import { getExtension, getFolderFiles, fileExists, resolveURL } from "./tools.js";

import PWAAssetGenerator from "pwa-asset-generator";


/**
 * Generates missing icons and tries to inject them into the project where necessary.
 */
async function add(){

	if(ewabConfig.icons.add === true){

		bar.begin("Generating icons");

		await ensureSourceIcon();

		log("Checking if a valid icon cache exists");
		
		const generatorConfig = {
			type: "png",
			opaque: false,
			scrape: false,
			favicon: true,
			pathOverride: `${ewabConfig.alias}/icons`,
			mstile: true,
			log: false,
		};

		const hash = {
			"sourceHash": (await folderHash(path.join(ewabConfig.workPath, ewabConfig.icons.source))).hash,
			"config": objectHash(generatorConfig),
		};

		await fs.ensureFile(path.join(ewabConfig.cachePath, "icons-hash.json"));
		const cachedHash = await fs.readJson(path.join(ewabConfig.cachePath, "icons-hash.json"), {throws: false});

		if(
			hash.sourceHash === cachedHash?.sourceHash &&
			hash.config === cachedHash?.config
		){

			log("Found a valid icon cache");

		}else{

			log("Icon cache was either missing, corrupt, or outdated, so building a new one");

			await Promise.all([
				fs.emptyDir(path.join(ewabConfig.cachePath, "icons")),
				fs.emptyDir(path.join(ewabConfig.cachePath, "icons-injectables")),
			]);

			bar(.05, "Generating icons");
			const checkProgress = setInterval(() => {
				//Expects pwa-asset-generator to generate 30 files. Not a perfect measure, but good enough for a status bar.
				const progress = .05 + ((fs.readdirSync(path.join(ewabConfig.cachePath, "icons")).length / 30) * .8);
				bar(Math.min(progress, .85));
			}, 1000);

			const output = await PWAAssetGenerator.generateImages(
				path.join(ewabConfig.workPath, ewabConfig.icons.source),
				path.join(ewabConfig.cachePath, "icons"),
				generatorConfig,
			);
			
			clearInterval(checkProgress);
			bar(.85, "Generating icon references");
			

			const htmlString = Object.values(output.htmlMeta).join("");
			
			await Promise.all([
				fs.writeFile(path.join(ewabConfig.cachePath, "icons-injectables/index.html"), htmlString),
				fs.writeJson(path.join(ewabConfig.cachePath, "icons-injectables/manifest.json"), output.manifestJsonContent),
				fs.writeJson(path.join(ewabConfig.cachePath, "icons-hash.json"), hash),
			]);
		
		}

		bar(.9, "Adding icons to project");

		await fs.copy(path.join(ewabConfig.cachePath, "icons"), path.join(ewabConfig.workPath, ewabConfig.alias, "icons"));

		ewabConfig.icons.list = [ ...new Set([
			...ewabConfig.icons.list,
			...getFolderFiles(path.join(ewabConfig.workPath, ewabConfig.alias, "icons")).map(iconPath => path.join(ewabConfig.alias, "icons", iconPath)),
		]) ];


		for(const markupPath of await glob("**/*.{html,htm}", {cwd: ewabConfig.workPath, absolute: true})){

			const html = new jsdom.JSDOM(await fs.readFile(markupPath));

			if(!html?.window?.document?.head) continue;

			const iconsContainer = html.window.document.createElement("div");
			iconsContainer.innerHTML += await fs.readFile(path.join(ewabConfig.cachePath, "icons-injectables/index.html"));
			html.window.document.body.appendChild(iconsContainer);

			for(const generatedElement of iconsContainer.querySelectorAll("link, meta")){
				
				//Make sure we don't tell Apple that a site without a serviceworker is web-app-capable
				if(generatedElement.name === "apple-mobile-web-app-capable" && !ewabConfig.serviceworker.add) generatedElement.remove();

				//Make sure the link points to the correct relative destination
				const baseLink = generatedElement.href || generatedElement.content;
				if(baseLink && baseLink !== "yes"){
					const absolutePath = resolveURL(ewabConfig.workPath, ewabConfig.workPath, baseLink);
					const relativeLink = path.relative(path.join(markupPath, ".."), absolutePath);
					if(generatedElement.href){
						generatedElement.href = relativeLink;
					}else if(generatedElement.content){
						generatedElement.content = relativeLink;
					}
				}

				let merged = false;

				for(const existingElement of html.window.document.head.querySelectorAll(`
					link[rel*=icon],
					link[rel^=apple-touch][rel*=image],
					meta[name=apple-mobile-web-app-capable],
					meta[name^=msapplication][name*=logo]
				`)){

					let match = true;
					for(const tagName of [
						"rel",
						"name",
						"media",
						"sizes",
					]){
						if(generatedElement[tagName] !== existingElement[tagName]) match = false;
					}

					if(match){
						if(merged){
							existingElement.remove();
						}else{
							switch(ewabConfig.icons.mergeMode.index){
								case "overwrite":
									existingElement.remove();
									html.window.document.head.appendChild(generatedElement);
									break;
								case "preserve":
									generatedElement.remove();
									break;
							}
							merged = true;
						}
					}
						
				}

				if(!merged){
					html.window.document.head.appendChild(generatedElement);
					merged = true;
				}

			}

			iconsContainer.remove();
		
			await fs.writeFile(markupPath, html.window.document.documentElement.outerHTML);

		}

		for(const generatedIcon of await fs.readJson(path.join(ewabConfig.cachePath, "icons-injectables/manifest.json"))){

			let merged = false;

			for(const [index, existingIcon] of ewabRuntime.manifest.icons.entries()){

				let match = true;

				for(const key of [
					"sizes",
					"purpose",
				]){
					if(generatedIcon[key] !== existingIcon[key]) match = false;
				}

				if(match){
					if(merged){
						ewabRuntime.manifest.icons.splice(index, 1);
					}else{
						switch(ewabConfig.icons.mergeMode.manifest){
							case "overwrite":
								ewabRuntime.manifest.icons.splice(index, 1);
								ewabRuntime.manifest.icons.push(generatedIcon);
								break;
							case "preserve":
								break;
						}
						merged = true;
					}
				}

			}

			if(!merged){
				ewabRuntime.manifest.icons.push(generatedIcon);
				merged = true;
			}

		}

		bar.end("Added icons");

	}

}

async function ensureSourceIcon(){

	if(ewabConfig.icons.source && !fileExists(path.join(ewabConfig.workPath, ewabConfig.icons.source))){
		log("warning", `Was unable to find the source icon at '${ewabConfig.icons.source}'. Will instead find the most suitable source icon automagically.`);
		ewabConfig.icons.source = "";
	}

	if(!ewabConfig.icons.source){

		log("No source icon is defined in config, will instead find the biggest icon (in bytes) and use that as source icon.");

		if(ewabConfig.icons.list.length === 0){
			log("warning", `Was unable to find an icon to use for this webapp, falling back to a generic icon instead. Please link to one in any HTML file, ${ewabConfig.manifestPath}, or ${ewabConfig.configName}.`);
			await fs.copy(path.join(ewabRuntime.sourcePath, "./lib/scaffolding/images/logo.svg"), path.join(ewabConfig.workPath, path.join(ewabConfig.alias, "default-icon.svg")));
			ewabConfig.icons.list.push(path.join(ewabConfig.alias, "default-icon.svg"));
		}

		let bestIconPath = "";
		let hasSVG = false;
		let largestIconSize = 0;

		for(const iconPath of ewabConfig.icons.list.map(relativePath => path.join(ewabConfig.workPath, relativePath))){

			const isSVG = Boolean(getExtension(iconPath) === "svg");

			if(hasSVG && !isSVG){
				continue;
			}

			const iconSize = await fs.stat(iconPath).size;

			if(!hasSVG && isSVG){
				log("Found an SVG icon. Will find the biggest SVG icon (in bytes) and use that as source icon.");
				hasSVG = true;
				bestIconPath = iconPath;
				largestIconSize = iconSize;
			}

			if(iconSize > largestIconSize){
				bestIconPath = iconPath;
				largestIconSize = iconSize;
			}

		}

		log(`Decided to use '${path.relative(ewabConfig.workPath, bestIconPath)}' as source icon.`);

		ewabConfig.icons.source = path.relative(ewabConfig.workPath, bestIconPath);

	}

}


export default { add };
