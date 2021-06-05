/* global ewaConfig ewaObjects */

/**
 * @file
 * These functions help ensure a baseline of valid folders, files, and code paths in the source website and project in general.
 */

import path from "path";
import fs from "fs-extra";
import os from "os";

import { log } from "./log.js";
import { fileExists, resolveURL } from "./tools.js";
import { EWASourcePath } from "./compat.js";

import glob from "glob";
import jsdom from "jsdom";


/**
 * Creates a workFolder where the source website will be manipulated by EWA.
 * Then makes sure a few necessary files and code paths exists.
 */
async function begin(){

	log(`Setting up basic necessary folders`);

	await fs.ensureDir(path.join(ewaConfig.rootPath, ewaConfig.inputPath));
	await fs.ensureDir(path.join(ewaConfig.rootPath, ewaConfig.outputPath));
	ewaConfig.workPath = await fs.mkdtemp(path.join(os.tmpdir(), "node-easy-webapp-"));

	log(`Copying source files from '${path.join(ewaConfig.inputPath)}' to the work folder at '${path.relative(ewaConfig.rootPath, ewaConfig.workPath)}'`);

	await fs.copy(path.join(ewaConfig.rootPath, ewaConfig.inputPath), ewaConfig.workPath);
	await fs.ensureDir(path.join(ewaConfig.workPath, ewaConfig.alias));
	await fs.ensureDir(path.join(ewaConfig.workPath, ewaConfig.alias, "sourceMaps"));

	log("Making sure HTML files are usable");

	const markupPaths = glob.sync("**/*.{html,htm}", {cwd: ewaConfig.workPath, absolute: true});
	let markupHeads = 0;
	for(const markupPath of markupPaths){

		const html = new jsdom.JSDOM(await fs.readFile(markupPath));

		if(!html?.window?.document){
			log("warning", `The HTML file '${path.relative(ewaConfig.workPath, markupPath)}' seems to be invalid. This could cause problems later on, please fix it.`);
		}
		if(html?.window?.document?.head){
			markupHeads++;
		}
	}
	if(markupPaths.length > 0 && markupHeads === 0) log("warning", `None of the HTML files in this project have a <head>. This will cause problems later on, please fix it.`);

	log(`Trying to find a link to the site manifest`);

	log("Looking in config");
	if(ewaConfig.manifestPath){

		if(fileExists(path.join(ewaConfig.workPath, ewaConfig.manifestPath))){
			if(await readManifest(path.join(ewaConfig.workPath, ewaConfig.manifestPath))){
				log(`The manifest link in config seems valid`);
			}else{
				ewaObjects.manifest = {};
			}
		}else{
			ewaConfig.manifestPath = undefined;
			log("warning", `The manifest path in the config file doesn't point to a file. Please fix the path or remove it.`);
		}

	}

	if(!ewaConfig.manifestPath){
		log("Looking in HTML files");

		const possibleManifestPaths = [];

		for(const markupPath of markupPaths){
			const html = new jsdom.JSDOM(await fs.readFile(markupPath));
			if(!html?.window?.document?.head) continue;
			
			for(const manifestLink of html.window.document.head.querySelectorAll("link[rel=manifest]")){
				possibleManifestPaths.push(resolveURL(ewaConfig.workPath, markupPath, manifestLink.href));
			}
		}

		//Remove duplicates, then remove any that doesn't point to a file
		const manifestPaths = [ ...new Set(possibleManifestPaths) ].filter(manifestPath => fileExists(manifestPath));

		for(const manifestPath of manifestPaths){
			if(await readManifest(manifestPath)){
				log(`Found a link to a valid manifest file in an HTML file`);
			}else{
				if(manifestPaths.indexOf(manifestPath) + 1 === manifestPaths.length){
					ewaObjects.manifest = {};
					ewaConfig.manifestPath = path.relative(ewaConfig.workPath, manifestPath);
					log("This is the last manifest file found, so keeping it despite it being invalid.");
					break;
				}else{
					log("Also found other manifest files, trying to see if they are valid.");
				}
			}
		}

	}

	if(!ewaConfig.manifestPath){
		log("Trying to guess the path");
		
		const possibleManifestPath = path.join(ewaConfig.workPath, "manifest.json");
		if(fileExists(possibleManifestPath)){
			if(await readManifest(possibleManifestPath)){
				log(`Guessed the manifest path: ${path.relative(ewaConfig.workPath, possibleManifestPath)}`);
			}else{
				log(`Guessed a valid manifest path, but the file seems invalid, so won't use: ${path.relative(ewaConfig.workPath, possibleManifestPath)}`);
			}
		}
	}

	if(!ewaConfig.manifestPath){
		log("warning", `No site manifest found, so using a generic one instead. You can generate one in your source folder with the command: easy-webapp scaffold "manifest"`);
		await fs.copy(path.join(EWASourcePath, "src/injectables/generic/manifest.json"), path.join(ewaConfig.workPath, "manifest.json"));
		await readManifest(path.join(ewaConfig.workPath, "manifest.json"));
	}

	/**
	 * Tries to read a manifest file. If succesful, adds it to internal memory. If not, logs a warning.
	 * 
	 * @param	{string}	manifestPath	- Absolute path to the manifest file.
	 *  
	 * @returns 	{boolean}	- If the read was succesful.
	 */
	async function readManifest(manifestPath){
		try{
			ewaObjects.manifest = await fs.readJson(manifestPath);
			ewaConfig.manifestPath = path.relative(ewaConfig.workPath, manifestPath);
			return true;
		}catch(error){
			log("warning", `The manifest file '${ewaConfig.manifestPath}' seems to be invalid. This might cause problems later on, please fix it.`);
			return false;
		}
	}

	log("Adding links to the site manifest");
	for(const markupPath of glob.sync("**/*.{html,htm}", {cwd: ewaConfig.workPath, absolute: true})){

		const html = new jsdom.JSDOM(await fs.readFile(markupPath));

		if(!html?.window?.document?.head){
			log(`${path.relative(ewaConfig.workPath, markupPath)} doesn't have a <head>, so won't add a reference to manifest.`);
			continue;
		}

		log(`Adding a reference to the manifest file in ${path.relative(ewaConfig.workPath, markupPath)} (overriding any existing).`);

		for(const manifestLink of html.window.document.head.querySelectorAll("link[rel=manifest]")) manifestLink.remove();

		const relativeManifestLink = path.relative(path.join(markupPath, ".."), path.join(ewaConfig.workPath, ewaConfig.manifestPath));

		const manifestLinkElement = html.window.document.createElement("link"); manifestLinkElement.rel = "manifest"; manifestLinkElement.href = relativeManifestLink;
		html.window.document.head.appendChild(manifestLinkElement);
		await fs.writeFile(markupPath, html.window.document.documentElement.outerHTML);

	}



	log("Discovering icons");

	for(const markupPath of glob.sync("**/*.{html,htm}", {cwd: ewaConfig.workPath, absolute: true})){

		const html = new jsdom.JSDOM(await fs.readFile(markupPath));

		const foundIcons = [];

		for(const icon of html.window.document.head.querySelectorAll("link[rel*=icon]")){
			if(icon.href) foundIcons.push(path.relative(ewaConfig.workPath, resolveURL(ewaConfig.workPath, markupPath, icon.href)));
		}

		log(`${foundIcons.length > 0 ? `Found ${foundIcons.length}` : "Did not find any"} references to icons in '${path.relative(ewaConfig.workPath, markupPath)}'.${foundIcons.length > 0 ? " Adding them to the icons list." : ""}`);

		ewaConfig.icons.list.push(...foundIcons);

	}

	const foundManifestIcons = [];
	if(!Array.isArray(ewaObjects.manifest.icons)) ewaObjects.manifest.icons = [];
	for(const icon of ewaObjects.manifest.icons){
		if(icon.src) foundManifestIcons.push(path.relative(ewaConfig.workPath, resolveURL(ewaConfig.workPath, ewaConfig.manifestPath, icon.src)));
	}
	log(`${foundManifestIcons.length > 0 ? `Found ${foundManifestIcons.length}` : "Did not find any"} references to icons in manifest.${foundManifestIcons.length > 0 ? "Adding them to the icons list." : ""}`);
	ewaConfig.icons.list.push(...foundManifestIcons);

	//Remove duplicates, then remove any icons that don't exist
	ewaConfig.icons.list = [ ...new Set([ ...ewaConfig.icons.list ]) ].filter(iconPath => {
	
		if(fileExists(path.join(ewaConfig.workPath, iconPath))){
			return true;
		}else{
			log("warning", `Found a reference to an icon at '${path.relative(ewaConfig.workPath, iconPath)}', but was unable to find an icon at that path. Please remove any broken references to icons.`);
			return false;
		}

	});

}

/**
 * Copies the finished website into the output folder, then cleans up.
 */
async function end(){

	log(`Copying completed files from '${path.relative(ewaConfig.rootPath, ewaConfig.workPath)}' to '${path.join(ewaConfig.outputPath)}'`);

	await fs.emptyDir(path.join(ewaConfig.rootPath, ewaConfig.outputPath));
	await fs.copy(ewaConfig.workPath, path.join(ewaConfig.rootPath, ewaConfig.outputPath));

	clean();

}

/**
 * Removes any temporary work folders/files.
 * This should only be called directly if something went wrong, otherwise you should call `files.end()`.
 */
async function clean(){

	log(`Removing temporary work folders`);

	fs.remove(ewaConfig.workPath);
}

export default { begin, end, clean };
