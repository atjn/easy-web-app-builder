/* global ewabConfig ewabRuntime */

/**
 * @file
 * fg.
 */

import path from "node:path";
import fs from "fs-extra";

import { hashElement as folderHash } from "folder-hash";
import objectHash from "object-hash";
import { getAllAppMarkupFiles } from "./tools.js";

export const coreFileExtensions = ["html", "htm", "css", "js", "mjs", "cjs", "json", "svg"];
import { log, bar } from "./log.js";

import { generateSW } from "workbox-build";

//const logObjectStyle = "background:rgb(22 27 34);color:rgb(240 246 252);padding:.2em .4em;border-radius:.5em";

/**
 * Links to the serviceworker from different parts of the project.
 */
async function link(){

	if(ewabConfig.serviceworker.clean || ewabConfig.serviceworker.add){

		bar.begin(ewabConfig.serviceworker.clean ? "Adding serviceworker cleaner" : "Linking to serviceworker");

		await fs.copy(path.join(ewabRuntime.sourcePath, "lib/workbox-window.js"), path.join(ewabConfig.workPath, ewabConfig.alias, "workbox-window.js"));

		log(`Adding the serviceworker elements to the project.`);
		await fs.copy(path.join(ewabRuntime.sourcePath, "lib/dialogs.js"), path.join(ewabConfig.workPath, ewabConfig.alias, "dialogs.js"));

		let adderCode = await fs.readFile(path.join(ewabRuntime.sourcePath, "lib/serviceworker-bridge.js"), "utf8");
		adderCode = adderCode.replace(/const settings = \{.*?\}/us, `const settings = ${JSON.stringify({
			alias: ewabConfig.alias,
			...ewabConfig.serviceworker,
		}, null, 2)}`);

		await fs.writeFile(path.join(ewabConfig.workPath, ewabConfig.alias, "serviceworker-bridge.js"), adderCode);

		bar(.1);

		for await (const { markupFile, markup } of getAllAppMarkupFiles()){
			log(`Adding serviceworker elements to ${markupFile}.`);

			const bridge = markup.window.document.createElement("script"); bridge.src = `${ewabConfig.alias}/serviceworker-bridge.js`; bridge.type = "module";
			markup.window.document.head.appendChild(bridge);
		
			await markupFile.write(markup.serialize());

		}

		bar.end(ewabConfig.serviceworker.clean ? "Added serviceworker cleaner" : "Linked to serviceworker");

	}

}


/**
 * Generates a serviceworker and injects it into the project.
 */
