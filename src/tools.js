/* global ewabConfig ewabRuntime */

/**
 * @file
 * This file contains some common functions that are used across EWAB.
 */

import path from "node:path";
import fs from "fs-extra";
import url from "node:url";

import tinyGlob from "tiny-glob";
import minimatch from "minimatch";
import { hashElement } from "folder-hash";
import jsdom from "jsdom";
import lodash from "lodash";

import { log } from "./log.js";

/**
 * Has the same behavior as `import`, but also allows importing JSON files.
 * 
 * @param {File} file - The file being imported.
 * @returns {any} - Whatever the file was exporting. If it was a JSON file, the JSON is parsed.
 * 
 */
export async function importAny(file){

	if(fatalError(`import of ${file}`)) return {};

	let data = {};

	switch(file.extension){
		case "js": {
			const module = await import(file.absolutePath);
			data = module.default;
			break;
		}
		case "json": {
			// TODO: Use the native feature when available: https://nodejs.org/docs/latest/api/esm.html#esm_json_modules.
			data = await fs.readJson(file.absolutePath);
			break;
		}
	}

	return data;

}

/**
 * The absolute path to the directory that easy-web-app-builder is running out of.
 */
export const ewabSourcePath = path.join(url.fileURLToPath(import.meta.url), "../../");

/**
 * Generates a relative URL from one file to another.
 * When the URL is inserted into the first file, browsers will be able to resolve the path to the other file from it.
 *
 * @param {AppFile} fromFile - The file that needs to point to another file.
 * @param {AppFile} toFile - The file that needs to be pointed to.
 * @returns {string} - The relative URL from the first file to the second file.
 */
export function generateRelativeAppUrl(fromFile, toFile){
	const relativePath = path.relative(path.join(fromFile.appPath, ".."), toFile.appPath);
	const url = relativePath.split("/").map(segment => encodeURIComponent(segment)).join("/");
	return url;
}

/**
 * Takes any URL format referenced in any app file and returns an AppFile for the referenced file.
 * 
 * @param {AppFile} appFile - AppFile for the file that the URL is referenced in.
 * @param {string} url - The URL from the file.
 * @param {boolean} resolveOutisdeAppRoot - Whether or not the urls can reference files outside of the app root folder.
 * 
 * @returns	{AppFile | null} - AppFile for the file that the URL was referring to, or null if the URL could not be parsed.
 */
export function resolveAppUrl(appFile, url, resolveOutisdeAppRoot = false){

	// TODO: This should probably be replaced with the whatwg-url node package

	const dirtyUrlPath = url.match(/^(?![^/.]*?\/\/)(?<path>.*)$/ui)?.groups?.path;
	if(!dirtyUrlPath) return null;

	const urlSegments = dirtyUrlPath.split("/");

	const urlPathIsAbsolute = Boolean(urlSegments[0] === "" && urlSegments.length > 1);

	let index = 0;
	while(index < urlSegments.length){
		if(urlSegments[index] === "."){
			urlSegments.splice(index, 1);
		}else{
			index += 1;
		}
	}

	index = 1;
	while(index < urlSegments.length){
		if(urlSegments[index] === ".." && urlSegments[index - 1] !== ".."){
			urlSegments.splice(index - 1, 2);
			index -= 1;
		}else{
			index += 1;
		}
	}

	index = 0;
	while(index < urlSegments.length - 1){
		if(urlSegments[index] === ""){
			urlSegments.splice(index, 1);
		}else{
			index += 1;
		}
	}

	try {
		for(const [index, segment] of urlSegments.entries()){
			urlSegments[index] = decodeURIComponent(segment);
		}
	}catch(error){
		return null;
	}

	const tidyUrlPath = urlSegments.join("/");

	const appPath = urlPathIsAbsolute
		? path.normalize(tidyUrlPath)
		: path.join(
			path.join(appFile.appPath, ".."),
			tidyUrlPath,
		);

	if(!resolveOutisdeAppRoot && appPath.startsWith("..")) return null;

	return new AppFile({appPath});

}

/**
 * Takes any srcset referenced in any app file and returns an AppFile for the largest file referenced in it.
 * Note that this is trusting the user to have defined sizes correctly.
 * 
 * @param {AppFile} appFile - AppFile for the file that the srcset is referenced in.
 * @param {string | string[]} srcsets - The srcset or array of srcsets from the file.
 * @param {boolean} resolveOutisdeAppRoot - Whether or not the urls can reference files outside of the app root folder.
 * 
 * @returns	{AppFile | null} - AppFile for the best file that the srcset was referring to, or null if the srcset could not be parsed.
 */
