/* global ewabConfig ewabRuntime */

/**
 * @file
 * Collection of file minifiers / removers to be used by main function.
 * Input is always an absolute file path, output is saved to cache with a hash-reference to the original file.
 */

import path from "node:path";
import fs from "fs-extra";
import { log, bar } from "./log.js";
import { File, resolveAppUrl, globApp, fatalError } from "./tools.js";
import { supportedImageExtensions } from "./config.js";

import newVips from "wasm-vips";
const vips = await newVips({

	// Necessary per Feb 2023 in order to enable SVG support
	// TODO: Should not be necessary in a future stable version
	dynamicLibraries: ["vips-jxl.wasm", "vips-heif.wasm", "vips-resvg.wasm"],

	// Necessary per 2022 to ensure that wasm-vips doesn't just print randomly to the console
	// TODO: In a future stable version, find a better solution to this
	print: stdout => {log(`From wasm-vips: ${stdout}`);},
	printErr: stderr => {log(`Error from wasm-vips: ${stderr}`);},
	preRun: module => {
		module.print = stdout => {log(`From wasm-vips: ${stdout}`);};
		module.printErr = stderr => {log(`Error from wasm-vips: ${stderr}`);};
	},
	postRunt: module => {
		module.print = stdout => {log(`From wasm-vips: ${stdout}`);};
		module.printErr = stderr => {log(`Error from wasm-vips: ${stderr}`);};
	},

});

import os from "node:os";

import { minify as htmlMinifier } from "html-minifier-terser";
import { minify as terser } from "terser";
import CleanCSS from "clean-css";
import { optimize as svgo } from "svgo";

import asyncPool from "tiny-async-pool";
import { getAllAppMarkupFiles, AppFile } from "./tools.js";

export default minify;



class ImageEncoding{

	constructor(entries = {}){
		for(const key of Object.keys(entries)){
			this[key] = entries[key];
		}
	}

	mimeType;
	extension;
	alternateExtensions = [];
	encodingEngine;
	vipsSaveFunction;
	relatedDocumentation = [];
	encodingOptions;

	get allExtensions(){
		return [ ...new Set([ this.extension, ...this.alternateExtensions ]) ];
	}

	get vipsDocumentation(){
		return `https://www.libvips.org/API/current/VipsForeignSave.html#vips-${this.vipsSaveFunction}`;
	}

	getEncodingOption = (subject, quality) => {
		return {
			...this.encodingOptions?.universal,
			...this.encodingOptions?.[subject]?.[quality],
		};
	};

}

