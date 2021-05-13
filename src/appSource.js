/* global ewaConfig ewaObjects */

/**
 * @file
 * Prel.
 */

import path from "path";
import fs from "fs-extra";

import {log} from "./log.js";
import tools from "./tools.js";

import jsdom from "jsdom";


export default {ensure};

/**
 * Makes sure the app source folder exists, along with a few common files.
 */
async function ensure(){

	const sourcePath = path.join(ewaConfig.rootPath, ewaConfig.source);

	if(!fs.existsSync(sourcePath)){
		log("error", `Cannot find the source folder at ${path.relative(ewaConfig.rootPath, sourcePath)}.`);
	}

	const indexPath = path.join(sourcePath, ewaConfig.index);

	if(!tools.fileExists(indexPath)){
		log("warning", `Was unable to locate the main HTML file at ${path.relative(ewaConfig.rootPath, indexPath)}. Certain features will not run because of this, please fix it.`);
		ewaConfig.serviceworker.add = false;
		ewaConfig.images.convert = false;
	}

	const indexObject = new jsdom.JSDOM(fs.readFileSync(indexPath));

	if(!indexObject?.window?.document){
		log("warning", `Was unable to read the main HTML file at ${path.relative(ewaConfig.rootPath, indexPath)}. Certain features will not run because of this, please fix it.`);
		ewaConfig.serviceworker.add = false;
		ewaConfig.images.convert = false;
	}

	if(!indexObject.window.document.head){
		const head = indexObject.window.document.createElement("head");
		indexObject.window.document.appendChild(head);
	}

	let indexManifest = indexObject.window.document.head.querySelector("link[rel=manifest]");
	if(indexManifest && tools.fileExists(path.join(ewaConfig.rootPath, ewaConfig.output, indexManifest.href))){
		log(`A reference to the manifest file was found in ${ewaConfig.index}. Overriding the config object.`);
		ewaConfig.manifest = indexManifest.href;
	}else{
		if(indexManifest) log("warning", `A reference to the manifest file was found in ${ewaConfig.index}, but it does not seem to link to a real manifest file. Please fix.`);
		
		const manifestPath = path.join(ewaConfig.rootPath, ewaConfig.output, ewaConfig.manifest);
		if(tools.fileExists(manifestPath)){
			log("Found manifest file");
		}else{
			log("warning", "No manifest found, using generic manifest. You have to make your own manifest file, and a good way to start is to generate a generic one in your source folder with the command 'easy-webapp scaffold manifest'");
			fs.copySync(path.join(ewaConfig.rootPath, "./injectables/generic/manifest.json"), manifestPath);
		}

		log(`Adding a reference to the manifest file in ${ewaConfig.index}.`);
		indexManifest = indexObject.window.document.createElement("link"); indexManifest.href = ewaConfig.manifest;
		indexObject.window.document.head.appendChild(indexManifest);
	}


	ewaObjects.manifest = fs.readJsonSync(path.join(ewaConfig.rootPath, ewaConfig.output, ewaConfig.manifest));


	const foundIcons = [];

	for(const icon of indexObject.window.document.head.querySelectorAll("link[rel*=icon]")){
		if(icon.href) foundIcons.push(path.join(icon.href));
	}

	for(const icon of ewaObjects.manifest.icons){
		if(icon.src) ewaConfig.icons.list.push(path.join(icon.src));
	}

	log(`Found ${foundIcons.length} references to icons in ${ewaConfig.index} and ${ewaConfig.manifest}. Adding them to the icons list.`);

	//Merge list of auto-found icons with manually defined list and remove duplicates
	ewaConfig.icons.list = [...new Set([...ewaConfig.icons.list, ...foundIcons])];

	ewaConfig.icons.list.filter(iconPath => {
		if(tools.fileExists(path.join(ewaConfig.rootPath, ewaConfig.output, iconPath))){
			return true;
		}else{
			log("warning", `Found a reference to an icon at '${iconPath}', but was unable to find an icon at that path. Please remove any broken references to icons.`);
			return false;
		}
	});

	await fs.writeFile(indexPath, indexObject.window.document.documentElement.outerHTML);

}
