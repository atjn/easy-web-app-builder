/* global ewaConfig */

/**
 * @file
 * fg
 */

import path from "path";
import fs from "fs-extra";

import { hashElement as folderHash } from "folder-hash";
import objectHash from "object-hash";

import { EWASourcePath } from "./compat.js";
import { bar } from "./log.js";

import { generateSW } from "workbox-build";

import jsdom from "jsdom";
import glob from "glob";


/**
 * Generates a serviceworker and injects it into the project.
 */
async function add(){

	if(ewaConfig.serviceworker.clean){

		bar.begin("Adding serviceworker cleaner", 0);

		fs.copySync(path.join(EWASourcePath, "./src/injectables/remove-serviceworker.js"), path.join(ewaConfig.workPath, ewaConfig.alias, "remove-serviceworker.js"));

		for(const markupPath of glob.sync("**/*.html", {cwd: ewaConfig.workPath, absolute: true})){

			const html = new jsdom.JSDOM((await fs.readFile(markupPath)));

			const script = html.window.document.createElement("script"); script.src = `${ewaConfig.alias}/remove-serviceworker.js`; script.type = "module"; script.async = "true"; //async doesnt work
			html.window.document.head.appendChild(script);
		
			await fs.writeFile(markupPath, html.window.document.documentElement.outerHTML);

		}

		bar.end("Added serviceworker cleaner");

	}else if(ewaConfig.serviceworker.add){

		bar.begin("Generating serviceworker", 0);

		const workboxConfig = {
			"globDirectory": ewaConfig.workPath,
			"globPatterns": [
				"**/*.{css,js,mjs,cjs,svg,html,json}",
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
			"sourceHash": (await folderHash(ewaConfig.workPath)).hash,
			"config": objectHash(workboxConfig),
		};

		await fs.ensureFile(path.join(ewaConfig.cachePath, "serviceworker-hash.json"));
		const cachedHash = await fs.readJson(path.join(ewaConfig.cachePath, "serviceworker-hash.json"), {throws: false});

		if(
			hash.sourceHash !== cachedHash?.sourceHash ||
			hash.config !== cachedHash?.config
		){
			bar(.05, "Generating serviceworker");

			await fs.emptyDir(path.join(ewaConfig.cachePath, "serviceworker"));

			await generateSW(workboxConfig);

		}

		bar(.9, "Adding serviceworker to project");

		let adderCode = await fs.readFile(path.join(EWASourcePath, "./src/injectables/add-serviceworker.js"), "utf8");

		adderCode = adderCode.replace(`const alias = "ewa";`, `const alias = "${ewaConfig.alias}";`);

		await fs.writeFile(path.join(ewaConfig.workPath, ewaConfig.alias, "add-serviceworker.js"), adderCode);

		for(const markupPath of glob.sync("**/*.html", {cwd: ewaConfig.workPath, absolute: true})){

			const html = new jsdom.JSDOM((await fs.readFile(markupPath)));

			const script = html.window.document.createElement("script"); script.src = `${ewaConfig.alias}/add-serviceworker.js`; script.type = "module"; script.async = "true"; //async doesnt work
			html.window.document.head.appendChild(script);
		
			await fs.writeFile(markupPath, html.window.document.documentElement.outerHTML);

		}

		await fs.copy(path.join(ewaConfig.cachePath, "serviceworker"), ewaConfig.workPath);

		await fs.writeJson(path.join(ewaConfig.cachePath, "serviceworker-hash.json"), hash);	

		bar.end("Added serviceworker");

	}

}

export default { add };
