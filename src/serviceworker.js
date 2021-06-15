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
import { log, bar } from "./log.js";

import { generateSW } from "workbox-build";

import jsdom from "jsdom";
import glob from "glob";

const logObjectStyle = "background:rgb(22 27 34);color:rgb(240 246 252);padding:.2em .4em;border-radius:.5em";

/**
 * Links to the serviceworker from different parts of the project.
 */
async function link(){

	if(ewaConfig.serviceworker.clean || ewaConfig.serviceworker.add){

		bar.begin(ewaConfig.serviceworker.clean ? "Adding serviceworker cleaner" : "Linking to serviceworker");

		log(`Adding the serviceworker register script to the project.`);
		let adderCode = await fs.readFile(path.join(EWASourcePath, "lib/serviceworker-bridge.js"), "utf8");
		adderCode = adderCode
			.replace(`mode = "add"`, `mode = "${ewaConfig.serviceworker.clean ? "clean" : "add"}"`)
			.replace(`alias = "ewa"`, `alias = "${ewaConfig.alias}"`)
			.replace(`debug = false`, `debug = ${ewaConfig.serviceworker.debug}`);

		await fs.writeFile(path.join(ewaConfig.workPath, ewaConfig.alias, "serviceworker-bridge.js"), adderCode);

		bar(.1);

		for(const markupPath of glob.sync("**/*.{html,htm}", {cwd: ewaConfig.workPath, absolute: true})){
			log(`Linking to the serviceworker bridge in ${path.relative(ewaConfig.workPath, markupPath)}.`);

			const html = new jsdom.JSDOM((await fs.readFile(markupPath)));

			const script = html.window.document.createElement("script"); script.src = `${ewaConfig.alias}/serviceworker-bridge.js`; script.type = "module"; script.defer = true;
			html.window.document.head.appendChild(script);
		
			await fs.writeFile(markupPath, html.window.document.documentElement.outerHTML);

		}

		bar.end(ewaConfig.serviceworker.clean ? "Added serviceworker cleaner" : "Linked to serviceworker");

	}

}


/**
 * Generates a serviceworker and injects it into the project.
 */
async function add(){

	if(ewaConfig.serviceworker.clean){

		log(`NOTE: Because the "clean" option is set to true, no serviceworker will be build.`);

	}else if(ewaConfig.serviceworker.add){

		bar.begin("Generating serviceworker");

		if(ewaConfig.serviceworker.debug) log("warning", `The serviceworker is set to output debug information in the client browser. This should NOT be published as a production build.`);

		const serviceworkerName = `${ewaConfig.alias}-serviceworker.js`;

		const workboxConfig = {
			globDirectory: ewaConfig.workPath,
			globPatterns: [ "**/*.{html,htm,css,js,mjs,cjs,json,svg}" ],
			globIgnores: ewaConfig.serviceworker.experience === "website" ? [ "**/*" ] : undefined,
			swDest: path.join(ewaConfig.workPath, serviceworkerName),
			cacheId: ewaConfig.alias,
			cleanupOutdatedCaches: true,
			inlineWorkboxRuntime: true,
			mode: ewaConfig.serviceworker.debug ? "development" : "production",
			sourcemap: ewaConfig.serviceworker.debug,
		};

		switch(ewaConfig.serviceworker.experience){
			case "website":
				workboxConfig.runtimeCaching = [
					{
						urlPattern: ({ request }) => Boolean(request.destination === "image"),
						handler: "StaleWhileRevalidate",
						options: {
							cacheName: `${ewaConfig.alias}-images`,
							expiration: {
								maxAgeSeconds: 60 * 60 * 24 * 30,
								purgeOnQuotaError: true,
							},
						},
					},
					{
						urlPattern: ({ request }) => Boolean(!["", "audio", "track", "video"].includes(request.destination)),
						handler: "NetworkFirst",
						options: {
							cacheName: `${ewaConfig.alias}-backup`,
							networkTimeoutSeconds: 15,
							expiration: {
								maxAgeSeconds: 60 * 60 * 24 * 30,
							},
						},
					},
				];
				break;
			case "app":
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
							cacheName: `${ewaConfig.alias}-static`,
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
							cacheName: `${ewaConfig.alias}-dynamic-core`,
							expiration: {
								maxAgeSeconds: 60 * 60 * 24 * 30,
								purgeOnQuotaError: true,
							},
							plugins: [
								{
									handlerWillStart: ewaConfig.serviceworker.debug ?
										async () => {
											console.warn("This file ↑ does not have a defined %ccachingType%c so EWA is defaulting to %cdynamic%c.\nYou can read more about this issue here:", "", "", "", "");
										} :
										undefined,
								},
							],
						},
					},
				];
		}
		
		const hash = {
			"sourceHash": (await folderHash(ewaConfig.workPath, {
				folders: {
					ignoreRootName: true, // ignore because the name of the temp work folder (rootName) changes on each run
				},
			})).hash,
			"config": objectHash({
				...workboxConfig,
				// this is necessary because these values would otherwise include the name of the temp work folder, which changes name on each run
				globDirectory: path.relative(ewaConfig.workPath, workboxConfig.globDirectory),
				swDest: path.relative(ewaConfig.workPath, workboxConfig.swDest),
			}),
		};

		await fs.ensureFile(path.join(ewaConfig.cachePath, "serviceworker-hash.json"));
		const cachedHash = await fs.readJson(path.join(ewaConfig.cachePath, "serviceworker-hash.json"), {throws: false});

		if(
			hash.sourceHash !== cachedHash?.sourceHash ||
			hash.config !== cachedHash?.config
		){
			bar(.01, "Generating serviceworker");

			await fs.emptyDir(path.join(ewaConfig.cachePath, "serviceworker"));

			await generateSW(workboxConfig);

			await fs.copy(path.join(ewaConfig.workPath, serviceworkerName), path.join(ewaConfig.cachePath, "serviceworker", serviceworkerName));
			if(ewaConfig.serviceworker.debug) await fs.copy(path.join(ewaConfig.workPath, `${serviceworkerName}.map`), path.join(ewaConfig.cachePath, "serviceworker", `${serviceworkerName}.map`));

		}else{

			bar(.05, "Inserting serviceworker");

			log(`Copying serviceworker from cache`);
			await fs.copy(path.join(ewaConfig.cachePath, "serviceworker", serviceworkerName), path.join(ewaConfig.workPath, serviceworkerName));
			if(ewaConfig.serviceworker.debug) await fs.copy(path.join(ewaConfig.cachePath, "serviceworker", `${serviceworkerName}.map`), path.join(ewaConfig.workPath, `${serviceworkerName}.map`));

		}

		await fs.writeJson(path.join(ewaConfig.cachePath, "serviceworker-hash.json"), hash);	

		bar.end("Added serviceworker");

	}

}

export default { link, add };
