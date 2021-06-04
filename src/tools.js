/* -global ewaConfig */

/**
 * @file
 * This file contains some common functions that are used across EWA.
 */

import path from "path";
import fs from "fs-extra";

//import glob from "glob";

import { EWASourcePath } from "./compat.js";


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
 * Gets the current version of the app.
 * 
 * @returns	{string}	- The current version of the app.
 */
export function getEWAVersion(){
	
	return fs.readJsonSync(path.join(EWASourcePath, "package.json")).version;

}

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
 * Checks if a file exists at a certain path.
 * 
 * @param	{string}	filePath	- Absolute path of the file to check.
 * 
 * @returns	{boolean}	- Wether the file exists or not.
 */
export function fileExists(filePath){

	return Boolean(fs.existsSync(filePath) && fs.lstatSync(filePath).isFile());

}

/*
export function getAllItems(includeDirectories = false){

	return glob.sync("**\/*", {cwd: ewaConfig.workPath, absolute: true}).filter(itemPath => {

		return includeDirectories ? true : fileExists(itemPath);
	
	});

}
*/
