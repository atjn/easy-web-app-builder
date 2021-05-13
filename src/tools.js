/* global ewaConfig */

/**
 * @file
 * 
 */

import path from "path";
import fs from "fs-extra";

import globModule from "glob";
const glob = globModule.glob;

import {EWASourcePath} from "./compat.js";

export default {fileExists, getExtension, getFolderFiles, getAllItems, getEWAVersion, resolveURL};

/**
 * Takes any URL format referenced from any file and turns it into an absolute path to the actual file in the filesystem.
 * This does not fully adhere to the URL spec, but it is good enough for the purposes of this package.
 * 
 * @param	{string}	rootPath	- Absolute path to the folder that acts as the root domain for the app. 
 * @param	{string}	filePath	- Absolute path to the file that the URL is referenced in.
 * @param	{string}	URL 		- The URL from the file.
 * 
 * @returns	{string | null}	- An absolute path to the file that the URL was referring to, or null if the URL could not be parsed.
 */
function resolveURL(rootPath, filePath, URL){

	const relativePath = URL.match(/^(?:https?:)?(?:\/\/)?(?:(?<=\/\/)[^/]+|[^/]+\.[^/]+(?=\/))?(?<path>.*)$/ui)?.groups?.path;

	if(!relativePath) return null;

	const absolutePath = path.join(
		relativePath.startsWith("/") ? rootPath : path.join(filePath, ".."),
		relativePath,
	);

	return absolutePath;

}

/**
 * Gets the current version of the app.
 * 
 * @returns	{string}				- The current version of the app.
 * 
 */
function getEWAVersion(){
	
	return fs.readJsonSync(path.join(EWASourcePath, "package.json")).version;

}

/**
 * Takes a file path/name and returns a standardised extension name with no leading dot and all lowercase letters.
 * 
 * @param	{string}	filePath	- Path of the file to get extension from.
 * 
 * @returns	{string}				- The file extension.
 * 
 */
function getExtension(filePath){
	
	return path.extname(filePath).substring(1).toLowerCase();

}

/**
 * Returns an array of all file names in a folder.
 * 
 * @param	{string}	folderPath	- Absolute path of the folder to scan.
 * 
 * @returns	{string[]}				- An array of all file names in the folder.
 * 
 */
function getFolderFiles(folderPath){
	return fs.readdirSync(folderPath, {withFileTypes: true})
		.filter(entry => entry.isFile())
		.map(entry => entry.name);
}

/**
 * Checks if a file exists at a certain path.
 * 
 * @param	{string}	filePath	- Absolute path of the file to check.
 * 
 * @returns	{boolean}				- Wether the file exists or not.
 * 
 */
function fileExists(filePath){

	return Boolean(fs.existsSync(filePath) && fs.lstatSync(filePath).isFile());

}

function getAllItems(includeDirectories = false){

	return glob.sync("**/*", {cwd: path.join(ewaConfig.rootPath, ewaConfig.output), absolute: true}).filter(itemPath => {

		return includeDirectories ? true : fileExists(itemPath);
	
	});

}