export function resolveAppSrcset(appFile, srcsets, resolveOutisdeAppRoot = false){
	srcsets ??= "";
	const srcset = typeof srcsets === "string" ? srcsets : srcsets.join(",");

	let bestImage;

	for(const srcsetPart of srcset.split(",")){
		const imageCandidate = srcsetPart.match(/^\s*(?<url>\S*)(?:\s+(?<size>[.\d]+)[a-z]{1,5})?\s*$/ui);
		imageCandidate.appFile = resolveAppUrl(appFile, imageCandidate?.groups?.url || "", resolveOutisdeAppRoot);
		if(imageCandidate.appFile){
			if(!bestImage || (!bestImage.size && imageCandidate.size) || imageCandidate.size > bestImage.size){
				bestImage = imageCandidate;
			}
		}
	}

	return bestImage?.appFile || null;
}

/**
 * The NPM package file.
 */
export const ewabPackage = fs.readJsonSync(path.join(ewabSourcePath, "package.json"));

/**
 * Returns an array of all file names in a folder.
 * 
 * @param	{string}	folderPath	- Absolute path of the folder to scan.
 * 
 * @returns	{File[]}	- An array of all file names in the folder.
 */
export function getFolderFiles(folderPath){
	return fs.readdirSync(folderPath, {withFileTypes: true})
		.filter(entry => entry.isFile())
		.map(entry => entry.name);
}

/**
 * Returns an array of all subfolder names in a folder.
 * 
 * @param	{string}	folderPath	- Absolute path of the folder to scan.
 * 
 * @returns	{string[]}	- An array of all subfolder names in the folder.
 */
export function getSubfolders(folderPath){
	return fs.readdirSync(folderPath, {withFileTypes: true})
		.filter(entry => entry.isDirectory())
		.map(entry => entry.name);
}

/**
 * Checks if a file exists at a certain path.
 * 
 * @param {string} filePath	- Absolute path of the file to check.
 * @returns	{Promise<boolean>} - Wether the file exists or not.
 */
export async function fileExists(filePath){
	return Boolean(await fs.exists(filePath) && (await fs.lstat(filePath)).isFile());
}

/**
 * Checks if a file exists at a certain path. (synhcronous).
 * 
 * @param {string} filePath	- Absolute path of the file to check.
 * @returns	{boolean} - Wether the file exists or not.
 */
export function fileExistsSync(filePath){
	return Boolean(fs.existsSync(filePath) && fs.lstatSync(filePath).isFile());
}

/**
 * Checks if a folder exists at a certain path.
 * 
 * @param	{string}	folderPath	- Absolute path of the folder to check.
 * 
 * @returns	{boolean}	- Wether the folder exists or not.
 */
export async function folderExists(folderPath){

	return Boolean(await fs.exists(folderPath) && (await fs.lstat(folderPath)).isDirectory());

}

/**
 * This will properly merge two objects, the way you would expect it to work.
 * 
 * @param {object}	source	- The original object.
 * @param {object}	update	- The new object to merge (this will overwrite anything in the original object).
 * 
 * @returns {object} - The new combined object.
 */
export function deepMerge(source, update){
	return lodash.mergeWith({}, source, update, (source, update) => Array.isArray(source) ? [ ...source, ...update ] : undefined);
}

/**
 * Clone an object.
 * 
 * @param {object} source - The object to clone.
 * 
 * @returns {object} - The cloned object.
 */
export function deepClone(source){
	return lodash.cloneDeep(source);

}
/**
 * When starting a new procedure, this can be called to check if EWAB has
 * encountered a fatal error, in which case the process should halt immediately.
 *
 * @param {string} processDescription - Description of the starting process which is used in debug log messages.
 * @returns {boolean} - Whether or not EWAB has encountered a fatal error.
 */
export function fatalError(processDescription){
	if(ewabRuntime?.fatalErrorEncountered){
		log(`Skipping ${processDescription} because EWAB encountered a fatal error`);
		return true;
	}else{
		return false;
	}
}

/**
 * Represents a file in the filesystem.
 */
export class File{

	constructor(entries = {}){
		for(const key of Object.keys(entries)){
			this[key] = entries[key];
		}
	}

