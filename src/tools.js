"use strict";

const path = require("path");
const fs = require("fs-extra");
const merge = require("deepmerge");
const {hashElement} = require("folder-hash");

module.exports = {

	/**
	 * Many of the CLI options directly affect options in the config object.
	 * This function maps the CLI options to a config object so they can be merged with the active config object.
	 * 
	 * @param	{object}	callConfig		- The CLI call configuration.
	 * 
	 * @returns	{object}					- A config object.
	 * 
	 */
	mapCallConfig: (callConfig) => {

		//const {baseConfig} = require("./elements.js");

		const config = {};

		if(callConfig?.useCache !== undefined) config.global.useCache = callConfig.useCache;

		return config;

	},

	/**
	 * Builds a config object for a given local file, taking into account any fileExceptions.
	 * 
	 * @param	{object}	config		- The main config object.
	 * @param	{string}	filePath	- Absolute path of the file to build a config for.
	 * 
	 * @returns	{object}				- The local config object for the folder.
	 * 
	 */
	generateFileConfig: (config, filePath) => {

		if(config.fileExceptionIndex.has(filePath)){
			config = merge(config, config.fileExceptionIndex.get(filePath));
		}

		return config;

	},

	/**
	 * Tries to find an easy-webapp config file in a given folder.
	 * 
	 * @param	{string}	folderPath		- Absolute path to folder.
	 * @param	{string}	[configName]	- Specify a custom config file name (with/without extension).
	 * 
	 * @returns	{object}					- An array of string rules.
	 * 
	 */
	getFolderConfig: (folderPath, configName = "ewaconfig") => {

		let config = {};

		for(const filePath of [
			path.join(folderPath, `${configName}.js`),
			path.join(folderPath, `${configName}.json`),
			path.join(folderPath, configName),
		]){
			if(fs.existsSync(filePath) && fs.lstatSync(filePath).isFile()){

				const extension = path.extname(filePath);

				if(extension === ".js"){
					config = require(path.join(folderPath, configName));
				}else if(extension === ".json"){
					config = fs.readJsonSync(path.join(folderPath, configName));
				}

				break;
			}
		}

		module.exports.validateConfig(config);

		return config;

	},

	/**
	 * Validates a config object. This method will not catch everything, but it will catch common issues with wrong types and misspellings.
	 * 
	 * @param	{object}				config	- The config object to validate.
	 * @param	{"main"|"file"|"call"}	type	- Which type of config it is.
	 * 
	 * @returns	{true | Error}					- If the config object passed validation.
	 * 
	 */
	validateConfig: (config) => {

		return Boolean(config);

		/*
		
		const {Schema} = require("validate");

		const mask = new Schema({

		});
		
		*/

	},

	/**
	 * Maps an array of complex rule objects to an array of simple string rules.
	 * 
	 * @param	{object[]}	rule_objects	- Array of rule objects.
	 * 
	 * @returns	{string[]}					- An array of string rules.
	 * 
	 */
	getRuleStringArray: (rule_objects) => {
		return rule_objects.map(rule => {
			return rule.file;
		});
	},

	/**
	 * Takes a file path/name and returns a standardised extension name with no leading dot and all lowercase letters.
	 * 
	 * @param	{string}	filePath	- Path of the file to get extension from.
	 * 
	 * @returns	{string}				- The file extension.
	 * 
	 */
	getExtension: (filePath) => {
		
		return path.extname(filePath).substring(1).toLowerCase();

	},

	/**
	 * Returns an array of all directory names in a directory (depth of one).
	 * 
	 * @param	{string}	directory	- Absolute path of the directory to scan.
	 * 
	 * @returns	{string[]}				- An array of all directory names in the directory.
	 * 
	 */
	getDirectories: (directory) => {
		return fs.readdirSync(directory, {withFileTypes: true})
			.filter(entry => entry.isDirectory())
			.map(entry => entry.name);
	},

	/**
	 * Returns an array of all file names in a directory.
	 * 
	 * @param	{string}	directory	- Absolute path of the directory to scan.
	 * 
	 * @returns	{string[]}				- An array of all file names in the directory.
	 * 
	 */
	getDirectoryFiles: (directory) => {
		return fs.readdirSync(directory, {withFileTypes: true})
			.filter(entry => !entry.isDirectory())
			.map(entry => entry.name);
	},

	/**
	 * Ensures that the basic cache scaffolding exists and removes preexisting cache files if they fail an integrity check.
	 * 
	 * @param	{string}	cachePath	- Absolute path to the cache folder.
	 * @param	{boolean}	[dumpCache]	- Option to always remove preexisting cache files and start with an empty cache.
	 * 
	 * @returns	{object}				- 
	 * 
	 */
	ensureCache: async (cachePath, dumpCache = false) => {

		await fs.ensureFile(path.join(cachePath, "cache-hash.json"));
		const cacheHash = await fs.readJson(path.join(cachePath, "cache-hash.json"), {throws: false});

		if(
			dumpCache === true ||
			(await module.exports.generateCacheHash(cachePath)) !== cacheHash?.hash ||
			"TODO - 1.1.0" !== cacheHash?.version
		){

			await fs.emptyDir(cachePath);
			
			await Promise.all(
				[
					"files",
					"icons",
					"icons-injectables",
					"serviceworker",
				].map(folder => fs.ensureDirSync(path.join(cachePath, folder))),
			);

		}

		return true;


	},

	/**
	 * Generates a standardised hash of the cache folder. Useful for integrity checks.
	 * 
	 * @param	{string}	cachePath	- Absolute path to the cache folder.
	 * 
	 * @returns	{object}				- A hash of the folder.
	 * 
	 */
	generateCacheHash: async (cachePath) => {

		return (await hashElement(
			cachePath,
			{
				"files": {
					"exclude": [
						"cache-hash.json",
					],
				},
			},
		)).hash;

	},

	/**
	 * Removes files from the cache which aren't part of the source project anymore.
	 * 
	 * @param	{string}	source_directory	- Absolute path of the project source folder.
	 * @param	{string}	cache_directory		- Absolute path of the easy-webapp cache folder.
	 * 
	 */
	cleanUnusedCacheFiles: async (source_directory, cache_directory) => {
		//await hashElement(source_directory); //{"files": {"exclude": ['*_hash.*']}}

		const getHashes = async (mount) => {

			const hashObject = typeof mount === "string" ? await hashElement(mount, {"encoding": "hex"}) : mount;

			let hashes = [];
			for(const element of hashObject.children){
				//console.log(element);
				if(element.children){
					hashes = [...hashes, ...(await getHashes(element))];
				}else{
					hashes.push(element.hash);
				}
			}
			//console.log(hashes.flat(10));
			return hashes;
		};

		let source_hashes = await getHashes(source_directory);

		source_hashes = [...source_hashes, ...(await getHashes(path.join(__dirname, "/injectables")))];

		const cache_removals = [];

		for(const file_path of module.exports.getDirectoryFiles(path.join(cache_directory, "/files"))){

			if(!source_hashes.includes(path.parse(file_path).name)){
				cache_removals.push(
					fs.remove(path.join(cache_directory, "/files", file_path)),
				);
			}

		}

		await Promise.allSettled(cache_removals);


	},

};