class ImageEncodings{
	encodings = [
		new ImageEncoding({
			mimeType: "image/avif",
			extension: "avif",
			encodingEngine: "libaom",
			vipsSaveFunction: "heifsave",
			encodingOptions: {
				universal: {
					compression: vips.ForeignHeifCompression.av1,
					effort: 6,
				},
				auto: {
					high: {
						Q: 80,
					},
					balanced: {
						Q: 40,
					},
				},
				flat: {
					high: {
						Q: 90,
					},
					balanced: {
						Q: 80,
					},
				},
				organic: {
					high: {
						Q: 70,
					},
					balanced: {
						Q: 40,
					},
				},
			},
		}),
		new ImageEncoding({
			mimeType: "image/jxl",
			extension: "jxl",
			encodingEngine: "libjxl",
			vipsSaveFunction: "jxlsave",
			encodingOptions: {
				universal: {
					tier: 0,
				},
				auto: {
					high: {
						distance: 1,
					},
					balanced: {
						distance: 3,
					},
				},
				flat: {
					high: {
						distance: 1,
					},
					balanced: {
						distance: 3,
					},
				},
				organic: {
					high: {
						distance: 1,
					},
					balanced: {
						distance: 3,
					},
				},
			},
		}),
		new ImageEncoding({
			mimeType: "image/webp",
			extension: "webp",
			encodingEngine: "libwebp",
			vipsSaveFunction: "webpsave",
			relatedDocumentation: [
				"https://github.com/webmproject/libwebp/blob/main/man/cwebp.1", 
				"https://github.com/webmproject/libwebp/blob/main/src/enc/config_enc.c",
			],
			encodingOptions: {
				universal: {
					strip: true,
					effort: 5,
				},
				auto: {
					high: {
						Q: 90,
					},
					balanced: {
						Q: 80,
					},
				},
				flat: {
					high: {
						preset: vips.ForeignWebpPreset.text,
						lossless: true,
					},
					balanced: {
						preset: vips.ForeignWebpPreset.text,
						lossless: true,
						near_lossless: true,
						Q: 50,
					},
				},
				organic: {
					high: {
						preset: vips.ForeignWebpPreset.picture,
						Q: 85,
					},
					balanced: {
						preset: vips.ForeignWebpPreset.photo,
						Q: 75,
					},
				},
			},
		}),
		new ImageEncoding({
			mimeType: "image/jpeg",
			extension: "jpg",
			alternateExtensions: [ "jpeg" ],
			encodingEngine: "mozjpeg",
			vipsSaveFunction: "jpegsave",
			encodingOptions: {
				universal: {
					optimize_coding: true,
					interlace: true,
					strip: true,
					trellis_quant: true,
					overshoot_deringing: true,
					optimize_scans: true,
					quant_table: 3, // ImageMagick table, mozjpeg default
				},
				auto: {
					high: {
						Q: 90,
					},
					balanced: {
						Q: 80,
					},
				},
				flat: {
					high: {
						Q: 90,
					},
					balanced: {
						Q: 80,
					},
				},
				organic: {
					high: {
						Q: 85,
					},
					balanced: {
						Q: 70,
					},
				},
			},
		}),
		new ImageEncoding({
			mimeType: "image/png",
			extension: "png",
			encodingEngine: "spng",
			vipsSaveFunction: "pngsave",
			encodingOptions: {
				universal: {
					compression: 8,
				},
			},
		}),
	];

	match(keyword){
		for(const encoding of this.encodings){
			if(keyword === encoding.mimeType) return encoding;
			for(const extension of encoding.allExtensions) if(keyword === extension) return encoding;
			if(keyword === encoding.encodingEngine) return encoding;
		}
	}

}

const imageEncodings = new ImageEncodings();



/**
 * Minifies an aspect of the webapp. This can range from compressing images to deleting development-only files.
 * 
 * @param {"remove"|"images"|"files"} processType - What type of minification to run.
 */
async function minify(processType){

	let processName = {};

	switch(processType){
		case "remove":
			processName = {
				action: {
					present: "Removing",
					past: "Removed",
				},
				item: {
					singular: "item",
					plural: "items",
				},
			};
			break;
		case "files":
			processName = {
				action: {
					present: "Minifying",
					past: "Minified",
				},
				item: {
					singular: "file",
					plural: "files",
				},
			};
			break;
		case "images":
			processName = {
				action: {
					present: "Compressing",
					past: "Compressed",
				},
				item: {
					singular: "image",
					plural: "images",
				},
			};
			break;
	}

	bar.begin(`${processName.action.present} ${processName.item.plural}`);

	const itemProcessingQueue = [];
	let completedItemProcesses = 0;

	for await (const appFile of globApp("**/*")){

		if(["files", "images"].includes(processType) && !(await appFile.exists())) continue;

		if(
			(processType === "files" && !["html", "css", "js", "json", "svg"].includes(appFile.extension)) ||
			(processType === "images" && !supportedImageExtensions.includes(appFile.extension) && appFile.extension !== "svg")
		){
			continue;
		}

		const fileConfig = appFile.config;

		if(
			(processType === "remove" && fileConfig.files.remove !== true) ||
			(processType === "files" && fileConfig.files.minify !== true) ||
			(processType === "images" && fileConfig.images.compress.enable !== true && fileConfig.images.convert.enable !== true)
		){
			continue;
		}

		itemProcessingQueue.push({processType, appFile});

	}

	const concurrentThreads = Math.round(
		Math.max(
			Math.min(
				os.freemem() / 8000,
				os.cpus().length / 2,
			),
			1,
		),
	);

	for await (const result of asyncPool(
		concurrentThreads,
		itemProcessingQueue,
		processItem,
	)){
		completedItemProcesses++;
		bar(completedItemProcesses / itemProcessingQueue.length);
	}

	if(itemProcessingQueue.length === 0){
		bar.hide();
	}else{
		bar.end(`${processName.action.past} ${itemProcessingQueue.length} ${itemProcessingQueue.length === 1 ? processName.item.singular : processName.item.plural}`);
	}

	if(processType === "images" && ewabConfig.images.updateReferences){

		await updateImageReferences();

	}

}