	/**
	 * The absolute path to the file.
	 *
	 * @param {string} value - Value to set.
	 */
	set absolutePath(value){
		this.#absolutePath = path.resolve(value);
	}
	get absolutePath(){
		return this.#absolutePath;
	}
	#absolutePath = "";

	/**
	 * The path to the file, relative to the ewab root folder.
	 * This is mostly useful for displaying the path in logs, since it doesn't include the absolute
	 * path to the root folder, which clutters the log and could contain sensitive information.
	 *
	 * @param {string} value - Value to set.
	 */
	set rootPath(value){
		this.absolutePath = path.join(ewabConfig?.rootPath ?? "", value);
	}
	get rootPath(){
		return path.relative(ewabConfig?.rootPath ?? "", this.absolutePath);
	}

	/**
	 * A standardised version of the file extension with no leading dot and all lowercase letters.
	 * 
	 * @returns	{string} - The file extension.
	 */
	get extension(){
		return path.extname(this.absolutePath).substring(1).toLowerCase();
	}

	/**
	 * Checks whether or not the file actually exists in the filesystem.
	 *
	 * @returns {Promise<boolean>} - Whether or not the file exists in the filesystem.
	 */
	async exists(){
		return await fileExists(this.absolutePath);
	}

	/**
	 * Reads the contents of the file.
	 * Remember to call `exists` first to check if the file exists in the filesystem.
	 *
	 * @param {"string"|"json"} readAs - Whether to read the file as a string (default) or parse it as JSON.
	 * @returns {Promise<string|object>} - The contents of the file.
	 */
	async read(readAs = "string"){
		if(fatalError(`read of ${this}`)) return emptyVersionOf(readAs);
		
		try {
			switch(readAs){
				case "string": {
					return await fs.readFile(this.absolutePath, "utf8");
				}
				case "json": {
					return await fs.readJson(this.absolutePath);
				}
			}
		}catch(error){
			log("error", `Encountered an error while reading file "${this}"`, error);
			return emptyVersionOf(readAs);
		}

		/**
		 * If there is an issue with reading the file, call this to return a safe empty value.
		 * 
		 * @returns {""|{}} - The empty version of the file type.
		 */
		function emptyVersionOf(){
			switch(readAs){
				case "string": {
					return "";
				}
				case "json": {
					return {};
				}
			}
		}

		throw new TypeError(`Does not support reading file as type "${readAs}"`);
	}

	/**
	 * Overwrites the file with the given content.
	 * If the content is an object, it is stringified as JSON.
	 *
	 * @param {string | object} content - The content to write to the file.
	 * @returns {Promise<void>}
	 */
	async write(content){
		if(fatalError(`write to "${this}"`)) return;

		try{
			if(typeof content === "string"){
				return await fs.outputFile(this.absolutePath, content);
			}else{
				return await fs.outputJson(this.absolutePath, content);
			}
		}catch(error){
			log("error", `Encountered an error while writing file "${this}"`, error);
		}
	}

	/**
	 * Copies the contents of this file to another file.
	 *
	 * @param {File} file - The file to copy to.
	 * @returns {Promise<void>}
	 */
	async copyTo(file){
		if(fatalError(`copying of "${this}" to "${file}"`)) return;

		try{
			return await fs.copy(this.absolutePath, file.absolutePath);
		}catch(error){
			log("error", `Encountered an error while copying file "${this}" to "${file}"`, error);
		}
	}

	/**
	 * Deletes the file from the filesystem.
	 *
	 * @returns {Promise<void>}
	 */
	async delete(){
		if(fatalError(`deleting "${this}"`)) return;

		return await fs.remove(this.absolutePath);
	}

	/**
	 * Computes a hash for the file.
	 * Be aware that the hash is computed from the current file, which might be different from the original input file.
	 *
	 * @returns {Promise<string>} - The hash as a hex string.
	 */
	async getHash(){
		if(fatalError(`hash read of "${this}"`)) return "";

		return (await hashElement(this.absolutePath, { "encoding": "hex" })).hash;
	}

	/**
	 * Tests whether the given file os of the type specified.
	 * TODO: Maybe this should do proper type sniffing in the future?
	 *
	 * @param {string} type - The extension type. 
	 * @returns {boolean} - Whether or not this file os of the given type.
	 */
	is(type){
		return Boolean(type === this.extension);
	}

	toString(){
		return this.rootPath;
	}

}

/**
 * Represents a file in the app.
 */
export class AppFile extends File{

	constructor(entries = {}){
		super();
		for(const key of Object.keys(entries)){
			this[key] = entries[key];
		}
	}

