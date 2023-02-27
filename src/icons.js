/* global ewabConfig ewabRuntime */

/**
 * @file
 * These functions handle.
 */

import path from "node:path";
import fs from "fs-extra";

import { log, bar } from "./log.js";
import { AppFile, getAllAppMarkupFiles, generateRelativeAppUrl } from "./tools.js";
import { supportedIconPurposes } from "./config.js";

/**
 * Identifies the app's icons and orders the minifier to generate appropriate sies and types.
 */
async function identify(){

	bar.begin("Identifying main icons");

	for(const [index, purpose] of supportedIconPurposes.entries()){

		bar((index + 1) / supportedIconPurposes.length, `Identifying main icon for purpose "${purpose}"`);

		if(ewabConfig.icons.source[purpose] && !(await (new AppFile({appPath: ewabConfig.icons.source[purpose]}).exists()))){
			log("warning", `Was unable to find the "${purpose}" source icon at "${ewabConfig.icons.source[purpose]}". Will instead find the most suitable source icon automagically.`);
			ewabConfig.icons.source[purpose] = "";
		}

		if(!ewabConfig.icons.source[purpose]){

			log(`No source icon with purpose "${purpose}" is defined in config, will instead find the biggest icon (in bytes) and use that as source icon.`);

			let bestIcon;
			let hasSVG = false;
			let largestIconSize = 0;

			for(const iconFile of ewabConfig.icons.list[purpose].map(appPath => new AppFile({appPath}))){

				const isSVG = Boolean(iconFile.extension === "svg");

				if(hasSVG && !isSVG){
					continue;
				}

				const iconSize = (await fs.stat(iconFile.workPath)).size;

				if(!hasSVG && isSVG){
					log(`Found an SVG icon. Will find the biggest SVG icon (in bytes) and use that as the "${purpose}" source icon.`);
					hasSVG = true;
					bestIcon = iconFile;
					largestIconSize = iconSize;
				}

				if(iconSize > largestIconSize){
					bestIcon = iconFile;
					largestIconSize = iconSize;
				}

			}

			if(bestIcon){
				log(`Decided to use "${bestIcon}" as source icon for purpose "${purpose}".`);
				ewabConfig.icons.source[purpose] = bestIcon.appPath;
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

		for await (const { markupFile, markup } of getAllAppMarkupFiles()){

			if(!markup?.window?.document?.head) continue;

			if(ewabConfig.icons.mergeMode.index === "override"){
				for(const existingLink of markup.window.document.head.querySelectorAll(`link[rel="icon"]`)){
					existingLink.remove();
				}
			}
			if(ewabConfig.icons.source.any){
				const iconMeta = ewabRuntime.appFilesMeta.get(new AppFile({appPath: ewabConfig.icons.source.any}));
				const iconVersionMeta = iconMeta.matchImageVersionClosestToWidth({encoding: {mimeType: "image/png"}}, 192, false, true);

				const newLink = markup.window.document.createElement("link");
				newLink.rel = "icon";
				newLink.href = generateRelativeAppUrl(markupFile, new AppFile({appPath: iconVersionMeta.path}));
				newLink.type = iconVersionMeta.encoding.mimeType;
				newLink.sizes = `${iconVersionMeta.width}x${iconVersionMeta.height}`;
				markup.window.document.head.appendChild(newLink);
			}
			
			await markupFile.write(markup.serialize());

		}

		bar(0, "Adding icons to manifest");
		// TODO: Add support for passing through an SVG file

		if(ewabConfig.icons.mergeMode.manifest === "override"){
			ewabRuntime.manifest.icons = [];
		}

		for(const purpose of supportedIconPurposes){
			if(!ewabConfig.icons.source[purpose]) continue;

			const iconMeta = ewabRuntime.appFilesMeta.get(new AppFile({appPath: ewabConfig.icons.source[purpose]}));

			for(const version of iconMeta.matchAllVersions({encoding: {mimeType: "image/png"}})){
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