/**
 * Processes a single file for minification.
 * 
 * @param {object} item - A custom object containing information about the item to be processed. 
 * @param {string} item.processType - What type of minification to run.
 * @param {AppFile} item.appFile - The file to process.
 */
async function processItem({processType, appFile}){

	if(fatalError(`processing of ${appFile}`)) return;

	try{

		const originalHash = await appFile.getHash();

		switch(processType){

			case "remove": {

				log(`Removing "${appFile}"`);
				await appFile.delete();

				return;

			}

			case "files": {

				await appFile.setCacheEntry();

				if(await appFile.cacheEntry.exists()){
					log(`Copying minified version of "${appFile}" from cache`);
				}else{

					switch(appFile.extension){
						case "html":
						case "htm": {

							log(`Minifying "${appFile}" with html-minifier-terser`);

							const minifiedHTML = await htmlMinifier(
								(await appFile.read()),
								{
									collapseBooleanAttributes: true,
									collapseWhitespace: true,
									conservativeCollapse: true,
									decodeEntities: true,
									minifyCSS: true,
									minifyJS: true,
									removeAttributeQuotes: true,
									removeComments: true,
									removeEmptyAttributes: true,
									removeOptionalTags: true,
									removeRedundantAttributes: true,
									removeScriptTypeAttributes: true,
									removeStyleLinkTypeAttributes: true,
									sortAttributes: true,
									sortClassName: true,
									useShortDoctype: true,
									...appFile.config.files.directOptions.html,
								},
							);
							
							await appFile.cacheEntry.write(minifiedHTML);

							break;
						}
						case "css": {

							const addSourceMap = appFile.config.files.addSourceMaps;

							log(`Minifying "${appFile}" with clean-css${addSourceMap ? ", and adding a sourcemap" : ""}`);

							const minifiedCSS = await new CleanCSS(
								{
									inline: false,
									level: {
										1: {
											all: true,
										},
										2: {
											mergeAdjacentRules: true,
											mergeIntoShorthands: true,
											mergeMedia: true,
											removeEmpty: true,
											removeDuplicateRules: true,
										},
									},
									...appFile.config.files.directOptions.css,
									returnPromise: true,
									sourceMap: addSourceMap,
									sourceMapInlineSources: true,
								},
							).minify(await appFile.read());

							await appFile.cacheEntry.write(`${minifiedCSS.styles}${addSourceMap ? `\n/*# sourceMappingURL=${appFile.sourceMap.fileToMapPath} */` : ""}`);

							const sourceMap = JSON.parse(minifiedCSS.sourceMap.toString());
							sourceMap.sources = [ appFile.sourceMap.mapToFilePath ];

							if(appFile.config.files.addSourceMaps){
								await appFile.sourceMap.cacheEntry.write(sourceMap);
							}

							break;
						}
						case "js":
						case "mjs":
						case "cjs": {

							const addSourceMap = appFile.config.files.addSourceMaps;
							const isModule = Boolean(appFile.extension === "mjs" || appFile.config.files.module);

							log(`Minifying "${appFile}" with terser as a ${isModule ? "module" : "non-module"}${addSourceMap ? ", and adding a sourcemap" : ""}`);

							const minifiedScript = await terser(
								{ [appFile.appPath]: await appFile.read() },
								{
									ecma: 2022,
									module: isModule,
									...appFile.config.files.directOptions.js,
									sourceMap: appFile.config.files.addSourceMaps ? {includeSources: true, url: appFile.sourceMap.fileToMapPath, root: path.join(appFile.appPath, "..")} : false,
								},
							);

							await appFile.cacheEntry.write(minifiedScript.code);

							if(appFile.config.files.addSourceMaps){
								appFile.sourceMap.cacheEntry.write(minifiedScript.map);
							}

							break;
						}
						case "json": {

							log(`Minifying "${appFile}" with V8 JSON parser`);
							
							await appFile.cacheEntry.write(await appFile.read("json"));

							break;
						}
						case "svg": {

							log(`Minifying "${appFile}" with SVGO`);

							const minifiedSvg = svgo(
								await appFile.read(),
								appFile.config.files.directOptions.svg,
							);
							
							await appFile.cacheEntry.write(minifiedSvg.data);

							break;
						}
					}

				}

				await appFile.cacheEntry.copyTo(appFile);

				if(appFile.config.files.addSourceMaps && await appFile.sourceMap.cacheEntry.exists()){
					await appFile.sourceMap.cacheEntry.copyTo(appFile.sourceMap);
				}

				return;
			
			}

			case "images": {

				log(`Compressing "${appFile}"..`);
				const reports = [];

				const originalImage = vips.Image.newFromFile(appFile.workPath);

				const originalSize = {
					width: originalImage.width,
					height: originalImage.height,
				};

				if(appFile.config.images.convert.enable) appFile.config.images.convert = processConvertSettings(appFile.config.images.convert, originalSize);

				const targetExtensions = [ ...new Set([ ...appFile.config.images.convert.targetExtensions, appFile.config.images.convert.targetExtension ]) ];

				const newImageMeta = ewabRuntime.imagesMeta.new({
					path: appFile.appPath,
					hash: originalHash,
					width: originalSize.width,
					height: originalSize.height,
					fileConfig: appFile.config,
				});

				for(const sizeConstraint of appFile.config.images.convert.enable ? appFile.config.images.convert.sizes : [ originalSize.width ]){

					try{

						const isSvg = Boolean(appFile.extension === "svg");

						const fittedImageSize = fitImageSizeToConstraints(originalSize, sizeConstraint, isSvg);

						const cachedImagePath = path.join(ewabConfig.cachePath, "items", `${originalHash}-${fittedImageSize.width}w`);

						let integrity = true;
						testIntegrity: for(const targetExtension of targetExtensions){
							const image = new File({ absolutePath: `${cachedImagePath}.${targetExtension}` });
							if(!(await image.exists())){
								integrity = false;
								break testIntegrity;
							}
						}
						if(integrity){
							reports.push(`${sizeConstraint}, (${targetExtensions.join(", ")}), copied from cache`);
						}else{

							const image = isSvg
								?	vips.Image.svgload(appFile.workPath, {scale: fittedImageSize.width / originalImage.width})
								:	originalImage.resize(fittedImageSize.width / originalImage.width);

							for(const targetExtension of targetExtensions){

								const targetEncoding = imageEncodings.match(targetExtension);

								if(!targetEncoding) throw new TypeError(`Does not support compressing to image with extension "${targetExtension}"`);

								// Save the image to cache
								const encodingOptions = {
									...targetEncoding.getEncodingOption(appFile.config.images.compress.subject, appFile.config.images.compress.quality),
									...appFile.config.images.encoderOptions[targetEncoding.encodingEngine],
								};
								image[targetEncoding.vipsSaveFunction](`${cachedImagePath}.${targetEncoding.extension}`, encodingOptions);

								const loggedOptions = [];
								for(const key of ["Q", "distance", "compression", "near_lossless", "lossless"]){
									const value = encodingOptions[key];
									if(value) loggedOptions.push(`${key}: ${value}`);
								}
								reports.push(`${sizeConstraint}, ${targetExtension}, compressed with settings ${loggedOptions.join(", ")}`);

							}
						
						}
						
						await Promise.all(targetExtensions.map(targetExtension => {
							const newImagePath = transformImagePath(appFile.workPath, fittedImageSize.width, {extension: targetExtension});
							const targetEncoding = imageEncodings.match(targetExtension);
							newImageMeta.newVersion({
								path: newImagePath,
								type: targetExtension,
								encoding: targetEncoding,
								width: fittedImageSize.width,
								height: fittedImageSize.height,
								constraint: sizeConstraint,
							});
							return fs.copy(`${cachedImagePath}.${targetExtension}`, newImagePath);
						}));
					
					}catch(error){

						log("warning", `Unable to compress "${appFile}".${ewabConfig.interface === "debug" ? "" : " Enable the debug interface to see more info."}`);

						log(`Error: ${error}`);
					}
					
				}

				if(!appFile.config.images.keepOriginal) await appFile.delete();

				log(`Completed compression of ${appFile}:`);
				for(const report of reports) log(`  ${report}`);

				return;

			}

		}

		ewabRuntime.minifiedItemHashes.push(originalHash);

	}catch(error){

		if(String(error).includes("has an unsupported format")){
			log("warning", `Was not able to read "${appFile}", it will not be compressed.`);
		}else{
			log("warning", `Unable to compress "${appFile}".${ewabConfig.interface === "debug" ? "" : " Enable the debug interface to see more info."}`);
		}
		log(`Error: ${error}`);

	}

}