	/**
	 * The canonical path to the file, relative to the app root.
	 *
	 * @param {string} value - Value to set.
	 */
	set appPath(value){
		this.#appPath = path.normalize(value);
	}
	get appPath(){
		return this.#appPath;	
	}
	#appPath = "";

	/**
	 * The path to the file in the input folder, relative to the ewab root folder.
	 * This is mostly useful for displaying the path in logs, since it doesn't include the absolute
	 * path to the root folder, which clutters the log and could contain sensitive information.
	 *
	 * @param {string} value - Value to set.
	 */
	set safeInputPath(value){
		this.appPath = path.relative(ewabConfig.inputPath, value);
	}
	get safeInputPath(){
		return path.join(ewabConfig.inputPath, this.appPath);
	}

	/**
	 * The absolute path to the file in the input folder.
	 *
	 * @param {string} value - Value to set.
	 */
	set inputPath(value){
		if(!value.startsWith(ewabConfig.rootPath)){
			throw new ReferenceError(`The path "${value}" doesn't start with the root folder ("${ewabConfig.rootPath}").`);
		}
		this.rootPath = path.relative(ewabConfig.rootPath, value);
	}
	get inputPath(){
		return path.join(ewabConfig.rootPath, this.safeInputPath);
	}

	/**
	 * The path to the file in the output folder, relative to the ewab root folder.
	 * This is mostly useful for displaying the path in logs, since it doesn't include the absolute
	 * path to the root folder, which clutters the log and could contain sensitive information.
	 *
	 * @param {string} value - Value to set.
	 */
	set safeOutputPath(value){
		if(!value.startsWith(ewabConfig.outputPath)){
			throw new ReferenceError(`The path "${value}" doesn't start with the output folder ("${ewabConfig.outputPath}").`);
		}
		this.appPath = path.relative(ewabConfig.outputPath, value);
	}
	get safeOutputPath(){
		return path.join(ewabConfig.outputPath, this.appPath);
	}

	/**
	 * The absolute path to the file in the output folder.
	 *
	 * @param {string} value - Value to set.
	 */
	set outputPath(value){
		if(!value.startsWith(ewabConfig.rootPath)){
			throw new ReferenceError(`The path "${value}" doesn't start with the root folder ("${ewabConfig.rootPath}").`);
		}
		this.safeOutputPath = path.relative(ewabConfig.rootPath, value);
	}
	get outputPath(){
		return path.join(ewabConfig.rootPath, this.safeOutputPath);
	}

	/**
	 * The absolute path to the file in the work folder.
	 *
	 * @param {string} value - Value to set.
	 */
	set workPath(value){
		if(!value.startsWith(ewabConfig.workPath)){
			throw new ReferenceError(`The path "${value}" doesn't start with the work folder ("${ewabConfig.workPath}").`);
		}
		this.appPath = path.relative(ewabConfig.workPath, value);
	}
	get workPath(){
		return path.join(ewabConfig.workPath, this.appPath);
	}

	/**
	 * The absolute path to the file in the work folder.
	 * This is only for compatibility with the File class, try to avoid using it.
	 *
	 * @param {string} value - Value to set.
	 */
	set absolutePath(value){
		this.workPath = value;
	}
	get absolutePath(){
		return this.workPath;
	}

	/**
	 * Generates and saves the `cacheEntry` based on the current file contents. 
	 *
	 * @returns {Promise<void>}
	 */
	async setCacheEntry(){
		const fileHash = await this.getHash();

		this.cacheEntry = new File({ absolutePath: path.join(ewabConfig.cachePath, "items", `${fileHash}.${this.extension}`) });
	}

	/**
	 * A File pointing to the cached finished version of this app file.
	 * If this file exists, there is no reason to reprocess the original file.
	 */
	cacheEntry;

	/**
	 * Returns a File for the sourcemap. This File has a few extra properties to aid in linking the sourcemap.
	 *
	 * @returns {AppFile} - The file for the sourcemap.
	 */
	get sourceMap(){
		const sourceMap = new AppFile({absolutePath: `${this.absolutePath}.map`});

		if(this.cacheEntry) sourceMap.cacheEntry = new File({absolutePath: `${this.cacheEntry.absolutePath}.map`});

		sourceMap.mapToFilePath = generateRelativeAppUrl(sourceMap, this);
		sourceMap.fileToMapPath = generateRelativeAppUrl(this, sourceMap);

		return sourceMap;
	}