async function add(){

	if(ewabConfig.serviceworker.clean){

		log(`NOTE: Because the "clean" option is enabled, no serviceworker will be build.`);

	}else if(ewabConfig.serviceworker.add){

		bar.begin("Generating serviceworker");

		if(ewabConfig.serviceworker.debug) log("warning", `The serviceworker is set to output debug information in the client browser. This should NOT be published as a production build.`);

		const serviceworkerName = `${ewabConfig.alias}-serviceworker.js`;

		const workboxConfig = {
			globDirectory: ewabConfig.workPath,
			globPatterns: [ `**/*.{${coreFileExtensions.join(",")}}` ],
			swDest: path.join(ewabConfig.workPath, serviceworkerName),
			cacheId: ewabConfig.alias,
			cleanupOutdatedCaches: true,
			inlineWorkboxRuntime: true,
			mode: ewabConfig.serviceworker.debug ? "development" : "production",
			sourcemap: ewabConfig.serviceworker.debug,
		};


		/*
		Needs to check for these headers to determine if cache has been updated:
			'content-length',
			'etag',
			'last-modified',
			*/
		workboxConfig.runtimeCaching = [
			{
				urlPattern: ({ request }) => Boolean(["image", "font"].includes(request.destination)),
				handler: "CacheFirst",
				options: {
					cacheName: `${ewabConfig.alias}-static`,
					expiration: {
						maxAgeSeconds: 15,  //60* 60 * 24 * 20,
						purgeOnQuotaError: true,
					},
					plugins: [
						{
							cachedResponseWillBeUsed: true ? undefined : async ({ cacheName, request, cachedResponse }) => {

								if(cachedResponse){

									/**
									 * If the resource was cached more than 7 days ago (or it cannot be determined), update the resource in the cache.
									 * This check runs asynchronously to avoid slowing down the currently loading resource.
									 */
									(async () => {
										let refreshCache = false;

										if(!cachedResponse.headers.has("date")){
											refreshCache = true;
										}else{
											const cachedTime = (new Date(cachedResponse.headers.get("date"))).getTime();
											if(isNaN(cachedTime) || (Date.now() + (1000 * 60 * 60 * 24 * 7) > cachedTime)){
												refreshCache = true;
											}
										}refreshCache = false;

										if(refreshCache){
											caches.open(cacheName).then(async cache => {
												await cache.put(request, (await fetch(request)));
												return;
											}).catch(error => {
												console.log(error);
											});
										}
									})();

								}
								return cachedResponse;

							},
						},
					],
				},
			},
			{
				urlPattern: ({ request }) => Boolean(["document", "script", "style"].includes(request.destination)),
				handler: "StaleWhileRevalidate",
				options: {
					cacheName: `${ewabConfig.alias}-dynamic-core`,
					expiration: {
						maxAgeSeconds: 60 * 60 * 24 * 30,
						purgeOnQuotaError: true,
					},
					plugins: [
						{
							handlerWillStart: ewabConfig.serviceworker.debug ?
								async () => {
									console.warn("This file ↑ does not have a defined %ccachingType%c so EWAB is defaulting to %cdynamic%c.\nYou can read more about this issue here:", "", "", "", "");
								} :
								undefined,
						},
					],
				},
			},
		];
		
		const hash = {
			"sourceHash": (await folderHash(ewabConfig.workPath, {
				folders: {
					ignoreRootName: true, // ignore because the name of the temp work folder (rootName) changes on each run
				},
			})).hash,
			"config": objectHash({
				...workboxConfig,
				// this is necessary because these values would otherwise include the name of the temp work folder, which changes name on each run
				globDirectory: path.relative(ewabConfig.workPath, workboxConfig.globDirectory),
				swDest: path.relative(ewabConfig.workPath, workboxConfig.swDest),
			}),
		};

		await fs.ensureFile(path.join(ewabConfig.cachePath, "serviceworker-hash.json"));
		const cachedHash = await fs.readJson(path.join(ewabConfig.cachePath, "serviceworker-hash.json"), {throws: false});

		if(
			hash.sourceHash !== cachedHash?.sourceHash ||
			hash.config !== cachedHash?.config
		){
			bar(.01, "Generating serviceworker");

			await fs.emptyDir(path.join(ewabConfig.cachePath, "serviceworker"));

			await generateSW(workboxConfig);

			await fs.copy(path.join(ewabConfig.workPath, serviceworkerName), path.join(ewabConfig.cachePath, "serviceworker", serviceworkerName));
			if(ewabConfig.serviceworker.debug) await fs.copy(path.join(ewabConfig.workPath, `${serviceworkerName}.map`), path.join(ewabConfig.cachePath, "serviceworker", `${serviceworkerName}.map`));

		}else{

			bar(.05, "Inserting serviceworker");

			log(`Copying serviceworker from cache`);
			await fs.copy(path.join(ewabConfig.cachePath, "serviceworker", serviceworkerName), path.join(ewabConfig.workPath, serviceworkerName));
			if(ewabConfig.serviceworker.debug) await fs.copy(path.join(ewabConfig.cachePath, "serviceworker", `${serviceworkerName}.map`), path.join(ewabConfig.workPath, `${serviceworkerName}.map`));

		}

		await fs.writeJson(path.join(ewabConfig.cachePath, "serviceworker-hash.json"), hash);	

		bar.end("Added serviceworker");

	}

}

export default { link, add };
