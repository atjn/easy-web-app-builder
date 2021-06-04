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

	log(`Making sure main index is usable`);

	const indexPath = path.join(ewaConfig.workPath, ewaConfig.indexPath);

	if(!fileExists(indexPath)){
		log("warning", `Was unable to locate the main HTML file at ${path.join(ewaConfig.inputPath, ewaConfig.indexPath)}. Certain features will not run because of this, please fix it.`);
		ewaConfig.serviceworker.add = false;
		ewaConfig.images.convert = false;
	}

	const indexObject = new jsdom.JSDOM(await fs.readFile(indexPath));

	if(!indexObject?.window?.document){

		log("warning", `Was unable to read the main HTML file at ${path.join(ewaConfig.inputPath, ewaConfig.indexPath)}. Certain features will not run because of this, please fix it.`);
		ewaConfig.serviceworker.add = false;
		ewaConfig.images.convert = false;

	}else if(!indexObject.window.document.head){

		log(`Main HTML file is missing a <head> section, so adding one.`);
		const head = indexObject.window.document.createElement("head");
		indexObject.window.document.appendChild(head);
		await fs.writeFile(indexPath, indexObject.window.document.documentElement.outerHTML);

	}

	log("Making sure all HTML files are usable");

	for(const markupPath of glob.sync("**/*.html", {cwd: ewaConfig.workPath, absolute: true})){

		if(markupPath === indexPath) continue;

		const html = new jsdom.JSDOM(await fs.readFile(markupPath));

		if(!html?.window?.document){
			log("warning", `Was unable to read the HTML file at ${path.relative(ewaConfig.workPath, markupPath)}. Please fix it.`);
		}

	}

	log(`Making sure manifest is usable`);

	const indexManifest = indexObject.window.document.head.querySelector("link[rel=manifest]");
	let manifestPath = resolveURL(ewaConfig.workPath, indexPath, indexManifest?.href);
	if(indexManifest && fileExists(manifestPath)){
		log(`A reference to the manifest file was found in '${ewaConfig.indexPath}'. Overriding the config object.`);
		log(`Since a manifest link was found in the main index file, EWA will not mess with the manifest link in other HTML files.`);
		ewaConfig.manifestPath = indexManifest.href;
	}else{
		if(indexManifest) log("warning", `A reference to the manifest file was found in '${ewaConfig.indexPath}' (${path.relative(ewaConfig.workPath, manifestPath)}), but it does not seem to link to a real manifest file. Please fix this.`);
		
		manifestPath = path.join(ewaConfig.workPath, ewaConfig.manifestPath);
		log(`Looking for the manifest file at ${ewaConfig.manifestPath}`);
		if(fileExists(manifestPath)){
			log("Found manifest file");
		}else{
			log("warning", "No manifest found, so using generic manifest instead. You can generate a generic one by running the command 'easy-webapp scaffold manifest', and then customize it afterwards.");
			fs.copySync(path.join(ewaConfig.rootPath, "./injectables/generic/manifest.json"), manifestPath);
		}

		for(const markupPath of glob.sync("**/*.html", {cwd: ewaConfig.workPath, absolute: true})){

			const html = new jsdom.JSDOM(await fs.readFile(markupPath));

			if(!html?.window?.document?.head) continue;

			log(`Adding a reference to the manifest file in ${path.relative(ewaConfig.workPath, markupPath)} (overriding any existing).`);

			for(const manifestLink of html.window.document.head.querySelectorAll("link[rel=manifest]")) manifestLink.remove();

			const relativeManifestLink = path.relative(path.join(markupPath, ".."), manifestPath);

			const manifestLinkElement = indexObject.window.document.createElement("link"); manifestLinkElement.rel = "manifest"; manifestLinkElement.href = relativeManifestLink;
			indexObject.window.document.head.appendChild(manifestLinkElement);
			await fs.writeFile(markupPath, indexObject.window.document.documentElement.outerHTML);

		}
	}


	ewaObjects.manifest = await fs.readJson(path.join(ewaConfig.workPath, ewaConfig.manifestPath));


	log("Discovering new icons");

	const foundIcons = [];

	for(const icon of indexObject.window.document.head.querySelectorAll("link[rel*=icon]")){
		if(icon.href) foundIcons.push(path.relative(ewaConfig.workPath, resolveURL(ewaConfig.workPath, indexPath, icon.href)));
	}

	for(const icon of ewaObjects.manifest.icons){
		if(icon.src) foundIcons.push(path.relative(ewaConfig.workPath, resolveURL(ewaConfig.workPath, manifestPath, icon.src)));
	}

	log(`${foundIcons.length > 0 ? `Found ${foundIcons.length}` : "Did not find any"} references to icons in ${ewaConfig.indexPath} and ${ewaConfig.manifestPath}. Adding them to the icons list.`);

	//Merge list of auto-found icons with manually defined list and remove duplicates
	ewaConfig.icons.list = [ ...new Set([ ...ewaConfig.icons.list, ...foundIcons ]) ];

	ewaConfig.icons.list.filter(iconPath => {
		if(fileExists(path.join(ewaConfig.workPath, iconPath))){
			return true;
		}else{
			log("warning", `Found a reference to an icon at '${iconPath}', but was unable to find an icon at that path. Please remove any broken references to icons.`);
			return false;
		}
	});

	await fs.writeFile(indexPath, indexObject.window.document.documentElement.outerHTML);

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