/**
 * Updates references to images in other documents, such as HTML and CSS.
 * This is not perfect, it won't catch every link.
 */
async function updateImageReferences(){

	for await (const sheetFile of globApp("**/*.css")){

		let css = await sheetFile.read();

		// Find any background properties using simple url(), and convert them to image-set() if it is necessary 
		let match = true;
		while(match){
			const imageSet = css.match(/(?<match>(?<pre>\bbackground(?:-image)?\s*?:\s*?[,\s])url\(\s*?["']?(?<url>[^\s]*?)["']?\s*?\)(?<pro>\s*?[;}]))/uisg);
			if(imageSet === null){
				match = false;
				break;
			}

			const imagePath = resolveAppUrl(
				sheetFile,
				imageSet.groups.url,
			);

			const imageMeta = ewabRuntime.imagesMeta.findByPath(imagePath);
			const fileConfig = imageMeta?.fileConfig;

			if(!imageMeta){
				log(`In ${sheetFile}: URL ${imageSet.groups.url} at index ${imageSet.index} does not correlate with a minified image, aborting upgrade to an image-set.`);
			}if(!fileConfig.images.convert.enable){
				log(`In ${sheetFile}: URL ${imageSet.groups.url} at index ${imageSet.index} does not have a modifed URL, so no reason to upgrade to image-set.`);
			}else{

				log(`In ${sheetFile}: upgrading url to image-set for URL ${imageSet.groups.url} at index ${imageSet.index}.`);

				css = css.replace(imageSet.groups.match, `${imageSet.groups.pre}image-set("${imageSet.groups.url}")${imageSet.groups.pro}`);
			}
		}

		// Find any image-set and expand it with extra images + fallback versions
		match = true;
		while(match){
			const imageSet = css.match(/(?<match>(?<pre>\bbackground-image\s*?:[^;]*?\s*?[,\s])(?:image-set)\(\s*?["']?(?<url>[^\s'"]*?)["']?\s*?\)(?<pro>[^{]*?[;}]))/uisg);
			if(imageSet === null){
				match = false;
				break;
			}

			const imagePath = resolveAppUrl(
				sheetFile,
				imageSet.groups.url,
			);

			const imageMeta = ewabRuntime.imagesMeta.findByPath(imagePath);
			const fileConfig = imageMeta?.fileConfig;

			if(!imageMeta){
				log(`In ${sheetFile}: URL ${imageSet.groups.url} at index ${imageSet.index} does not correlate with a minified image, aborting upgrade of the image-set.`);
			}if(!fileConfig.images.convert.enable){
				log(`In ${sheetFile}: URL ${imageSet.groups.url} at index ${imageSet.index} does not have a modifed URL, so no reason to upgrade image-set.`);
			}else{

				log(`In ${sheetFile}: upgrading image-set for URL ${imageSet.groups.url} at index ${imageSet.index}.`);

				const fallBackImage = imageMeta.matchVersion({
					constraint: fileConfig.images.convert.size,
					encoding: fileConfig.images.convert.targetExtension,
				});
				const fallBackImageUrl = transformImagePath(imageSet.groups.url, fallBackImage.width, fallBackImage.encoding);

				const lines = [];

				const ewabMark = `/*${ewabConfig.alias}*/`;

				// Support details: https://caniuse.com/css-image-set

				// Chromium support
				lines.push(`${imageSet.groups.pre}-webkit-image-set(url("${fallBackImageUrl}") ${ewabMark} )${imageSet.groups.pro}`);

				// WebKit support
				lines.push(`${imageSet.groups.pre}image-set("${fallBackImageUrl}") ${ewabMark} )${imageSet.groups.pro}`);

				// Gecko support, best so far
				const imageTypeLines = [];
				for(const extension of imageMeta.fileConfig.images.convert.targetExtensions){
					const encoding = imageEncodings.match(extension);
					const image = imageMeta.matchVersion({
						constraint: fallBackImage.constraint,
						encoding,
					});
					const newUrl = transformImagePath(imageSet.groups.url, image.width, image.encoding);
					imageTypeLines.push(`"${newUrl}" type("${encoding.mimeType}")`);
				}
				lines.push(`${imageSet.groups.pre}image-set(${ imageTypeLines.join(`,\n`) }) ${ewabMark} )${imageSet.groups.pro}`);
				
				// Ideal setup, not supported anywhere yet
				const imageWidthTypeLines = [];
				for(const extension of imageMeta.fileConfig.images.convert.targetExtensions){
					const encoding = imageEncodings.match(extension);
					for(const size of imageMeta.fileConfig.images.convert.sizes){
						const image = imageMeta.matchVersion({
							constraint: size,
							encoding,
						});
						const newUrl = transformImagePath(imageSet.groups.url, image.width, image.encoding);
						imageWidthTypeLines.push(`"${newUrl}" type("${encoding.mimeType}") ${image.width}w`);
					}
				}
				lines.push(`${imageSet.groups.pre}image-set(${ imageTypeLines.join(`,\n`) }) ${ewabMark} )${imageSet.groups.pro}`);

		

				css = css.replace(imageSet.groups.match, lines.join(`\n`));


			}
			

		}

		await sheetFile.write(css);


	}
	
	for await (const { markupFile, markup } of getAllAppMarkupFiles()){

		if(markup?.window?.document){

			for(const img of markup.window.document.querySelectorAll("picture > img")){
					
				const srcPath = resolveAppUrl(
					markupFile,
					img.src ?? "",
				);
				const srcsetPath = resolveAppUrl(
					markupFile,
					img.srcset ?? "",
				);

				let imagePath;
				let srcType;

				if(ewabRuntime.minifiedItemsMeta.has(srcsetPath)){
					imagePath = srcsetPath;
					srcType = "srcset";
				}else if(ewabRuntime.minifiedItemsMeta.has(srcPath)){
					imagePath = srcPath;
					srcType = "src";
				}else{
					continue;
				}
				const itemMeta = ewabRuntime.minifiedItemsMeta.get(imagePath);
				const fileConfig = itemMeta.fileConfig;
				const url = img[srcType];

				if(fileConfig.images.updateReferences){

					for(const targetExtension of fileConfig.images.convert.targetExtensions){
						const newURL = url.replace(/\.\w+$/u, `.${targetExtension}`);
						const mimeType = `image/${targetExtension === "jpg" ? "jpeg" : targetExtension}`;

						if(targetExtension === fileConfig.images.convert.targetExtensions[fileConfig.images.convert.targetExtensions.length - 1]){
							img[srcType] = newURL;
						}else{
							const source = markup.window.document.createElement("source");
							source[srcType] = newURL;
							source.type = mimeType;

							img.parentElement.insertBefore(source, img);
						}

					}

				}

			}

			for(const img of markup.window.document.querySelectorAll("img, picture > source")){

				if((/^\s*[^,\s]+$/u).test(img.srcset)){

					const imagePath = resolveAppUrl(
						markupFile,
						img.srcset,
					);

					if(ewabRuntime.minifiedItemsMeta.has(imagePath)){

						const itemMeta = ewabRuntime.minifiedItemsMeta.get(imagePath);
						const fileConfig = itemMeta.fileConfig;

						if(fileConfig.images.compress.enable && fileConfig.images.convert){
							//fileConfig.images.convert = processConvertSettings(fileConfig.images.convert, imagePath);

							if(fileConfig.images.convert.addSizesTagToImg && fileConfig.images.convert.sizes) img.sizes = img.sizes ?? fileConfig.images.convert.sizes;

							const srcset = [];

							for(const size of fileConfig.images.convert.resizeTo){
								srcset.push(`${img.srcset.replace(/\.\w+$/u, `-${size.width}w$&`)} ${size.width}w`);
							}

							img.srcset = srcset.join(", ");

						}

					}

				}

			}

		}

		await markupFile.write(markup.serialize());

	}

}

/**
 * Processes the EWAB convert config for an image.
 * Augments the list of sizes the image should be resized to.
 * 
 * @param {object}	convertConfig	- The image convertConfig from its fileConfig.
 * @param {object}	originalSize	- The original size of the image.
 * 
 * @returns {object} - The processed convertConfig.
 */
function processConvertSettings(convertConfig, originalSize){

	if(!convertConfig.size){
		convertConfig.size = Math.max(
			Math.min(originalSize.width, 1920),
			Math.min(originalSize.height, 1920), 
		);
		//log(`No fallback size set in config, so decided that ${convertConfig.fallbackSize} pixels was reasonable.`);
	}
	convertConfig.size = Math.min(convertConfig.size, convertConfig.maxSize);

	if(ewabConfig.images.keepOriginal) convertConfig.sizes.push(Math.max(originalSize.width, originalSize.height));

	convertConfig.sizes.push(convertConfig.size);

	// Remove duplicates
	convertConfig.sizes = [ ...new Set(convertConfig.sizes) ];

	let extraSizes = [
		convertConfig.maxSize,
		7680, // Full screen 8K UHD Landscape
		4320, // Full screen 8K UHD Portrait
		5120, // Full screen 5K UHD Landscape
		2880, // Full screen 5K UHD Portrait
		3840, // Full screen 4K UHD Landscape
		2160, // Full screen 4K UHD Portrait
		2560, // Full screen QHD Landscape
		1440, // Full screen QHD Portrait
		1920, // Full screen SHD Landscape
		1080, // Full screen SHD Portrait
		512,  // Medium size image
		265,  // Small image
		196,  // Large icon
		128,  // Medium icon
		64,   // Small icon
		32,   // Very small icon
		16,   // Very small icon
		convertConfig.minSize,
	];

	// Make sure no extra image is larger or smaller than alllowed
	extraSizes = extraSizes.filter(size => {
		if(size > convertConfig.maxSize) return false;
		if(size < convertConfig.minSize) return false;
		return true;
	});

	// Make sure they are sorted from largest to smallest to make sure largeer images
	// exclude smaller images, and not vice-versa
	extraSizes.sort((a, b) => {return b - a;});

	// Add extra sizes unless they are pretty close to an existing size
	for(const extraSize of extraSizes){
		let include = true;
		findSimilar: for(const size of convertConfig.sizes){
			if(size * (1 + convertConfig.steps) >= extraSize && extraSize >= size * convertConfig.steps){
				include = false;
				break findSimilar;
			}
		}
		if(include) convertConfig.sizes.push(extraSize);
	}

	convertConfig.sizes.sort((a, b) => {return b - a;});

	return convertConfig;
}

/**
 *
 * @param path
 * @param width
 * @param encoding
 */
function transformImagePath(path, width, encoding){
	return path.replace(/(?:-\d+?w)?(?:\.\w+)?\s*?$/ui, `${ typeof width === "number" ?  `-${width}w` : "" }.${encoding.extension}`);
}

/**
 * Takes a specific image size, and makes sure it is neither wider, nor taller than the given constraint size, while preserving aspect ratio.
 * By default, the image will not be resized to be larger than it's original size. This can be enabled by setting `allowOversizing` to true.
 * 
 * @param {object}	imageSize			- The current image size.
 * @param {number}	imageSize.height	- The current image height.
 * @param {number}	imageSize.width		- The current image width.
 * @param {number}	imageConstraint		- The constraint (both height and width).
 * @param {boolean}	allowOversizing		- Whether or not the image is allowed to become larger than it's original size.
 * 
 * @returns {object} - The new image size, fitted to the constraints.
 */
function fitImageSizeToConstraints(imageSize, imageConstraint, allowOversizing = false){

	const resizeRatios = [
		imageConstraint / imageSize.height,
		imageConstraint / imageSize.width,
	];
	if(!allowOversizing) resizeRatios.push(1);

	const resizeRatio = Math.min(...resizeRatios);

	return {
		height: Math.round( imageSize.height * resizeRatio ),
		width: Math.round( imageSize.width * resizeRatio ),
	};

}


export class ImagesMeta{
	images = [];

	new(keys){
		const newImage = new ImageMeta(keys);
		this.images.push(newImage);
		return newImage;
	}

	findByPath(path){
		for(const image of this.images){
			if(image.path === path){
				return image;
			}
		}
	}

	findByHash(hash){
		for(const image of this.images){
			if(image.hash === hash){
				return image;
			}
		}
	}

}

class ImageVersion{

	constructor(entries = {}){
		for(const key of Object.keys(entries)){
			this[key] = entries[key];
		}
	}

	path;
	encoding;
	width;
	height;
	constraint;
}

class ImageMeta extends ImageVersion{
	constructor(keys){
		super(keys);
	}
	hash;
	fileConfig;
	versions = [];

	newVersion(keys){
		const newVersion = new ImageVersion(keys);
		this.versions.push(newVersion);
		return newVersion;
	}

	matchVersionClosestToWidth(entries, desiredWidth, canBeSmaller, canBeLarger){
		const candidates = this.matchAllVersions(entries);

		let bestCandidate;
		for(const version of candidates){
			const delta = version.width - desiredWidth;
			if(!bestCandidate || Math.abs(delta) < Math.abs(bestCandidate.width - desiredWidth)){
				if( (canBeSmaller || delta >= 0) && (canBeLarger || delta <= 0) ){
					bestCandidate = version;
				}
			}
		}
		return bestCandidate;
	}

	matchVersion(entries = {}){
		return this.matchAllVersions(entries).next();
	}

	*matchAllVersions(entries = {}){
		for(const version of this.versions){
			let matches = true;
			for(const key of Object.keys(entries)){
				if(key === "encoding"){
					if(version.encoding.mimeType !== entries.encoding.mimeType) matches = false;
				}else{
					if(version[key] !== entries[key]) matches = false;
				}
			}
			if(matches) yield version;
		}
	}

}

