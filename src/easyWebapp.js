/* global ewaConfig ewaObjects */

/**
 * @file
 * Main function.
 */

import path from "path";
import fs from "fs-extra";

import {log, bar, c} from "./log.js";
import config from "./config.js";
import cache from "./cache.js";
import appSource from "./appSource.js";
import serviceworker from "./serviceworker.js";
import icons from "./icons.js";
import minify from "./minify.js";


	
/**
 * Desc.
 * 
 * @param {object} callConfig - Can override some of the options found in a config file.
 */
export default async function easyWebapp(callConfig = {}){
	
	global.ewaConfig = {
		//Temporary interface config necessary in order to run logging, this will be overridden when main config is generated
		interface: callConfig.interface ? callConfig.interface : "modern",
	};

	global.ewaObjects = {
		minifiedHashes: [],
	};

	bar.begin(`Warming up`);

	global.ewaConfig = await config.generateMain(callConfig);

	log("modern", ""); 

	await cache.ensure();
	
	log(`Copying source files (${path.join(ewaConfig.source)}) to '${path.join(ewaConfig.output)}'`);
	await fs.ensureDir(path.join(ewaConfig.rootPath, ewaConfig.source));
	await fs.emptyDir(path.join(ewaConfig.rootPath, ewaConfig.output));
	await fs.copy(path.join(ewaConfig.rootPath, ewaConfig.source), path.join(ewaConfig.rootPath, ewaConfig.output));
	await fs.ensureDir(path.join(ewaConfig.rootPath, ewaConfig.output, ewaConfig.alias));
	await fs.ensureDir(path.join(ewaConfig.rootPath, ewaConfig.output, ewaConfig.alias, "sourceMaps"));

	appSource.ensure();

	bar.end();
	log("basic", `${c.black.bgCyan(" easy-webapp ")} Building webapp`);

	await minify("remove");
	
	await icons.add();

	await minify("images");

	await serviceworker.add();

	await fs.writeJson(path.join(ewaConfig.rootPath, ewaConfig.output, ewaConfig.manifest), ewaObjects.manifest);

	await minify("files");

	bar.begin("Cooling down");

	await cache.seal();

	bar.end();
	log("modern", "");

}
