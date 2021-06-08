/* global ewaConfig ewaObjects */

/**
 * @file
 * This is the main file/function for the entire package. It mostly just calls other functions in the correct order.
 */

import path from "path";
import fs from "fs-extra";

import { log, bar } from "./log.js";
import config from "./config.js";
import cache from "./cache.js";
import files from "./files.js";
import serviceworker from "./serviceworker.js";
import icons from "./icons.js";
import minify from "./minify.js";


	
/**
 * This function is called when EWA starts.
 * It initiates global objects and controls the overall process.
 * 
 * @param	{object}	callConfig	- 
 */
export default async function (callConfig = {}){
	
	global.ewaConfig = {
		//Temporary interface config necessary in order to run logging. This will be overwritten when main config is generated
		interface: callConfig.interface ? callConfig.interface : "modern",
	};

	global.ewaObjects = {
		minifiedHashes: [],
	};

	global.ewaConfig = await config.generateMain(callConfig);

	log("modern-only", ""); 
	bar.begin(`Warming up`);
	bar(.1);

	await cache.ensure();

	bar(.6);

	await files.begin();

	bar.hide();
	log.header();

	await minify("remove");
	
	await icons.add();

	await minify("images");

	await serviceworker.add();

	await fs.writeJson(path.join(ewaConfig.workPath, ewaConfig.manifestPath), ewaObjects.manifest);

	await minify("files");


	bar.begin("Cooling down");

	await files.end();

	bar(.5);

	await cache.seal();

	bar.hide();
	log("modern-only", "");

}
