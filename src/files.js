/* global ewabConfig ewabRuntime */

/**
 * @file
 * These functions help ensure a baseline of valid folders, files, and code paths in the source website and project in general.
 */

import path from "node:path";
import fs from "fs-extra";
import os from "node:os";

import { log } from "./log.js";
import { fileExists, folderExists, getSubfolders, generateRelativeAppUrl, resolveAppUrl, ewabPackage, AppFile, getAllAppMarkupFiles } from "./tools.js";
import { defaults, supportedIconPurposes } from "./config.js";

import glob from "tiny-glob";
import escapeStringRegexp from "escape-string-regexp";

export class AppFilesMeta{
	#files = new Map();

	set(appFileMeta){
		this.#files.set(appFileMeta.appFile.appPath, appFileMeta);
	}

	get(appFile){
		return this.#files.get(appFile.appPath) || new AppFileMeta({appFile});
	}

}

export class AppFileMeta{
	constructor(entries = {}){
		for(const key of Object.keys(entries)){
			this[key] = entries[key];
		}
	}

	#appPath;

	/**
	 * The AppFile that corresponds to this meta information.
	 */
	set appFile(value){
		this.#appPath = value.appPath;
	}
	get appFile(){
		return new AppFile({appPath: this.#appPath});
	}

	// Is it a JS module
	isModule;



	imageVersions = [];

	matchImageVersionClosestToWidth(entries, desiredWidth, canBeSmaller = true, canBeLarger = true){
		const candidates = this.matchAllImageVersions(entries);

		let bestCandidate;
		for(const version of candidates){
			const delta = version.width - desiredWidth;
			if(!bestCandidate || Math.abs(delta) < Math.abs(bestCandidate.width - desiredWidth)){
				if( (canBeSmaller || delta >= 0) && (canBeLarger || delta <= 0) ){
					bestCandidate = version;
				}
			}
		}
		return bestCandidate;
	}

	*matchAllImageVersions(entries = {}){
		for(const version of this.imageVersions){
			let matches = true;
			for(const key of Object.keys(entries)){
				if(key === "encoding"){
					if(version.encoding.mimeType !== entries.encoding.mimeType) matches = false;
				}else{
					if(version[key] !== entries[key]) matches = false;
				}
			}
			if(matches) yield version;
		}
	}

}

export class ImageVersion{
	constructor(entries = {}){
		for(const key of Object.keys(entries)){
			this[key] = entries[key];
		}
	}

	#appPath;

	/**
	 * The AppFile that corresponds to this meta information.
	 */
	set appFile(value){
		this.#appPath = value.appPath;
	}
	get appFile(){
		return new AppFile({appPath: this.#appPath});
	}

	encoding;
	width;
	height;
	constraint;
}


/**
 * Creates a workFolder where the source website will be manipulated by EWAB.
 * Then makes sure a few necessary files and code paths exists.
 */
async function begin(){

	if(!ewabConfig.inputPath){

		log(`No input folder path is set, trying to guess it instead`);

		let matches = findInputFolderCandidates(ewabConfig.rootPath);

		if(matches.length === 0){
			log("error", `Was not able to find an input folder`);
		}

		if(matches.length > 1) log(`Found several folders that could be input folders (${matches.map(match => match.name).join(", ")}), will try to narrow it down.`);

		if(matches.length > 1){
			let brandFolderExists = false;
			for(const match of matches) if(match.brand) brandFolderExists = true;

			if(brandFolderExists){
				log(`Found a folder that specifically has EWABs name in its name. Will only consider folders that have that.`);
				matches = matches.filter(match => Boolean(match.brand));
			}
			
		}

		if(matches.length > 1){

			log(`Trying to determine which folder to use based on their contents`);

			let highestScore = 0;
			let winners = [];

			for(const match of matches){

				let score = 0;
				
				const candidatePath = path.join(ewabConfig.rootPath, match.name);

				if(await fileExists(path.join(candidatePath, "index.html"))){
					score++;
				}
				if(await glob("**/*.{html,htm}", {cwd: candidatePath, absolute: true}).length === 0){
					score = score - 1;
				}

				if(await fileExists(path.join(candidatePath, "manifest.json"))){
					score++;
				}

				if(score > highestScore){
					highestScore = score;
					winners = [match];
				}else if(score === highestScore){
					winners.push(match);
				}

			}

			matches = winners;
			
		}

		if(matches.length > 1){
			log("warning", `Not sure which folder to use as input. Using "${matches[0].name}" from the following options: ${matches.map(match => match.name).join(", ")}.`);
		}else{
			log(`Decided to use "${matches[0].name}" as input folder`);
		}

		ewabConfig.inputPath = matches[0].name;

	}

	if(!ewabConfig.outputPath){

		log(`No output folder path is set, will try to call it something that matches the name of the input folder.`);

		const name = decideOutputFolderName(ewabConfig.inputPath);
		const candidatePath = path.join(ewabConfig.rootPath, name);

		if(await fileExists(candidatePath)){

			const backupName = `${ewabConfig.alias}-backup-${name}`;
			log("warning", `The final webapp will be saved to the folder "${name}", but a file already exists at that path. The file has been backed up as "${backupName}".`);
			await fs.rename(candidatePath, path.join(ewabConfig.rootPath, backupName));
		
		}else if((await folderExists(candidatePath)) && (await fs.readdir(candidatePath)).length > 0){

			log(`A folder called "${name}" already exists. Will have to guess if it is safe to overwrite it.`);

			if(
				[
					candidatePath.toLowerCase().includes(ewabConfig.alias.toLowerCase()),
					( ewabConfig.manifestPath && await fileExists(path.join(candidatePath, ewabConfig.manifestPath)) ),
					( (await folderExists(path.join(candidatePath, ewabConfig.alias))) || (await folderExists(path.join(candidatePath, defaults.alias))) ),
					( await fileExists(path.join(ewabConfig.rootPath, ewabConfig.inputPath, "index.html")) && await fileExists(path.join(candidatePath, "index.html")) ),
				]
					.reduce(( count, assertion ) => count + (assertion ? 1 : 0)) < 2
			){
				let backupName = `${ewabConfig.alias}-backup-${name}`;
				if(await fs.exists(backupName)){
					const backupBase = backupName;
					let increment = 0;
					while(await fs.exists(backupName)){
						increment++;
						backupName = `${backupBase}-${increment}`;
					}
				}
				log("warning", `The final webapp will be saved to the folder "${name}", but was unsure if the existing contents of that folder was important, so it has been backed up as "${backupName}".`);
				await fs.rename(candidatePath, path.join(ewabConfig.rootPath, backupName));
			}else{
				log(`It seems like the "${name}" folder contains an old EWAB output app, so it should be safe to overwrite.`);
			}

		}else{
			log(`Decided to call it "${name}".`);
		}

		ewabConfig.outputPath = name;

	}

	log(`Setting up basic necessary folders`);

	await fs.ensureDir(path.join(ewabConfig.rootPath, ewabConfig.inputPath));
	await fs.ensureDir(path.join(ewabConfig.rootPath, ewabConfig.outputPath));
	ewabConfig.workPath = await fs.mkdtemp(path.join(os.tmpdir(), `node-${ewabPackage.name}-`));

	log(`Copying source files from "${path.normalize(ewabConfig.inputPath)}" to the work folder at "${path.normalize(ewabConfig.workPath)}"`);

	await fs.copy(path.join(ewabConfig.rootPath, ewabConfig.inputPath), ewabConfig.workPath);
	await fs.ensureDir(path.join(ewabConfig.workPath, ewabConfig.alias));
	await fs.ensureDir(path.join(ewabConfig.workPath, ewabConfig.alias, "sourceMaps"));

	log("Making sure HTML files are usable");

	let markupHeads = 0;
	let markups = 0;
	for await (const { markupFile, markup } of getAllAppMarkupFiles()){
		if(!markup?.window?.document){
			log("warning", `The HTML file "${markupFile}" seems to be invalid. This could cause problems later on, please fix it.`);
		}
		if(markup?.window?.document?.head){
			markupHeads++;
		}
		markups++;
	}
	if(markups > 0 && markupHeads === 0) log("warning", `None of the HTML files in this project have a <head>. This will cause problems later on, please fix it.`);

	log(`Trying to find a link to the site manifest`);

	log("Looking in config");
	if(ewabConfig.manifestPath){

		const possibleManifestFile = new AppFile({appPath: ewabConfig.manifestPath});

		if(await possibleManifestFile.exists()){
			if(await readManifest(possibleManifestFile)){
				log(`The manifest link in config seems valid`);
			}else{
				ewabRuntime.manifest = {};
			}
		}else{
			ewabConfig.manifestPath = undefined;
			log("warning", `The manifest path in the config file doesn't point to a file. Please fix the path or remove it.`);
		}

	}

	// TODO: This can be improved. It should find the manifest file that looks most like a manifest file. Could also complain about multiple manifest files, and maybe try to merge them.
	if(!ewabConfig.manifestPath){
		log("Looking in HTML files");

		const possibleManifestFiles = [];

		for await (const { markupFile, markup } of getAllAppMarkupFiles()){
			if(!markup?.window?.document?.head) continue;
			
			for(const manifestLink of markup.window.document.head.querySelectorAll("link[rel=manifest]")){
				possibleManifestFiles.push(resolveAppUrl(markupFile, manifestLink.href));
			}
		}

		const manifestFiles = [ ...new Set(possibleManifestFiles) ];

		findValidManifest: for(const manifestFile of manifestFiles){
			if(await readManifest(manifestFile)){
				log(`Found a link to a valid manifest file (${manifestFile}) in an HTML file`);
				break findValidManifest;
			}
		}

	}

	if(!ewabConfig.manifestPath){
		log("Trying to guess the path");
		
		const possibleManifestFile = new AppFile({appPath: "manifest.json"});
		if(await possibleManifestFile.exists()){
			if(await readManifest(possibleManifestFile)){
				log(`Guessed the manifest path: ${possibleManifestFile}`);
			}else{
				log(`Guessed a manifest path, but the file seems invalid, so won't use: ${possibleManifestFile}`);
			}
		}
	}

	if(!ewabConfig.manifestPath){
		log("warning", `No site manifest found, so using a generic one instead. You can generate one in your source folder with the command: ${ewabPackage.name} scaffold "manifest"`);
		const defaultManifestFile = new AppFile({appPath: "manifest.json"});

		await fs.copy(path.join(ewabRuntime.sourcePath, "lib/scaffolding/manifest.json"), defaultManifestFile.workPath);
		await readManifest(defaultManifestFile);
	}

	/**
	 * Tries to read a manifest file. If succesful, adds it to internal memory. If not, logs a warning.
	 * 
	 * @param {AppFile} manifestFile - Absolute path to the manifest file.
	 * @returns {Promise<boolean>} - If the read was succesful.
	 */
	async function readManifest(manifestFile){
		if(!(await manifestFile.exists())){
			log("warning", `The manifest file "${manifestFile}" does not seem to exist. Please remove any references to non-existent manifests from your app.`);
			return false;
		}
		try{
			ewabRuntime.manifest = await fs.readJson(manifestFile.workPath);
			ewabConfig.manifestPath = manifestFile.appPath;
			return true;
		}catch(error){
			log("warning", `The manifest file "${manifestFile}" seems to be invalid. This might cause problems later on, please fix it.`);
			return false;
		}
	}

	log("Adding links to the site manifest");
	for await (const { markupFile, markup } of getAllAppMarkupFiles()){

		if(!markup?.window?.document?.head){
			log(`${markupFile} doesn't have a <head>, so won't add a reference to manifest.`);
			continue;
		}

		log(`Adding a reference to the manifest file in ${markupFile} (overriding any existing).`);

		for(const manifestLink of markup.window.document.head.querySelectorAll("link[rel=manifest]")) manifestLink.remove();

		const manifestLinkElement = markup.window.document.createElement("link");
		manifestLinkElement.rel = "manifest";
		manifestLinkElement.href = generateRelativeAppUrl(markupFile, new AppFile({appPath: ewabConfig.manifestPath}));
		markup.window.document.head.appendChild(manifestLinkElement);

		await markupFile.write(markup.serialize());
	}



	log("Discovering and verifying icons");

	for(const purpose of supportedIconPurposes){
		ewabRuntime.iconsList[purpose] = ewabRuntime.iconsList[purpose].filter(async iconPath => {
			const iconFile = new AppFile({appPath: iconPath});
			if(await iconFile.exists()){
				return true;
			}else{
				log("warning", `Found a reference to an icon "${iconFile}" in the config, but was unable to find an icon at that path. Please remove any broken references to icons.`);
				return false;
			}
		});
	}

	for await (const { markupFile, markup } of getAllAppMarkupFiles()){

		const foundIcons = [];

		for(const icon of markup.window.document.head.querySelectorAll("link[rel*=icon]")){
			if(icon.href){
				const iconFile = resolveAppUrl(markupFile, icon.href);
				if(await iconFile.exists()){
					foundIcons.push(iconFile);
				}else{
					log("warning", `Found a reference to an icon "${iconFile}" in "${markupFile}", but was unable to find an icon at that path. Please remove any broken references to icons.`);
				}
			}
		}

		log(`${foundIcons.length > 0 ? `Found ${foundIcons.length}` : "Did not find any"} references to icons with purpose "any" in "${markupFile}".${foundIcons.length > 0 ? " Adding them to the icons list." : ""}`);

		ewabRuntime.iconsList.any.push(...foundIcons.map(iconFile => iconFile.appPath));

	}

	const foundManifestIcons = {};
	for(const purpose of supportedIconPurposes) foundManifestIcons[purpose] = [];

	if(!Array.isArray(ewabRuntime.manifest.icons)) ewabRuntime.manifest.icons = [];
	const manifestFile = new AppFile({appPath: ewabConfig.manifestPath});
	for(const icon of ewabRuntime.manifest.icons){
		if(icon.src){
			const iconFile = resolveAppUrl(manifestFile, icon.src);

			const foundPurposes = [];
			if(typeof icon.purpose === "string"){
				for(const purpose of supportedIconPurposes) if(icon.purpose.includes(purpose)) foundPurposes.push(purpose);
			}
			if(foundPurposes.length === 0){
				foundPurposes.push("any");
			}

			if(await iconFile.exists()){
				for(const purpose of foundPurposes) foundManifestIcons[purpose].push(iconFile);
			}else{
				log("warning", `Found a reference to an icon "${iconFile}" in the manifest, but was unable to find an icon at that path. Please remove any broken references to icons.`);
			}
		}
	}
	for(const purpose of supportedIconPurposes){
		const count = foundManifestIcons[purpose].length;
		log(`${count > 0 ? `Found ${count}` : "Did not find any"} references to icons with purpose "${purpose}" in manifest.${count > 0 ? " Adding them to the icons list." : ""}`);
	
		ewabRuntime.iconsList[purpose].push(...foundManifestIcons[purpose].map(iconFile => iconFile.appPath));

		//Remove duplicates
		ewabRuntime.iconsList[purpose] = [ ...new Set([ ...ewabRuntime.iconsList[purpose] ]) ];
	}

	// Ensure that the same icon has not been defined for multiple purposes
	const iconPurposeMap = new Map();
	for(const purpose of supportedIconPurposes){
		for(const icon of ewabRuntime.iconsList[purpose]){
			iconPurposeMap.set(
				icon,
				(iconPurposeMap.get(icon) || []).push(purpose),
			);
		}
	}
	for(const [ icon, purposes ] of iconPurposeMap.entries()){
		if(purposes.length > 1) log("warning", `The icon ${icon} is referenced to be for the following purposes: ${purposes.join(", ")}. An icon cannot be formatted to work with multiple purposes, read more here: https://developer.mozilla.org/en-US/docs/Web/Manifest/icons#values`);
	}


	log("Collecting file metadata");
	for await (const { markupFile, markup } of getAllAppMarkupFiles()){

		for(const script of markup.window.document.querySelectorAll("script[src]")){
			const scriptFile = resolveAppUrl(markupFile, script.src);
			if(!(await scriptFile?.exists())){
				log("warning", `Found a reference to a script "${scriptFile}" in "${markupFile}", but was unable to find a script at that path. Please remove any broken references to scripts.`);
				continue;
			}

			const fileException = {
				glob: scriptFile.appPath,
				files: {
					module: undefined,
				},
			};

			if(script.type === "module"){
				if(scriptFile.config.files.module === undefined){
					log(`Found that "${scriptFile}" is loaded as a module in "${markupFile}". Unless other proof is found, this will be properly minified as a module.`);
					fileException.files.module = true;
					ewabConfig.fileExceptions.push(fileException);
				}
			}else{
				if(scriptFile.config.files.module !== false){
					log(`Found that "${scriptFile}" is loaded as a non-module in "${markupFile}". It will not be minified at top-level, to preserve possible sideffects.`);
					fileException.files.module = false;
					ewabConfig.fileExceptions.push(fileException);
				}
			}

		}

	}

}

/**
 * Copies the finished website into the output folder, then cleans up.
 */
async function end(){

	log(`Copying completed files from "${path.relative(ewabConfig.rootPath, ewabConfig.workPath)}" to "${path.normalize(ewabConfig.outputPath)}"`);

	await fs.emptyDir(path.join(ewabConfig.rootPath, ewabConfig.outputPath));
	await fs.copy(ewabConfig.workPath, path.join(ewabConfig.rootPath, ewabConfig.outputPath));

	clean();

}

/**
 * Removes any temporary work folders/files.
 * This should only be called directly if something went wrong, otherwise you should call `files.end()`.
 */
async function clean(){

	log(`Removing temporary work folders`);

	if(ewabConfig?.workPath) await fs.remove(ewabConfig.workPath);
}

/**
 * Writes the final manifest to the manifest file in the project.
 */
async function writeManifest(){
	log("Writing final manifest to project");
	const manifestFile = new AppFile({appPath: ewabConfig.manifestPath});
	manifestFile.write(ewabRuntime.manifest);
}

/**
 * Makes a list of all folders that could be input folders for EWAB.
 * NOTE: the returned results are match objects as defined by `matchInputFolderName()`.
 * 
 * @param {string} rootPath - The absolute path to the folder where input folder candidates should be found.
 * 
 * @returns	{Array<object>} - An array of match objects for each possible folder. The array is empty if no suitable folders were found.
 */
export function findInputFolderCandidates(rootPath){

	return getSubfolders(rootPath).map(name => matchInputFolderName(name)).filter(match => Boolean(match));

}

/**
 * Figures out what the final output folder should be called, especially by looking at the name of the input folder.
 * 
 * @param {string} inputFolderName - The name of the input folder.
 * 
 * @returns {string} - The output folder name to be used.
 */
export function decideOutputFolderName(inputFolderName){

	let name = "public";

	const inputMatch = matchInputFolderName(inputFolderName);

	if(inputMatch?.type){
		const typeMap = {
			"input":	"output",
			"Input":	"Output",
			"INPUT":	"OUTPUT",
			"in":		"out",
			"In":		"Out",
			"IN":		"OUT",
			"source":	"public",
			"Source":	"Public",
			"SOURCE":	"PUBLIC",
			"src":		"pub",
			"Src":		"Pub",
			"SRC":		"PUB",
		};
		name = typeMap[inputMatch.type] ?? typeMap[inputMatch.type.toLowerCase()] ?? name;
	}

	if(inputMatch?.brand) name = `${inputMatch.brand}${inputMatch.delimiter ?? ""}${name}`;

	return name;
}

/**
 * Identifies different parts of the input folder name, and returns them as an object.
 * 
 * The object contains:
 * - name: The full name of the folder.
 * - type: What type of name was given to the folder (example: 'input', 'src).
 * - brand: The EWAB name that was used in the folder name (undefined if no EWAB name was used) (example: 'EWAB', 'easy-web-app-builder').
 * - delimiter: What delimiter was used between `brand` and `type` (undefined if there was no delimiter).
 * 
 * @param {string} name - The name of the input folder.
 * 
 * @returns	{object} - The match object described above.
 */
function matchInputFolderName(name = ""){

	const regex = new RegExp(`^(?<name>.?(?:(?<brand>${escapeStringRegexp(ewabConfig.alias)}|easy.?webapp))?(?<delimiter>.?)(?<type>input|in|source|src))$`, "ui");

	return name.match(regex)?.groups;

}


export default { begin, end, clean, writeManifest };
