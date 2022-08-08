
/**
 * @file
 * This file contains some common functions that are used across EWAB.
 */

import path from "path";
import fs from "fs-extra";
import url from "url";

import lodash from "lodash";

//import glob from "tiny-glob";

/**
 * Has the same behavior as `import`, but also allows importing JSON files.
 * This feature is coming to Node: https://nodejs.org/docs/latest/api/esm.html#esm_json_modules.
 * 
 * @param	{string}	filePath	- Absolute path to the file being imported.
 * 
 * @returns	{any}	- Whatever the file was exporting. If it was a JSON file, the JSON is returned as text.
 * 
 */
export async function importAny(filePath){

	let data = {};

	switch(getExtension(filePath)){
		case "js": {
			const module = await import(filePath);
			data = module.default;
			break;
		}
		case "json": {
			data = await fs.readJson(filePath);
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
 * Takes any URL format referenced from any file and turns it into an absolute path to the actual file in the filesystem.
 * This does not fully adhere to the URL spec, but it is good enough for the purposes of this package.
 * 
 * @param	{string}	appRootPath		- Absolute path to the folder that acts as the root domain for the app. 
 * @param	{string}	fileFolderPath	- Absolute path to the file that the URL is referenced in (or the folder the file is in).
 * @param	{string}	URL 			- The URL from the file.
 * 
 * @returns	{string | null}	- An absolute path to the file that the URL was referring to, or null if the URL could not be parsed.
 */
export function resolveURL(appRootPath = "", fileFolderPath = "", URL = ""){

	const relativePath = URL.match(/^(?:https?:)?(?:\/\/)?(?:(?<=\/\/)[^/]+|[^/]+\.[^/]+(?=\/))?(?<path>.*)$/ui)?.groups?.path;

	if(fileExists(fileFolderPath)){
		fileFolderPath = path.join(fileFolderPath, "..");
	}

	if(!relativePath) return null;

	const absolutePath = path.join(
		relativePath.startsWith("/") ? appRootPath : fileFolderPath,
		relativePath,
	);

	return absolutePath;

}

/**
 * The NPM package file.
 */
export const ewabPackage = fs.readJsonSync(path.join(ewabSourcePath, "package.json"));

/**
 * Takes a file path/name and returns a standardised extension name with no leading dot and all lowercase letters.
 * 
 * @param	{string}	filePath	- Path of the file to get extension from.
 * 
 * @returns	{string}	- The file extension.
 */
export function getExtension(filePath){
	
	return path.extname(filePath).substring(1).toLowerCase();

}

/**
 * Returns an array of all file names in a folder.
 * 
 * @param	{string}	folderPath	- Absolute path of the folder to scan.
 * 
 * @returns	{string[]}	- An array of all file names in the folder.
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

/**.
 * Checks if a file exists at a certain path. (synhcronous)
 * 
 * @param	{string}	filePath	- Absolute path of the file to check.
 * 
 * @returns	{boolean}	- Wether the file exists or not.
 */
/**
 *
 * @param filePath
 */
export function fileExists(filePath){

	return Boolean(fs.existsSync(filePath) && fs.lstatSync(filePath).isFile());

}

/**
 * Checks if a folder exists at a certain path.
 * 
 * @param	{string}	folderPath	- Absolute path of the folder to check.
 * 
 * @returns	{boolean}	- Wether the folder exists or not.
 */
export function folderExists(folderPath){

	return Boolean(fs.existsSync(folderPath) && fs.lstatSync(folderPath).isDirectory());

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
 * @param {object} source	- The object to clone.
 * 
 * @returns {object} - The cloned object.
 */
export function deepClone(source){
	return lodash.cloneDeep(source);
}

/*
export function getAllItems(includeDirectories = false){

	return await glob("**\/*", {cwd: ewabConfig.workPath, absolute: true}).filter(itemPath => {

		return includeDirectories ? true : fileExists(itemPath);
	
	});

}
*/
