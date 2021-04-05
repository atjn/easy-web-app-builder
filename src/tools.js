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

export default {fileExists, getExtension, getFolderFiles, getAllItems, getEWAVersion};

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
