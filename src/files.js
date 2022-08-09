/* global ewabConfig ewabRuntime */

/**
 * @file
 * These functions help ensure a baseline of valid folders, files, and code paths in the source website and project in general.
 */

import path from "path";
import fs from "fs-extra";
import os from "os";

import { log } from "./log.js";
import { fileExists, folderExists, resolveURL, getSubfolders, ewabPackage } from "./tools.js";
import config, { defaults } from "./config.js";

import glob from "tiny-glob";
import jsdom from "jsdom";
import escapeStringRegexp from "escape-string-regexp";


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

				if(fileExists(path.join(candidatePath, "index.html"))){
					score++;
				}
				if(await glob("**/*.{html,htm}", {cwd: candidatePath, absolute: true}).length === 0){
					score = score - 1;
				}

				if(fileExists(path.join(candidatePath, "manifest.json"))){
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
			log("warning", `Not sure which folder to use as input. Using '${matches[0].name}' from the following options: ${matches.map(match => match.name).join(", ")}.`);
		}else{
			log(`Decided to use '${matches[0].name}' as input folder`);
		}

		ewabConfig.inputPath = matches[0].name;

	}

	if(!ewabConfig.outputPath){

		log(`No output folder path is set, will try to call it something that matches the name of the input folder.`);

		const name = decideOutputFolderName(ewabConfig.inputPath);
		const candidatePath = path.join(ewabConfig.rootPath, name);

		if(fileExists(candidatePath)){

			const backupName = `${ewabConfig.alias}-backup-${name}`;
			log("warning", `The final webapp will be saved to the folder '${name}', but a file already exists at that path. The file has been backed up as '${backupName}'.`);
			await fs.rename(candidatePath, path.join(ewabConfig.rootPath, backupName));
		
		}else if(folderExists(candidatePath) && (await fs.readdir(candidatePath)).length > 0){

			log(`A folder called '${name}' already exists. Will have to guess if it is safe to overwrite it.`);

			if(
				[
					candidatePath.toLowerCase().includes(ewabConfig.alias.toLowerCase()),
					( ewabConfig.manifestPath && fileExists(path.join(candidatePath, ewabConfig.manifestPath)) ),
					( folderExists(path.join(candidatePath, ewabConfig.alias)) || folderExists(path.join(candidatePath, defaults.alias)) ),
					( fileExists(path.join(ewabConfig.rootPath, ewabConfig.inputPath, "index.html")) && fileExists(path.join(candidatePath, "index.html")) ),
				]
					.reduce(( count, assertion ) => count + (assertion ? 1 : 0)) < 2
			){
				let backupName = `${ewabConfig.alias}-backup-${name}`;
				if(fs.existsSync(backupName)){
					const backupBase = backupName;
					let increment = 0;
					while(fs.existsSync(backupName)){
						increment++;
						backupName = `${backupBase}-${increment}`;
					}
				}
				log("warning", `The final webapp will be saved to the folder '${name}', but was unsure if the existing contents of that folder was important, so it has been backed up as '${backupName}'.`);
				await fs.rename(candidatePath, path.join(ewabConfig.rootPath, backupName));
			}else{
				log(`It seems like the '${name}' folder contains an old EWAB output app, so it should be safe to overwrite.`);
			}

		}else{
			log(`Decided to call it '${name}'.`);
		}

		ewabConfig.outputPath = name;

	}

	log(`Setting up basic necessary folders`);

	await fs.ensureDir(path.join(ewabConfig.rootPath, ewabConfig.inputPath));
	await fs.ensureDir(path.join(ewabConfig.rootPath, ewabConfig.outputPath));
	ewabConfig.workPath = await fs.mkdtemp(path.join(os.tmpdir(), `node-${ewabPackage.name}-`));

	log(`Copying source files from '${path.join(ewabConfig.inputPath)}' to the work folder at '${path.relative(ewabConfig.rootPath, ewabConfig.workPath)}'`);

	await fs.copy(path.join(ewabConfig.rootPath, ewabConfig.inputPath), ewabConfig.workPath);
	await fs.ensureDir(path.join(ewabConfig.workPath, ewabConfig.alias));
	await fs.ensureDir(path.join(ewabConfig.workPath, ewabConfig.alias, "sourceMaps"));

	log("Making sure HTML files are usable");

	const markupPaths = await glob("**/*.{html,htm}", {cwd: ewabConfig.workPath, absolute: true});
	let markupHeads = 0;
	for(const markupPath of markupPaths){

		const html = new jsdom.JSDOM(await fs.readFile(markupPath));

		if(!html?.window?.document){
			log("warning", `The HTML file '${path.relative(ewabConfig.workPath, markupPath)}' seems to be invalid. This could cause problems later on, please fix it.`);
		}
		if(html?.window?.document?.head){
			markupHeads++;
		}
	}
	if(markupPaths.length > 0 && markupHeads === 0) log("warning", `None of the HTML files in this project have a <head>. This will cause problems later on, please fix it.`);

	log(`Trying to find a link to the site manifest`);

	log("Looking in config");
	if(ewabConfig.manifestPath){

		if(fileExists(path.join(ewabConfig.workPath, ewabConfig.manifestPath))){
			if(await readManifest(path.join(ewabConfig.workPath, ewabConfig.manifestPath))){
				log(`The manifest link in config seems valid`);
			}else{
				ewabRuntime.manifest = {};
			}
		}else{
			ewabConfig.manifestPath = undefined;
			log("warning", `The manifest path in the config file doesn't point to a file. Please fix the path or remove it.`);
		}

	}

	if(!ewabConfig.manifestPath){
		log("Looking in HTML files");

		const possibleManifestPaths = [];

		for(const markupPath of markupPaths){
			const html = new jsdom.JSDOM(await fs.readFile(markupPath));
			if(!html?.window?.document?.head) continue;
			
			for(const manifestLink of html.window.document.head.querySelectorAll("link[rel=manifest]")){
				possibleManifestPaths.push(resolveURL(ewabConfig.workPath, markupPath, manifestLink.href));
			}
		}

		//Remove duplicates, then remove any that doesn't point to a file
		const manifestPaths = [ ...new Set(possibleManifestPaths) ].filter(manifestPath => fileExists(manifestPath));

		for(const manifestPath of manifestPaths){
			if(await readManifest(manifestPath)){
				log(`Found a link to a valid manifest file in an HTML file`);
			}else{
				if(manifestPaths.indexOf(manifestPath) + 1 === manifestPaths.length){
					ewabRuntime.manifest = {};
					ewabConfig.manifestPath = path.relative(ewabConfig.workPath, manifestPath);
					log("This is the last manifest file found, so keeping it despite it being invalid.");
					break;
				}else{
					log("Also found other manifest files, trying to see if they are valid.");
				}
			}
		}

	}

	if(!ewabConfig.manifestPath){
		log("Trying to guess the path");
		
		const possibleManifestPath = path.join(ewabConfig.workPath, "manifest.json");
		if(fileExists(possibleManifestPath)){
			if(await readManifest(possibleManifestPath)){
				log(`Guessed the manifest path: ${path.relative(ewabConfig.workPath, possibleManifestPath)}`);
			}else{
				log(`Guessed a valid manifest path, but the file seems invalid, so won't use: ${path.relative(ewabConfig.workPath, possibleManifestPath)}`);
			}
		}
	}

	if(!ewabConfig.manifestPath){
		log("warning", `No site manifest found, so using a generic one instead. You can generate one in your source folder with the command: ${ewabPackage.name} scaffold "manifest"`);
		await fs.copy(path.join(ewabRuntime.sourcePath, "lib/scaffolding/manifest.json"), path.join(ewabConfig.workPath, "manifest.json"));
		await readManifest(path.join(ewabConfig.workPath, "manifest.json"));
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
			ewabRuntime.manifest = await fs.readJson(manifestPath);
			ewabConfig.manifestPath = path.relative(ewabConfig.workPath, manifestPath);
			return true;
		}catch(error){
			log("warning", `The manifest file '${ewabConfig.manifestPath}' seems to be invalid. This might cause problems later on, please fix it.`);
			return false;
		}
	}

	log("Adding links to the site manifest");
	for(const markupPath of await glob("**/*.{html,htm}", {cwd: ewabConfig.workPath, absolute: true})){

		const html = new jsdom.JSDOM(await fs.readFile(markupPath));

		if(!html?.window?.document?.head){
			log(`${path.relative(ewabConfig.workPath, markupPath)} doesn't have a <head>, so won't add a reference to manifest.`);
			continue;
		}

		log(`Adding a reference to the manifest file in ${path.relative(ewabConfig.workPath, markupPath)} (overriding any existing).`);

		for(const manifestLink of html.window.document.head.querySelectorAll("link[rel=manifest]")) manifestLink.remove();

		const relativeManifestLink = path.relative(path.join(markupPath, ".."), path.join(ewabConfig.workPath, ewabConfig.manifestPath));

		const manifestLinkElement = html.window.document.createElement("link"); manifestLinkElement.rel = "manifest"; manifestLinkElement.href = relativeManifestLink;
		html.window.document.head.appendChild(manifestLinkElement);
		await fs.writeFile(markupPath, html.window.document.documentElement.outerHTML);

	}



	log("Discovering and verifying icons");

	ewabConfig.icons.list = ewabConfig.icons.list.filter(iconPath => {
		if(fileExists(path.join(ewabConfig.workPath, iconPath))){
			return true;
		}else{
			log("warning", `Found a reference to an icon '${iconPath}' in the config, but was unable to find an icon at that path. Please remove any broken references to icons.`);
			return false;
		}
	});

	for(const markupPath of await glob("**/*.{html,htm}", {cwd: ewabConfig.workPath, absolute: true})){

		const html = new jsdom.JSDOM(await fs.readFile(markupPath));

		const foundIcons = [];

		for(const icon of html.window.document.head.querySelectorAll("link[rel*=icon]")){
			if(icon.href){
				const iconPath = path.relative(ewabConfig.workPath, resolveURL(ewabConfig.workPath, markupPath, icon.href));
				if(fileExists(path.join(ewabConfig.workPath, iconPath))){
					foundIcons.push(iconPath);
				}else{
					log("warning", `Found a reference to an icon '${iconPath}' in '${path.relative(ewabConfig.workPath, markupPath)}', but was unable to find an icon at that path. Please remove any broken references to icons.`);
				}
			}
		}

		log(`${foundIcons.length > 0 ? `Found ${foundIcons.length}` : "Did not find any"} references to icons in '${path.relative(ewabConfig.workPath, markupPath)}'.${foundIcons.length > 0 ? " Adding them to the icons list." : ""}`);

		ewabConfig.icons.list.push(...foundIcons);

	}

	const foundManifestIcons = [];
	if(!Array.isArray(ewabRuntime.manifest.icons)) ewabRuntime.manifest.icons = [];
	for(const icon of ewabRuntime.manifest.icons){
		if(icon.src){
			const iconPath = path.relative(ewabConfig.workPath, resolveURL(ewabConfig.workPath, path.join(ewabConfig.workPath, ewabConfig.manifestPath), icon.src));
			if(fileExists(path.join(ewabConfig.workPath, iconPath))){
				foundManifestIcons.push(iconPath);
			}else{
				log("warning", `Found a reference to an icon '${iconPath}' in the manifest, but was unable to find an icon at that path. Please remove any broken references to icons.`);
			}
		}
	}
	log(`${foundManifestIcons.length > 0 ? `Found ${foundManifestIcons.length}` : "Did not find any"} references to icons in manifest.${foundManifestIcons.length > 0 ? " Adding them to the icons list." : ""}`);
	ewabConfig.icons.list.push(...foundManifestIcons);

	//Remove duplicates
	ewabConfig.icons.list = [ ...new Set([ ...ewabConfig.icons.list ]) ];



	log("Collecting script metadata");
	for(const markupPath of await glob("**/*.{html,htm}", {cwd: ewabConfig.workPath, absolute: true})){

		const html = new jsdom.JSDOM(await fs.readFile(markupPath));

		for(const script of html.window.document.querySelectorAll("script[src]")){
			const scriptPath = path.relative(ewabConfig.workPath, resolveURL(ewabConfig.workPath, markupPath, script.src));
			if(!fileExists(path.join(ewabConfig.workPath, scriptPath))){
				log("warning", `Found a reference to a script '${scriptPath}' in '${path.relative(ewabConfig.workPath, markupPath)}', but was unable to find a script at that path. Please remove any broken references to scripts.`);
				continue;
			}

			const fileConfig = config.generateForFile(scriptPath);

			const fileException = {
				glob: scriptPath,
				files: {
					module: undefined,
				},
			};

			if(script.type === "module"){
				if(fileConfig.files.module === undefined){
					log(`Found that '${scriptPath}' is loaded as a module in '${path.relative(ewabConfig.workPath, markupPath)}'. Unless other proof is found, this will be properly minified as a module.`);
					fileException.files.module = true;
					ewabConfig.fileExceptions.push(fileException);
				}
			}else{
				if(fileConfig.files.module !== false){
					log(`Found that '${scriptPath}' is loaded as a non-module in '${path.relative(ewabConfig.workPath, markupPath)}'. It will not be minified at top-level, to preserve possible sideffects.`);
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

	log(`Copying completed files from '${path.relative(ewabConfig.rootPath, ewabConfig.workPath)}' to '${path.join(ewabConfig.outputPath)}'`);

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

	if(ewabConfig?.workPath) fs.remove(ewabConfig.workPath);
}

/**
 * Writes the final manifest to the manifest file in the project.
 */
async function writeManifest(){
	log("Writing final manifest to project");
	await fs.writeJson(path.join(ewabConfig.workPath, ewabConfig.manifestPath), ewabRuntime.manifest);
}

/**
 * Makes a list of all folders that could be input folders for EWAB.
 * NOTE: the returned results are match objects as defined by `matchInputFolderName()`.
 * 
 * @param	{string}	rootPath	- The absolute path to the folder where input folder candidates should be found.
 * 
 * @returns	{Array<object>}	- An array of match objects for each possible folder. The array is empty if no suitable folders were found.
 */
export function findInputFolderCandidates(rootPath){

	return getSubfolders(rootPath).map(name => matchInputFolderName(name)).filter(match => Boolean(match));

}

/**
 * Figures out what the final output folder should be called, especially by looking at the name of the input folder.
 * 
 * @param {string}	inputFolderName	- The name of the input folder.
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
 * @param	{string}	name	- The name of the input folder.
 * 
 * @returns	{object}	- The match object described above.
 */
function matchInputFolderName(name = ""){

	const regex = new RegExp(`^(?<name>.?(?:(?<brand>${escapeStringRegexp(ewabConfig.alias)}|easy.?webapp))?(?<delimiter>.?)(?<type>input|in|source|src))$`, "ui");

	return name.match(regex)?.groups;

}


export default { begin, end, clean, writeManifest };
