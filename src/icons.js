/* global ewaConfig ewaObjects */

/**
 * @file
 * These functions handle
 */

import path from "path";
import fs from "fs-extra";


import { hashElement as folderHash } from "folder-hash";
import objectHash from "object-hash";


import jsdom from "jsdom";
import glob from "glob";


import { EWASourcePath } from "./compat.js";
import { log, bar } from "./log.js";
import { getExtension, getFolderFiles, fileExists, resolveURL } from "./tools.js";

import PWAAssetGenerator from "pwa-asset-generator";


/**
 * Generates missing icons and tries to inject them into the project where necessary.
 */
async function add(){

	if(ewaConfig.icons.add === true){

		bar.begin("Generating icons");

		await ensureSourceIcon();

		log("Checking if a valid icon cache exists");
		
		const generatorConfig = {
			type: "png",
			opaque: false,
			scrape: false,
			favicon: true,
			pathOverride: `${ewaConfig.alias}/icons`,
			mstile: true,
			log: false,
		};

		const hash = {
			"sourceHash": (await folderHash(path.join(ewaConfig.workPath, ewaConfig.icons.source))).hash,
			"config": objectHash(generatorConfig),
		};

		await fs.ensureFile(path.join(ewaConfig.cachePath, "icons-hash.json"));
		const cachedHash = await fs.readJson(path.join(ewaConfig.cachePath, "icons-hash.json"), {throws: false});

		if(
			hash.sourceHash === cachedHash?.sourceHash &&
			hash.config === cachedHash?.config
		){

			log("Found a valid icon cache");

		}else{

			log("Icon cache was either missing, corrupt, or outdated, so building a new one");

			await Promise.all([
				fs.emptyDir(path.join(ewaConfig.cachePath, "icons")),
				fs.emptyDir(path.join(ewaConfig.cachePath, "icons-injectables")),
			]);

			bar(.05, "Generating icons");
			const checkProgress = setInterval(() => {
				//Expects pwa-asset-generator to generate 30 files. Not a perfect measure, but good enough for a status bar.
				const progress = .05 + ((fs.readdirSync(path.join(ewaConfig.cachePath, "icons")).length / 30) * .8);
				bar(Math.min(progress, .85));
			}, 1000);

			const output = await PWAAssetGenerator.generateImages(
				path.join(ewaConfig.workPath, ewaConfig.icons.source),
				path.join(ewaConfig.cachePath, "icons"),
				generatorConfig,
			);
			
			clearInterval(checkProgress);
			bar(.85, "Generating icon references");
			

			const htmlString = Object.values(output.htmlMeta).join("");
			
			await Promise.all([
				fs.writeFile(path.join(ewaConfig.cachePath, "icons-injectables/index.html"), htmlString),
				fs.writeJson(path.join(ewaConfig.cachePath, "icons-injectables/manifest.json"), output.manifestJsonContent),
				fs.writeJson(path.join(ewaConfig.cachePath, "icons-hash.json"), hash),
			]);
		
		}

		bar(.9, "Adding icons to project");

		await fs.copy(path.join(ewaConfig.cachePath, "icons"), path.join(ewaConfig.workPath, ewaConfig.alias, "icons"));

		ewaConfig.icons.list = [ ...new Set([
			...ewaConfig.icons.list,
			...getFolderFiles(path.join(ewaConfig.workPath, ewaConfig.alias, "icons")).map(iconPath => path.join(ewaConfig.alias, "icons", iconPath)),
		]) ];


		for(const markupPath of glob.sync("**/*.{html,htm}", {cwd: ewaConfig.workPath, absolute: true})){

			const html = new jsdom.JSDOM(await fs.readFile(markupPath));

			if(!html?.window?.document?.head) continue;

			const iconsContainer = html.window.document.createElement("div");
			iconsContainer.innerHTML += await fs.readFile(path.join(ewaConfig.cachePath, "icons-injectables/index.html"));
			html.window.document.body.appendChild(iconsContainer);

			for(const generatedElement of iconsContainer.querySelectorAll("link, meta")){
				
				//Make sure we don't tell Apple that a site without a serviceworker is webapp-capable
				if(generatedElement.name === "apple-mobile-web-app-capable" && !ewaConfig.serviceworker.add) generatedElement.remove();

				//Make sure the link points to the correct relative destination
				const baseLink = generatedElement.href || generatedElement.content;
				if(baseLink && baseLink !== "yes"){
					const absolutePath = resolveURL(ewaConfig.workPath, ewaConfig.workPath, baseLink);
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
							switch(ewaConfig.icons.mergeMode.index){
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

		for(const generatedIcon of await fs.readJson(path.join(ewaConfig.cachePath, "icons-injectables/manifest.json"))){

			let merged = false;

			for(const [index, existingIcon] of ewaObjects.manifest.icons.entries()){

				let match = true;

				for(const key of [
					"sizes",
					"purpose",
				]){
					if(generatedIcon[key] !== existingIcon[key]) match = false;
				}

				if(match){
					if(merged){
						ewaObjects.manifest.icons.splice(index, 1);
					}else{
						switch(ewaConfig.icons.mergeMode.manifest){
							case "overwrite":
								ewaObjects.manifest.icons.splice(index, 1);
								ewaObjects.manifest.icons.push(generatedIcon);
								break;
							case "preserve":
								break;
						}
						merged = true;
					}
				}

			}

			if(!merged){
				ewaObjects.manifest.icons.push(generatedIcon);
				merged = true;
			}

		}

		bar.end("Added icons");

	}

}

async function ensureSourceIcon(){

	if(ewaConfig.icons.source && !fileExists(path.join(ewaConfig.workPath, ewaConfig.icons.source))){
		log("warning", `Was unable to find the source icon at '${ewaConfig.icons.source}'. Will instead find the most suitable source icon automagically.`);
		ewaConfig.icons.source = "";
	}

	if(!ewaConfig.icons.source){

		log("No source icon is defined in config, will instead find the biggest icon (in bytes) and use that as source icon.");

		if(ewaConfig.icons.list.length === 0){
			log("warning", `Was unable to find an icon to use for this webapp, falling back to a generic icon instead. Please link to one in any HTML file, ${ewaConfig.manifestPath}, or ${ewaConfig.configName}.`);
			await fs.copy(path.join(EWASourcePath, "./lib/scaffolding/images/logo.svg"), path.join(ewaConfig.workPath, path.join(ewaConfig.alias, "default-icon.svg")));
			ewaConfig.icons.list.push(path.join(ewaConfig.alias, "default-icon.svg"));
		}

		let bestIconPath = "";
		let hasSVG = false;
		let largestIconSize = 0;

		for(const iconPath of ewaConfig.icons.list.map(relativePath => path.join(ewaConfig.workPath, relativePath))){

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

		log(`Decided to use '${path.relative(ewaConfig.workPath, bestIconPath)}' as source icon.`);

		ewaConfig.icons.source = path.relative(ewaConfig.workPath, bestIconPath);

	}

}


export default { add };
