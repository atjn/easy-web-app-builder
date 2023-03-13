/* global ewabConfig ewabRuntime */

/**
 * @file
 * These functions handle.
 */

import path from "node:path";
import fs from "fs-extra";

import { log, bar } from "./log.js";
import { AppFile, getAllAppMarkupFiles, generateRelativeAppUrl, vips, vipsImageFromFile, defaultVipsForeignOptions } from "./tools.js";
import { supportedIconPurposes } from "./config.js";

import * as htmlparser2 from "htmlparser2";
import renderDOM from "dom-serializer";
import * as cssSelect from "css-select";
import * as domUtils from "domutils";

/**
 * Identifies the app's icons and orders the minifier to generate appropriate sies and types.
 */
async function identify(){

	bar.begin("Identifying main icons");

	const generatedIconsPath = `${ewabConfig.alias}/generatedIcons/`;

	for(const [index, purpose] of supportedIconPurposes.entries()){

		bar((index + 1) / supportedIconPurposes.length, `Identifying main icon for purpose "${purpose}"`);

		if(ewabConfig.icons.custom[purpose] && !(await (new AppFile({appPath: ewabConfig.icons.custom[purpose]}).exists()))){
			log("warning", `Was unable to find the "${purpose}" source icon at "${ewabConfig.icons.custom[purpose]}". Will instead find the most suitable source icon automagically.`);
			ewabConfig.icons.custom[purpose] = "";
		}

		if(!ewabConfig.icons.custom[purpose]){

			log(`No source icon with purpose "${purpose}" is defined in config, will instead find the biggest icon (in bytes) and use that as source icon.`);

			let bestIcon;
			let hasSVG = false;
			let largestIconSize = 0;

			for(const iconFile of ewabRuntime.iconsList[purpose].map(appPath => new AppFile({appPath}))){

				if(hasSVG && !iconFile.is("svg")){
					continue;
				}

				const iconSize = (await fs.stat(iconFile.workPath)).size;

				if(!hasSVG && iconFile.is("svg")){
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
				ewabConfig.icons.custom[purpose] = bestIcon.appPath;
			}else if(ewabConfig.icons.source.main){

				log(`Could not find any existing icon with purpose "${purpose}", will instead generate one from source icon.`);

				const mainIconFile = new AppFile({appPath: ewabConfig.icons.source.main});
				if(!mainIconFile.exists()){
					// WARN
				}

				let mainImage;

				/**
				 * Loads the main image with either Vips or htmlparse2 if the image is an SVG icon.
				 *
				 * @param {boolean} asSvg - Whether or not to load the image as SVG. Will detect automatically if not provided. 
				 * @returns {object} - The parsed image.
				 */
				async function loadMainImage(asSvg){
					asSvg ??= mainIconFile.is("svg");
					let mainImage;
					let mainImageSize;
					if(asSvg){
						mainImage = htmlparser2.parseDocument(await mainIconFile.read(), {xmlMode: true});
						mainImageSize = normalizeSvg(mainImage);
						if(mainImageSize.outer.width !== mainImageSize.outer.height){
							// expand image
						}
					}else{
						mainImage = vipsImageFromFile(mainIconFile);
						if(mainImage.width !== mainImage.height){
							// expand image
						}
						if(!mainImage.hasAlpha()){
							// WARN
						}
					}
					return mainImage;
				}

				let finalType;
				switch(purpose){
					case "any": {
						mainImage = await loadMainImage();
						if(mainIconFile.is("svg")){
							finalType = "vector";
						}else{
							finalType = "raster";
						}
						break;
					}
					case "maskable": {
						// The margin is required to be at least 0.1: https://www.w3.org/TR/appmanifest/#icon-masks
						// We make the margin slightly bigger because it looks nicer that way.
						const safeMarginPercent = 0.15;

						const backgroundColor = ewabConfig.icons?.source?.backgroundColor || ewabRuntime.manifest.background_color;
						const backupBackgroundImage = `<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="2048" viewBox="0 0 1 1"><rect width="1" height="1" fill="${backgroundColor || "white"}"/></svg>\n`;

						const backgroundImageFile = new AppFile({appPath: ewabConfig.icons.source.backgroundImage || ""});

						if(!backgroundColor && !ewabConfig.icons.source.backgroundImage){
							log("warning", `Was unable to find a background color or image for the app icon. Please add one as "background_color" in ${ewabConfig.manifestPath} or define it in the config file. `);
						}

						// TODO: warn if the background image is not fully transparent
						if(
							mainIconFile.is("svg") &&
							(
								(await backgroundImageFile.exists() && backgroundImageFile.is("svg")) ||
								!(await backgroundImageFile.exists())
							)
						){	
							mainImage = await loadMainImage(true);
							finalType = "vector";
							let backgroundImage;
							let backgroundImageSize;
							if(await backgroundImageFile.exists()){
								backgroundImage = htmlparser2.parseDocument(await backgroundImageFile.read(), {xmlMode: true});
								backgroundImageSize = normalizeSvg(backgroundImage);
							}else{
								backgroundImage = htmlparser2.parseDocument(backupBackgroundImage, {xmlMode: true});
								backgroundImageSize = normalizeSvg(backgroundImage);
							}
							if(backgroundImageSize.outer.width !== backgroundImageSize.outer.height){
								// crop image
							}
							const mainImageNode = cssSelect.selectOne("svg", mainImage, {xmlMode: true});
							mainImageNode.attribs.width = String(backgroundImageSize.inner.width * (1 - (2 * safeMarginPercent)));
							mainImageNode.attribs.height = String(backgroundImageSize.inner.height * (1 - (2 * safeMarginPercent)));
							mainImageNode.attribs.x = String(backgroundImageSize.innerOffset.x + (backgroundImageSize.inner.width * safeMarginPercent));
							mainImageNode.attribs.y = String(backgroundImageSize.innerOffset.y + (backgroundImageSize.inner.height * safeMarginPercent));

							const backgroundImageNode = cssSelect.selectOne("svg", backgroundImage, {xmlMode: true});
							domUtils.appendChild(backgroundImageNode, mainImageNode);

							mainImage = backgroundImage;
						}else{
							mainImage = await loadMainImage(false);
							finalType = "raster";
							let backgroundImage;
							if(await backgroundImageFile.exists()){
								backgroundImage = vipsImageFromFile(backgroundImageFile);
							}else{
								backgroundImage = vips.Image.svgloadBuffer(backupBackgroundImage, defaultVipsForeignOptions);
							}
							if(backgroundImage.width !== backgroundImage.height){
								const smallest = Math.min(backgroundImage.width, backgroundImage.height);
								backgroundImage = backgroundImage.crop(
									Math.round((backgroundImage.width - smallest) / 2),
									Math.round((backgroundImage.height - smallest) / 2),
									smallest,
									smallest,
								);
							}
							const allowedSizeFromIcon = mainImage.width * (1 + (2 * safeMarginPercent));
							if(backgroundImage.width > allowedSizeFromIcon){
								backgroundImage = backgroundImage.resize(allowedSizeFromIcon / backgroundImage.width);
							}else{
								mainImage = mainImage.resize(backgroundImage.width / allowedSizeFromIcon);
							}
							mainImage = backgroundImage.composite(mainImage, vips.BlendMode.over, {
								x: backgroundImage.width * safeMarginPercent,
								y: backgroundImage.height * safeMarginPercent,
							});
							
						}
						break;
					}
					case "monochrome": {
						mainImage = await loadMainImage();
						if(mainIconFile.is("svg")){
							finalType = "vector";
							// TODO: Investigate a better way to strip color data
							const svgNode = cssSelect.selectOne("svg", mainImage, {xmlMode: true});
							svgNode.attribs.style ||= "";
							if(svgNode.attribs.style?.length > 0 && svgNode.attribs.style.at(-1) !== ";") svgNode.attribs.style += ";";
							svgNode.attribs.style += "filter:brightness(0);";
						}else{
							finalType = "raster";
							const originalInterpretation = mainImage.interpretation;
							const withoutAlpha = mainImage.extractBand(0, { n: mainImage.bands - 1 });
							const alpha = mainImage.extractBand(mainImage.bands - 1);
							mainImage = withoutAlpha.colourspace(vips.Interpretation.lch)
								.linear([0, 0, 0], [0, 0, 0])
								.colourspace(originalInterpretation)
								.bandjoin(alpha);
						}
						break;
					}
				}
				const extensions = {
					vector: "svg",
					raster: "jxl",
				};
				const generatedFile = new AppFile({appPath: path.join(generatedIconsPath, `${purpose}.${extensions[finalType]}`)});
				await fs.ensureDir(path.join(generatedFile.workPath, ".."));
				switch(finalType){
					case "vector": {
						await generatedFile.write(renderDOM(mainImage, {xmlMode: true}));
						break;
					}
					case "raster": {
						mainImage.jxlsave(generatedFile.workPath, {lossless: true});
						break;
					}
				}
				ewabConfig.icons.custom[purpose] = generatedFile.appPath;

			}else{
				log("warning", `Was unable to find a source icon with purpose "${purpose}" to use for this webapp. Please link to one in the configuration file, ${ewabConfig.manifestPath}, ${ewabConfig.configName} or any HTML file. You can read more about purposes here: https://developer.mozilla.org/en-US/docs/Web/Manifest/icons#values`);
			}

		}

		if(ewabConfig.icons.custom[purpose]){

			//Ensure that icons are minified and converted correctly for use as an icon
			ewabConfig.fileExceptions.push({
				glob: ewabConfig.icons.custom[purpose],
				images: {
					compress: {
						enable: true,
						quality: "high",
					},
					convert: {
						enable: true,
						targetExtension: "png",
						targetExtensions: ["jxl", "png"],
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
			if(ewabConfig.icons.custom.any){
				const iconMeta = ewabRuntime.appFilesMeta.get(new AppFile({appPath: ewabConfig.icons.custom.any}));
				const iconVersionMeta = iconMeta.matchImageVersionClosestToWidth({encoding: {mimeType: "image/png"}}, 192, false, true);

				const newLink = markup.window.document.createElement("link");
				newLink.rel = "icon";
				newLink.href = generateRelativeAppUrl(markupFile, iconVersionMeta.appFile);
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
			if(!ewabConfig.icons.custom[purpose]) continue;

			const iconMeta = ewabRuntime.appFilesMeta.get(new AppFile({appPath: ewabConfig.icons.custom[purpose]}));
			
			for(const type of ["image/svg+xml", "image/jxl", "image/png"]){
				for(const version of iconMeta.matchAllImageVersions({encoding: {mimeType: type}})){
					if(type !== "image/svg+xml" && version.width !== 512 && version.width !== 192) continue;
					ewabRuntime.manifest.icons.push({
						src: path.relative(path.join(ewabConfig.manifestPath, ".."), path.relative(ewabConfig.workPath, version.appFile.workPath)),
						type: version.encoding.mimeType,
						sizes: type === "image/svg+xml" ? "any" : `${version.width}x${version.height}`,
						purpose,
					});
				}
			}

		}

		bar.end("Added icons");

	}

}

export default { identify, add };


/**
 * Ensures that the width/height and viewBox entries are set correctly.
 * By having all three entries set, any changes to them has a much more predictable result.
 *
 * @param {object} rootNode - The root node of the SVG, parsed with htmlparser2.
 * @returns {object} - The sizes of the SVG { outer: {width, height}, inner: {width, height}, innerOffset: {x, y}}.
 */
function normalizeSvg(rootNode){
	const svgNode = cssSelect.selectOne("svg", rootNode, {xmlMode: true});

	// Determining the size of an SVG is very complex. We let Vips deal with that.
	console.log(renderDOM(rootNode, {xmlMode: true}));
	const vipsImage = vips.Image.svgloadBuffer(renderDOM(rootNode, {xmlMode: true}), defaultVipsForeignOptions);
	svgNode.attribs.width = String(vipsImage.width);
	svgNode.attribs.height = String(vipsImage.height);

	const size = {
		outer: {
			width: vipsImage.width,
			height: vipsImage.height,
		},
	};

	parseViewBox: if(svgNode.attribs.viewBox){
		const parts = svgNode.attribs.viewBox.split(/\s+/u).filter(value => value).map(value => Number(value)).filter(value => !Number.isNaN(value));
		if(parts.length !== 4){
			delete svgNode.attribs.viewBox;
			break parseViewBox;
		}
		size.innerOffset = {
			x: parts[0],
			y: parts[1],
		};
		size.inner = {
			width: parts[2],
			height: parts[3],
		};
	}
	if(!svgNode.attribs.viewBox){
		svgNode.attribs.viewBox = `0 0 ${svgNode.attribs.width} ${svgNode.attribs.height}`;
		size.innerOffset = {
			x: 0,
			y: 0,
		};
		size.inner = size.outer;
	}

	return size;
}
