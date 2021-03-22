"use strict";

const path = require("path");
const fs = require("fs-extra");
const {hashElement} = require("folder-hash");

module.exports = {

	/**
	 * Maps an array of complex rule objects to an array of simple string rules.
	 * 
	 * @param	{object[]}	rule_objects	- Array og rule objects.
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
	 * Removes files from the cache which aren't part of the source project anymore.
	 * 
	 * @param	{string}	source_directory	- Absolute path of the project source folder.
	 * @param	{string}	cache_directory		- Absolute path of the epwa cache folder.
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
