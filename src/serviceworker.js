/* global ewaConfig */

/**
 * @file
 * 
 */

import path from "path";
import fs from "fs-extra";

import {hashElement as folderHash} from "folder-hash";
import objectHash from "object-hash";

import {EWASourcePath} from "./compat.js";
import {bar} from "./log.js";

import {generateSW} from "workbox-build";

import jsdom from "jsdom";
import globModule from "glob";
const glob = globModule.glob;


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
			"sourceHash": (await folderHash(path.join(ewaConfig.rootPath, ewaConfig.output))).hash,
			"config": objectHash(workboxConfig),
		};

		fs.ensureFileSync(path.join(ewaConfig.cachePath, "serviceworker-hash.json"));
		const cachedHash = fs.readJsonSync(path.join(ewaConfig.cachePath, "serviceworker-hash.json"), {throws: false});

		if(
			hash.sourceHash !== cachedHash?.sourceHash ||
			hash.config !== cachedHash?.config
		){
			bar(.05, "Generating serviceworker");

			await fs.emptyDir(path.join(ewaConfig.cachePath, "serviceworker"));

			await generateSW(workboxConfig);

		}

		bar(.9, "Adding serviceworker to project");

		fs.copySync(path.join(EWASourcePath, "./src/injectables/add-serviceworker.js"), path.join(ewaConfig.rootPath, ewaConfig.output, ewaConfig.alias, "add-serviceworker.js"));

		for(const markupPath of glob.sync("**/*.html", {cwd: path.join(ewaConfig.rootPath, ewaConfig.output), absolute: true})){

			const html = new jsdom.JSDOM((await fs.readFile(markupPath)));

			const script = html.window.document.createElement("script"); script.src = `${ewaConfig.alias}/add-serviceworker.js`; script.type = "module"; script.async = "true"; //async doesnt work
			html.window.document.head.appendChild(script);
		
			await fs.writeFile(markupPath, html.window.document.documentElement.outerHTML);

		}

		fs.copySync(path.join(ewaConfig.cachePath, "serviceworker"), path.join(ewaConfig.rootPath, ewaConfig.output));

		fs.writeJsonSync(path.join(ewaConfig.cachePath, "serviceworker-hash.json"), hash);	

		bar.end("Added serviceworker");

	}

}
