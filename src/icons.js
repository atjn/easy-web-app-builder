/* global ewaConfig ewaObjects */

/**
 * @file
 * Dsdsada.
 */

import path from "path";
import fs from "fs-extra";


import {hashElement as folderHash} from "folder-hash";
import objectHash from "object-hash";


import jsdom from "jsdom";
import globModule from "glob";
const glob = globModule.glob;


import {EWASourcePath} from "./compat.js";
import {log, bar} from "./log.js";
import tools from "./tools.js";

import PWAAssetGenerator from "pwa-asset-generator";


export default {add};


/**
 * Generates missing icons and tries to inject them into the project where necessary.
 */
async function add(){

	if(ewaConfig.icons.add === true){

		bar.begin("Generating icons");

		ensureSourceIcon();

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
			"sourceHash": (await folderHash(path.join(ewaConfig.rootPath, ewaConfig.output, ewaConfig.icons.source))).hash,
			"config": objectHash(generatorConfig),
		};

		await fs.ensureFile(path.join(ewaConfig.cachePath, "icons-hash.json"));
		const cachedHash = await fs.readJson(path.join(ewaConfig.cachePath, "icons-hash.json"), {throws: false});

		if(
			hash.sourceHash !== cachedHash?.sourceHash ||
			hash.config !== cachedHash?.config
		){

			log("Icon cache was either missing, corrupt, or outdated, so building a new one");

			bar(.05, "Generating icons");
			const checkProgress = setInterval(() => {
				//Expects pwa-asset-generator to generate 30 files. Not a perfect measure, but good enough for a status bar.
				const progress = .05 + ((fs.readdirSync(path.join(ewaConfig.cachePath, "icons")).length / 30) * .8);
				bar(progress < .85 ? progress : .85);
			}, 500);

			await Promise.all([
				fs.emptyDir(path.join(ewaConfig.cachePath, "icons")),
				fs.emptyDir(path.join(ewaConfig.cachePath, "icons-injectables")),
			]);

			const output = await PWAAssetGenerator.generateImages(
				path.join(ewaConfig.rootPath, ewaConfig.output, ewaConfig.icons.source),
				path.join(ewaConfig.cachePath, "icons"),
				generatorConfig,
			);
			
			clearInterval(checkProgress);
			bar(.85, "Generating icon references");
			

			const htmlString = Object.values(output.htmlMeta).join("");

			fs.writeFileSync(path.join(ewaConfig.cachePath, "icons-injectables/index.html"), htmlString);
			fs.writeJsonSync(path.join(ewaConfig.cachePath, "icons-injectables/manifest.json"), output.manifestJsonContent);
			fs.writeJsonSync(path.join(ewaConfig.cachePath, "icons-hash.json"), hash);	
		
		}else{
			log("Found a valid icon cache");
		}

		bar(.9, "Adding icons to project");

		await fs.copy(path.join(ewaConfig.cachePath, "icons"), path.join(ewaConfig.rootPath, ewaConfig.output, ewaConfig.alias, "icons"));

		ewaConfig.icons.list = [...ewaConfig.icons.list, ...tools.getFolderFiles(path.join(ewaConfig.rootPath, ewaConfig.output, ewaConfig.alias, "icons")).map(iconPath => {return path.join(ewaConfig.alias, "icons", iconPath);})];


		for(const markupPath of glob.sync("**/*.html", {cwd: path.join(ewaConfig.rootPath, ewaConfig.output), absolute: true})){

			const html = new jsdom.JSDOM((await fs.readFile(markupPath)));

			if(ewaConfig.icons.mergeMode.index === "override"){
				for(const link of html.window.document.head.querySelectorAll("link[rel*=icon")) link.remove();
			}
			html.window.document.head.innerHTML += fs.readFileSync(path.join(ewaConfig.cachePath, "icons-injectables/index.html"));
		
			await fs.writeFile(markupPath, html.window.document.documentElement.outerHTML);

		}

		if(ewaConfig.icons.mergeMode.manifest === "override"){
			ewaObjects.manifest.icons = [];
		}
		ewaObjects.manifest.icons = [...ewaObjects.manifest.icons, fs.readJsonSync(path.join(ewaConfig.cachePath, "icons-injectables/manifest.json"))];

		bar.end("Added icons");

	}

	async function ensureSourceIcon(){
	
		if(ewaConfig.icons.source && !tools.fileExists(path.join(ewaConfig.rootPath, ewaConfig.output, ewaConfig.icons.source))){
			log("warning", `Was unable to find the source icon at '${ewaConfig.icons.source}'. Will instead find the most suitable source icon automagically.`);
			ewaConfig.icons.source = "";
		}
	
		if(!ewaConfig.icons.source){

			log("No source icon is defined in config, will find the biggest icon (in bytes) and use that as source icon.");

			if(ewaConfig.icons.list.length === 0){
				log("warning", `Was unable to find an icon to use for this webapp, falling back to a generic icon instead. Please link to one in the ${ewaConfig.index}, ${ewaConfig.manifest}, or ${ewaConfig.configName} file.`);
				fs.copySync(path.join(EWASourcePath, "./src/injectables/generic/images/logo.svg"), path.join(ewaConfig.rootPath, ewaConfig.output, path.join(ewaConfig.alias, "default-icon.svg")));
				ewaConfig.icons.list.push(path.join(ewaConfig.alias, "default-icon.svg"));
			}
	
			let bestIcon = "";
			let hasSVG = false;
			let largestIconSize = 0;
	
			for(const iconPath of ewaConfig.icons.list){
	
				const isSVG = Boolean(tools.getExtension(iconPath) === "svg");
	
				if(hasSVG && !isSVG){
					continue;
				}
	
				const iconSize = fs.statSync(path.join(ewaConfig.rootPath, ewaConfig.output, iconPath)).size;
	
				if(!hasSVG && isSVG){
					log("Found an SVG icon. Will find the biggest SVG icon (in bytes) and use that as source icon.");
					hasSVG = true;
					bestIcon = iconPath;
					largestIconSize = iconSize;
					continue;
				}
	
				if(iconSize > largestIconSize){
					bestIcon = iconPath;
					largestIconSize = iconSize;
				}
	
			}
	
			log(`Decided to use '${bestIcon}' as source icon.`);
			ewaConfig.icons.source = bestIcon;
	
		}

	}

}