	get meta(){
		return ewabRuntime.appFilesMeta.get(this);
	}
	set meta(value){
		ewabRuntime.appFilesMeta.set(value);
	}

	/**
	 * The config for the app file, taking into account any `fileExceptions`.
	 * TODO: Implement caching for this, it is causing ridiculous amounts of CPU and read usage.
	 *
	 * @returns	{object} - The config for the app file.
	 */
	get config(){
		let exceptionsConfig = {};
		for(const exception of ewabConfig.fileExceptions){
			if(minimatch(this.appPath, exception.glob)){
				exceptionsConfig = deepMerge(exceptionsConfig, exception);
				if(exceptionsConfig?.images?.convert?.targetExtensions) exceptionsConfig.images.convert.targetExtensions = exception.images.convert.targetExtensions;
				if(exceptionsConfig?.images?.convert?.sizes) exceptionsConfig.images.convert.sizes = exception.images.convert.sizes;
				delete exceptionsConfig.glob;
			}
		}
		return deepMerge(ewabConfig, exceptionsConfig);
	}

	toString(){
		return this.safeInputPath;
	}

}

/**
 * Finds any file in the working directory that satisfies the glob pattern.
 *
 * @param {string} query - The glob pattern to use.
 * @yields {File} - The path to the file.
 */
export async function *glob(query){
	const paths = await tinyGlob(query, {cwd: ewabConfig.rootPath, absolute: true, filesOnly: true});
	for(const path of paths){
		yield new File({absolutePath: path});
	}
}

/**
 * Finds any file in the app that satisfies the glob pattern.
 *
 * @param {string} query - The glob pattern to use.
 * @yields {AppFile} - The path to the file.
 */
export async function *globApp(query){
	const paths = await tinyGlob(query, {cwd: ewabConfig.workPath, absolute: true, filesOnly: true});
	for(const path of paths){
		yield new AppFile({workPath: path});
	}
}

/**
 * Finds all markup files in the app.
 *
 * @yields {object} - The markup as an AppFile and a JSDOM parsed object.
 */
export async function *getAllAppMarkupFiles(){
	for await (const markupFile of globApp("**/*.{html,htm}")){
		yield {
			markupFile,
			markup: new jsdom.JSDOM(await markupFile.read()),
		};
	}
}

/**
 * Finds all sheet files in the app.
 *
 * @yields {object} - The markup as an AppFile and a parsed PostCSS AST object.
 */
export async function *getAllAppSheetFiles(){
	for await (const sheetFile of globApp("**/*.{css}")){
		yield {
			sheetFile,
		};
	}
}

import newVips from "wasm-vips";
export const vips = await newVips({

	// Necessary per Feb 2023 in order to enable SVG support
	// TODO: Should not be necessary in a future stable version
	dynamicLibraries: ["vips-jxl.wasm", "vips-heif.wasm", "vips-resvg.wasm"],

	// Necessary per 2022 to ensure that wasm-vips doesn't just print randomly to the console
	// TODO: In a future stable version, find a better solution to this
	print: stdout => {log(`From wasm-vips: ${stdout}`);},
	printErr: stderr => {log(`Error from wasm-vips: ${stderr}`);},
	preRun: module => {
		module.print = stdout => {log(`From wasm-vips: ${stdout}`);};
		module.printErr = stderr => {log(`Error from wasm-vips: ${stderr}`);};
	},
	postRunt: module => {
		module.print = stdout => {log(`From wasm-vips: ${stdout}`);};
		module.printErr = stderr => {log(`Error from wasm-vips: ${stderr}`);};
	},

});

export const defaultVipsForeignOptions = {
	access: vips.Access.sequential,
};

/**
 * A simple wrapper for accessing a new image file correctly.
 *
 * @param {AppFile} appFile - The file to open.
 * @param {object} options - Vips foreignload options.
 * @returns {vips.Image} - The image representation in Vips.
 */
export function vipsImageFromFile(appFile, options = {}){
	return vips.Image.newFromFile(appFile.workPath, { ...defaultVipsForeignOptions, ...options });
}

/**
 * A simple wrapper for accessing a new SVG image file correctly.
 *
 * @param {AppFile} appFile - The file to open.
 * @param {object} options - Vips foreignsvgload options.
 * @returns {vips.Image} - The image representation in Vips.
 */
export function vipsImageFromSvgFile(appFile, options = {}){
	return vips.Image.svgload(appFile.workPath, { ...defaultVipsForeignOptions, ...options });
}
