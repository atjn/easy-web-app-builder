/* global ewaConfig ewaObjects */

/**
 * @file
 * 
 */

import path from "path";
import fs from "fs-extra";

import {hashElement} from "folder-hash";

import {EWASourcePath} from "./compat.js";
import {bar} from "./log.js";

import {generateSW} from "workbox-build";


export default {add};

/**
 * Generates a serviceworker and injects it into the project.
 */
async function add(){

	if(ewaConfig.serviceworker.add === true){

		bar.begin("Adding serviceworker", 0);

		const workboxConfig = {
			"globDirectory": ewaConfig.output,
			"globPatterns": [
				"**/*.{css,js,svg,html,json}",
			],
			"swDest": path.join(ewaConfig.cachePath, "serviceworker", `${ewaConfig.alias}-serviceworker.js`),
			"cacheId": ewaConfig.alias,
			"cleanupOutdatedCaches": true,
			"mode": "production",
			"sourcemap": false,

			"runtimeCaching": [
				{
					"urlPattern": /\.(?:png|jpg|jpeg|webp|avif|jxl)$/u,
					"handler": "CacheFirst",
					"options": {
						"cacheName": `${ewaConfig.alias}-images`,
						"expiration": {
							"maxAgeSeconds": 30 * 24 * 60 * 60,
						},
					},
				},
				{
					"urlPattern": /\.json$/u,
					"handler": "NetworkFirst",
					"options": {
						"cacheName": `${ewaConfig.alias}-content`,
						"networkTimeoutSeconds": 5,
					},
				},
			],

		};

		const hash = {
			"source_hash": (await hashElement(path.join(ewaConfig.rootPath, ewaConfig.output))).hash,
			"config": workboxConfig,
		};

		fs.ensureFileSync(path.join(ewaConfig.cachePath, "serviceworker-hash.json"));
		const cached_hash = fs.readJsonSync(path.join(ewaConfig.cachePath, "serviceworker-hash.json"), {throws: false});

		if(
			hash.source_hash !== cached_hash?.source_hash ||
			JSON.stringify(hash.config) !== JSON.stringify(cached_hash?.config)
		){
			bar(.05, "Generating serviceworker");

			await fs.emptyDir(path.join(ewaConfig.cachePath, "serviceworker"));

			await generateSW(workboxConfig);

		}

		bar(.9, "Adding serviceworker to project");

		fs.copySync(path.join(EWASourcePath, "./src/injectables/add-serviceworker.js"), path.join(ewaConfig.rootPath, ewaConfig.output, ewaConfig.alias, "add-serviceworker.js"));

		const script = ewaObjects.index.window.document.createElement("script"); script.src = `${ewaConfig.alias}/add-serviceworker.js`; script.type = "module"; script.async = "true"; //async doesnt work


		ewaObjects.index.window.document.head.appendChild(script);


		fs.copySync(path.join(ewaConfig.cachePath, "serviceworker"), path.join(ewaConfig.rootPath, ewaConfig.output));

		fs.writeJsonSync(path.join(ewaConfig.cachePath, "serviceworker-hash.json"), hash);	

		bar.end("Added serviceworker");

	}

}
