/* global ewabConfig ewabRuntime */

/**
 * @file
 * These functions handle.
 */

import path from "path";
import fs from "fs-extra";


import jsdom from "jsdom";
import glob from "tiny-glob";


import { log, bar } from "./log.js";
import { getExtension, fileExists } from "./tools.js";
import { supportedIconPurposes } from "./config.js";

/**
 * Identifies the app's icons and orders the minifier to generate appropriate sies and types.
 */
async function identify(){

	bar.begin("Identifying main icons");

	for(const [index, purpose] of supportedIconPurposes.entries()){

		bar((index + 1) / supportedIconPurposes.length, `Identifying main icon for purpose "${purpose}"`);

		if(ewabConfig.icons.source[purpose] && !fileExists(path.join(ewabConfig.workPath, ewabConfig.icons.source[purpose]))){
			log("warning", `Was unable to find the "${purpose}" source icon at '${ewabConfig.icons.source[purpose]}'. Will instead find the most suitable source icon automagically.`);
			ewabConfig.icons.source[purpose] = "";
		}

		if(!ewabConfig.icons.source[purpose]){

			log(`No source icon with purpose "${purpose}" is defined in config, will instead find the biggest icon (in bytes) and use that as source icon.`);

			let bestIconPath = "";
			let hasSVG = false;
			let largestIconSize = 0;

			for(const iconPath of ewabConfig.icons.list[purpose].map(relativePath => path.join(ewabConfig.workPath, relativePath))){

				const isSVG = Boolean(getExtension(iconPath) === "svg");

				if(hasSVG && !isSVG){
					continue;
				}

				const iconSize = (await fs.stat(iconPath)).size;

				if(!hasSVG && isSVG){
					log(`Found an SVG icon. Will find the biggest SVG icon (in bytes) and use that as the "${purpose}" source icon.`);
					hasSVG = true;
					bestIconPath = iconPath;
					largestIconSize = iconSize;
				}

				if(iconSize > largestIconSize){
					bestIconPath = iconPath;
					largestIconSize = iconSize;
				}

			}

			if(bestIconPath){
				log(`Decided to use '${path.relative(ewabConfig.workPath, bestIconPath)}' as source icon for purpose "${purpose}".`);
				ewabConfig.icons.source[purpose] = path.relative(ewabConfig.workPath, bestIconPath);
			}else{
				log("warning", `Was unable to find a source icon with purpose "${purpose}" to use for this webapp. Please link to one in ${ewabConfig.manifestPath}, ${ewabConfig.configName} or any HTML file. You can read more about purposes here: https://developer.mozilla.org/en-US/docs/Web/Manifest/icons#values`);
			}

		}

		if(ewabConfig.icons.source[purpose]){

			//Ensure that icons are minified and converted correctly for use as an icon
			ewabConfig.fileExceptions.push({
				glob: ewabConfig.icons.source[purpose],
				images: {
					compress: {
						enable: true,
						quality: "high",
					},
					convert: {
						enable: true,
						targetExtension: "png",
						maxSize: Math.max(512, ewabConfig.images.convert.maxSize),
						minSize: Math.min(192, ewabConfig.images.convert.minSize),
						sizes: [ ...new Set([192, 512, ...ewabConfig.images.convert.sizes]) ],
					},
				},
			});


		}
	}

	bar.end("Identified main icons");

}


/**
 * Injects icons into the project where necessary.
 */
async function add(){

	if(ewabConfig.icons.add === true){

		bar.begin("Adding icons");

		bar(0, "Adding icons to HTML files");
		// TODO: Add support for passing through an SVG file

		for(const markupPath of await glob("**/*.{html,htm}", {cwd: ewabConfig.workPath, absolute: true})){

			const html = new jsdom.JSDOM(await fs.readFile(markupPath));

			if(!html?.window?.document?.head) continue;

			if(ewabConfig.icons.mergeMode.index === "override"){
				for(const existingLink of html.window.document.head.querySelectorAll(`link[rel="icon"]`)){
					existingLink.remove();
				}
			}
			if(ewabConfig.icons.source.any){
				const iconMeta = ewabRuntime.imagesMeta.findByPath(ewabConfig.icons.source.any);
				const iconVersionMeta = iconMeta.matchVersionClosestToWidth({encoding:{mimeType: "image/png"}}, 192, false, true);

				const newLink = html.window.document.createElement("link");
				newLink.rel = "icon";
				newLink.href = path.relative(path.join(markupPath, ".."), iconVersionMeta.path);
				newLink.type = iconVersionMeta.encoding.mimeType;
				newLink.sizes = `${iconVersionMeta.width}x${iconVersionMeta.height}`;
				html.window.document.head.appendChild(newLink);
			}
			
			await fs.writeFile(markupPath, html.serialize());

		}

		bar(0, "Adding icons to manifest");
		// TODO: Add support for passing through an SVG file

		if(ewabConfig.icons.mergeMode.manifest === "override"){
			ewabRuntime.manifest.icons = [];
		}

		for(const purpose of supportedIconPurposes){
			if(!ewabConfig.icons.source[purpose]) continue;

			const iconMeta = ewabRuntime.imagesMeta.findByPath(ewabConfig.icons.source[purpose]);

			for(const version of iconMeta.matchAllVersions({encoding:{mimeType: "image/png"}})){
				ewabRuntime.manifest.icons.push({
					src: path.relative(path.join(ewabConfig.manifestPath, ".."), path.relative(ewabConfig.workPath, version.path)),
					type: version.encoding.mimeType,
					sizes: `${version.width}x${version.height}`,
					purpose,
				});
			}

		}

		bar.end("Added icons");

	}

}

export default { identify, add };
