/* global ewabConfig ewabRuntime */

/**
 * @file
 * These functions do most of the hard work related to managing the cache. A lot of other functions then use and manipulate the cache directly.
 */

import path from "node:path";
import fs from "fs-extra";
import { hashElement as folderHash } from "folder-hash";

import { ewabPackage, getFolderFiles } from "./tools.js";
import { log } from "./log.js";

export default { ensure, seal };

/**
 * Ensures that the basic cache scaffolding exists and removes preexisting cache files if they fail an integrity check.
 * 
 * @returns	{object}				- 
 */
async function ensure(){

	log("Making sure the cache folder is valid");

	await fs.ensureFile(path.join(ewabConfig.cachePath, "cache-hash.json"));
	const cacheHash = await fs.readJson(path.join(ewabConfig.cachePath, "cache-hash.json"), {throws: false});

	if(
		ewabConfig.useCache === false ||
		(await generateHash(ewabConfig.cachePath)) !== cacheHash?.hash ||
		ewabPackage.version !== cacheHash?.version ||
		ewabConfig.hash !== cacheHash?.config
	){

		log("The cache folder is either missing, corrupt, outdated, or disabled by user, so overwriting it with a clean one");

		await fs.emptyDir(ewabConfig.cachePath);
		
		await Promise.all(
			[
				"items",
				"serviceworker",
			].map(folder => fs.ensureDir(path.join(ewabConfig.cachePath, folder))),
		);

	}else{
		log("The cache folder and its contents seem to be valid");
	}

	return true;


}

/**
 * Cleans unused files from the cache and "seals" it with a hash, making it possible to detect alterations to the cache when running next time.
 * 
 * @returns	{object}	- A hash of the folder.
 */
async function seal(){

	if(ewabConfig.useCache){

		log("Cleaning and sealing cache to make it ready for next run");

		await fs.writeJson(
			path.join(ewabConfig.cachePath, "cache-hash.json"),
			{
				"hash": (await generateHash(ewabConfig.cachePath)),
				"version": ewabPackage.version,
				"config": ewabConfig.hash,
			},
		);

	}else{

		log("User has disabled cache, so removing it");

		fs.remove(ewabConfig.cachePath);

	}

}


/**
 * Generates a standardised hash of the cache folder. Useful for integrity checks.
 * 
 * @returns	{object}				- A hash of the folder.
 * 
 */
async function generateHash(){

	return (await folderHash(
		ewabConfig.cachePath,
		{
			"files": {
				"exclude": [
					"cache-hash.json",
				],
			},
		},
	)).hash;

}
