/* global ewabConfig */

/**
 * @file
 * Collection of file minifiers / removers to be used by main function.
 * Input is always an absolute file path, output is saved to cache with a hash-reference to the original file.
 */

import path from "path";
import fs from "fs-extra";
import { hashElement as folderHash } from "folder-hash";
import { log, bar } from "./log.js";
import { fileExists, getExtension, resolveURL } from "./tools.js";
import config, { supportedImageExtensions } from "./config.js";

import jsdom from "jsdom";



import newVips from "wasm-vips";
const vips = await newVips({
	print: (stdout) => {console.log("custom", stdout);},
	printErr: (stderr) => {console.log("custom", stderr);},
	preRun: module => {
		module.print = (stdout) => {console.log("custom", stdout);};
		module.printErr = (stderr) => {console.log("custom", stderr);};
	},
	postRunt: module => {
		module.print = (stdout) => {console.log("custom", stdout);};
		module.printErr = (stderr) => {console.log("custom", stderr);};
	},
});

import os from "os";


import glob from "tiny-glob";

import { minify as htmlMinifier } from "html-minifier-terser";
import { minify as terser } from "terser";
import CleanCSS from "clean-css";
import { optimize as svgo } from "svgo";

import asyncPool from "tiny-async-pool";
import { ewabRuntime } from "./ewab.js";

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
		/*
		new ImageEncoding({
			mimeType: "image/avif",
			extension: "avif",
			encodingEngine: "TODO",
			vipsSaveFunction: "avifsave",
			encodingOptions: {
				universal: {
				},
				auto: {
					high: {
					},
					balanced: {
					}
				},
				flat: {
					high: {
					},
					balanced: {
					},
				},
				organic: {
					high: {
					},
					balanced: {
					}
				},
			},
		}),
		*/
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
 * @param {"remove"|"images"|"files"}	type	- What type of minification to run.
 */
async function minify(type){

	let processName = {};

	switch(type){
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

	for(const itemPath of await glob("**/*", {cwd: ewabConfig.workPath, absolute: true})){

		if(["files", "images"].includes(type) && !fileExists(itemPath)) continue;

		const extension = getExtension(itemPath);

		if(
			(type === "files" && !["html", "css", "js", "json", "svg"].includes(extension)) ||
			(type === "images" && !supportedImageExtensions.includes(extension))
		){
			continue;
		}

		const fileConfig = config.generateForFile(itemPath);

		if(
			(type === "remove" && fileConfig.files.remove !== true) ||
			(type === "files" && fileConfig.files.minify !== true) ||
			(type === "images" && fileConfig.images.compress.enable !== true && fileConfig.images.convert.enable !== true)
		){
			continue;
		}

		itemProcessingQueue.push({path: itemPath, extension, type, fileConfig});

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

	if(type === "images" && ewabConfig.images.updateReferences){

		await updateImageReferences();

	}

}

/**
 * Processes a single file for minification.
 * 
 * @param {*}	item	- A custom object containing information about the item to be processed. 
 */
async function processItem(item){

	const itemRelativePath = path.relative(ewabConfig.workPath, item.path);

	try{

		const originalHash = (await folderHash(item.path, { "encoding": "hex" })).hash;

		switch(item.type){

			case "remove": {

				log(`Removing '${itemRelativePath}'`);
				await fs.remove(item.path);

				return;

			}

			case "files": {

				const fileMapPath = path.join(ewabConfig.workPath, ewabConfig.alias, "sourceMaps", `${originalHash}.${item.extension}.map`);
				const fileMapRelativePath = path.relative(path.join(item.path, ".."), fileMapPath);
				const itemPathRelativeToFileMap = path.join(path.relative(path.join(fileMapPath, ".."), item.path));
				const itemFolderPathRelativeToFileMap = path.join(itemPathRelativeToFileMap, "..");

				const cachedFilePath = path.join(ewabConfig.cachePath, "items", `${originalHash}.${item.extension}`);
				const cachedFileMapPath = `${cachedFilePath}.map`;

				if(fileExists(cachedFilePath)){
					log(`Copying minified version of '${itemRelativePath}' from cache`);
				}else{

					switch(item.extension){
						case "html":
						case "htm": {

							log(`Minifying '${itemRelativePath}' with html-minifier-terser`);

							const minifiedHTML = await htmlMinifier(
								(await fs.readFile(item.path, "utf8")),
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
									...item.fileConfig.files.directOptions.html,
								},
							);
							
							await fs.writeFile(
								cachedFilePath,
								minifiedHTML,
							);

							break;
						}
						case "css": {

							const addSourceMap = item.fileConfig.files.addSourceMaps;

							log(`Minifying '${itemRelativePath}' with clean-css${addSourceMap ? ", and adding a sourcemap" : ""}`);

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
									...item.fileConfig.files.directOptions.css,
									returnPromise: true,
									sourceMap: addSourceMap,
									sourceMapInlineSources: true,
								},
							).minify(await fs.readFile(item.path));

							await fs.writeFile(
								cachedFilePath,
								`${minifiedCSS.styles}\n/*# sourceMappingURL=${fileMapRelativePath} */`,
							);

							const sourceMap = JSON.parse(minifiedCSS.sourceMap.toString());
							sourceMap.sources = [ itemPathRelativeToFileMap ];

							if(item.fileConfig.files.addSourceMaps){
								await fs.writeFile(
									cachedFileMapPath,
									JSON.stringify(sourceMap),
								);
							}

							break;
						}
						case "js":
						case "mjs":
						case "cjs": {

							const addSourceMap = item.fileConfig.files.addSourceMaps;
							const isModule = Boolean(item.fileConfig.files.module ?? item.extension === "mjs");

							log(`Minifying '${itemRelativePath}' with terser as a ${isModule ? "module" : "non-module"}${addSourceMap ? ", and adding a sourcemap" : ""}`);

							const minifiedJS = await terser(
								{[path.basename(item.path)]: (await fs.readFile(item.path, "utf8"))},
								{
									ecma: 2022,
									module: isModule,
									...item.fileConfig.files.directOptions.js,
									sourceMap: item.fileConfig.files.addSourceMaps ? {url: fileMapRelativePath, includeSources: true, root: itemFolderPathRelativeToFileMap} : false,
								},
							);

							await fs.writeFile(
								cachedFilePath,
								minifiedJS.code,
							);

							if(item.fileConfig.files.addSourceMaps){
								await fs.writeFile(
									cachedFileMapPath,
									minifiedJS.map,
								);
							}

							break;
						}
						case "json": {

							log(`Minifying '${itemRelativePath}' with V8 JSON parser`);
							
							await fs.writeJson(
								cachedFilePath,
								(await fs.readJson(item.path)),
							);

							break;
						}
						case "svg": {

							log(`Minifying '${itemRelativePath}' with SVGO`);

							const minifiedSVG = svgo(
								(await fs.readFile(item.path)),
								item.fileConfig.files.directOptions.svg,
							);
							
							await fs.writeFile(
								cachedFilePath,
								minifiedSVG.data,
							);

							break;
						}
					}

				}

				await fs.copy(cachedFilePath, item.path);

				if(item.fileConfig.files.addSourceMaps && fileExists(cachedFileMapPath)){
					await fs.copy(cachedFileMapPath, fileMapPath);
				}

				return;
			
			}

			case "images": {

				log(`Compressing '${itemRelativePath}'..`);
				const reports = [];

				const originalImage = vips.Image.newFromFile(item.path);

				const originalSize = {
					width: originalImage.width,
					height: originalImage.height,
				};

				if(item.fileConfig.images.convert.enable) item.fileConfig.images.convert = processConvertSettings(item.fileConfig.images.convert, originalSize);

				const targetExtensions = [ ...new Set([ ...item.fileConfig.images.convert.targetExtensions, item.fileConfig.images.convert.targetExtension ]) ];

				const newImageMeta = ewabRuntime.imagesMeta.new({
					path: item.path,
					hash: originalHash,
					width: originalSize.width,
					height: originalSize.height,
					fileConfig: item.foleConfig,
				});

				for(const sizeConstraint of item.fileConfig.images.convert.enable ? item.fileConfig.images.convert.sizes : [ originalSize.width ]){

					try{

						const fittedImageSize = fitImageSizeToConstraints(originalSize, sizeConstraint);

						const cachedImagePath = path.join(ewabConfig.cachePath, "items", `${originalHash}-${fittedImageSize.width}w`);

						let integrity = true;
						testIntegrity: for(const targetExtension of targetExtensions){
							if(!fileExists(`${cachedImagePath}.${targetExtension}`)){
								integrity = false;
								break testIntegrity;
							}
						}
						if(integrity){
							reports.push(`${sizeConstraint}, (${targetExtensions.join(", ")}), copied from cache`);
						}else{

							const image = originalImage.resize(fittedImageSize.width / originalImage.width);

							for(const targetExtension of targetExtensions){

								const targetEncoding = imageEncodings.match(targetExtension);

								if(!targetEncoding) throw new Error(`Does not support compressing to image with extension "${targetExtension}"`);

								// Save the image to cache
								image[targetEncoding.vipsSaveFunction](`${cachedImagePath}.${targetEncoding.extension}`, {
									...targetEncoding.getEncodingOption(item.fileConfig.images.compress.subject, item.fileConfig.images.compress.quality),
									...item.fileConfig.images.encoderOptions[targetEncoding.encodingEngine],
								});

								const loggedQuality = "";

								/*if(engine.mainQualityOption.onlyLossless === true){

									loggedQuality = `only supports highest`;

								}else if(item.fileConfig.images.encoderOptions[engine.name][engine.mainQualityOption.key]){

									loggedQuality = `${item.fileConfig.images.encoderOptions[engine.name][engine.mainQualityOption.key]} (directly set in config)`;

								}else if(item.fileConfig.images.quality === 1){

									loggedQuality = `highest (as set in config)`;
									options[engine.name] = { ...options[engine.name], ...engine.quality.lossless };

								}else{

									//TODO


								}*/

								reports.push(`${sizeConstraint}, ${targetExtension}, quality: ${loggedQuality}`);

							}
						
						}
						
						await Promise.all(targetExtensions.map(targetExtension => {
							const newImagePath = transformImagePath(item.path, fittedImageSize.width, {extension: targetExtension});
							newImageMeta.newVersion({
								path: newImagePath,
								type: targetExtension,
								width: fittedImageSize.width,
								height: fittedImageSize.height,
								constraint: sizeConstraint,
							});
							return fs.copy(`${cachedImagePath}.${targetExtension}`, newImagePath);
						}));
					
					}catch(error){

						log("warning", `Unable to compress '${itemRelativePath}'.${ewabConfig.interface === "debug" ? "" : " Enable the debug interface to see more info."}`);

						log(`Error: ${error}`);
					}
					
				}

				if(!item.fileConfig.images.keepOriginal) await fs.remove(item.path);

				log(`Completed compression of ${itemRelativePath}:`);
				for(const report of reports) log(`  ${report}`);

				return;

			}

		}

		ewabRuntime.minifiedItemHashes.push(originalHash);

	}catch(error){

		if(String(error).includes("has an unsupported format")){
			log("warning", `Was not able to read '${itemRelativePath}', it will not be compressed.`);
		}else{
			log("warning", `Unable to compress '${itemRelativePath}'.${ewabConfig.interface === "debug" ? "" : " Enable the debug interface to see more info."}`);
		}
		log(`Error: ${error}`);

	}

}

/**
 * Updates references to images in other documents, such as HTML and CSS.
 * This is not perfect, it won't catch every link.
 */
async function updateImageReferences(){

	for(const sheetPath of await glob("**/*.css", {cwd: ewabConfig.workPath, absolute: true})){

		let css = await fs.readFile(sheetPath, "utf8");

		// Find any background properties using simple url(), and convert them to image-set() if it is necessary 
		let match = true;
		while(match){
			const imageSet = css.match(/(?<match>(?<pre>\bbackground(?:-image)?\s*?:\s*?[,\s])url\(\s*?["']?(?<url>[^\s]*?)["']?\s*?\)(?<pro>\s*?[;}]))/uisg);
			if(imageSet === null){
				match = false;
				break;
			}

			const imagePath = resolveURL(
				ewabConfig.workPath,
				sheetPath,
				imageSet.groups.url,
			);

			const imageMeta = ewabRuntime.imagesMeta.findByPath(imagePath);
			const fileConfig = imageMeta?.fileConfig;

			if(!imageMeta){
				log(`In ${path.relative(ewabConfig.rootPath, sheetPath)}: URL ${imageSet.groups.url} at index ${imageSet.index} does not correlate with a minified image, aborting upgrade to an image-set.`);
			}if(!fileConfig.images.convert.enable){
				log(`In ${path.relative(ewabConfig.rootPath, sheetPath)}: URL ${imageSet.groups.url} at index ${imageSet.index} does not have a modifed URL, so no reason to upgrade to image-set.`);
			}else{

				log(`In ${path.relative(ewabConfig.rootPath, sheetPath)}: upgrading url to image-set for URL ${imageSet.groups.url} at index ${imageSet.index}.`);

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

			const imagePath = resolveURL(
				ewabConfig.workPath,
				sheetPath,
				imageSet.groups.url,
			);

			const imageMeta = ewabRuntime.imagesMeta.findByPath(imagePath);
			const fileConfig = imageMeta?.fileConfig;

			if(!imageMeta){
				log(`In ${path.relative(ewabConfig.rootPath, sheetPath)}: URL ${imageSet.groups.url} at index ${imageSet.index} does not correlate with a minified image, aborting upgrade of the image-set.`);
			}if(!fileConfig.images.convert.enable){
				log(`In ${path.relative(ewabConfig.rootPath, sheetPath)}: URL ${imageSet.groups.url} at index ${imageSet.index} does not have a modifed URL, so no reason to upgrade image-set.`);
			}else{

				log(`In ${path.relative(ewabConfig.rootPath, sheetPath)}: upgrading image-set for URL ${imageSet.groups.url} at index ${imageSet.index}.`);

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

		await fs.writeFile(sheetPath, css);


	}
	
	for(const markupPath of await glob("**/*.{html,htm}", {cwd: ewabConfig.workPath, absolute: true})){

		const html = new jsdom.JSDOM((await fs.readFile(markupPath)));

		if(html?.window?.document){

			for(const img of html.window.document.querySelectorAll("picture > img")){
					
				const srcPath = resolveURL(
					ewabConfig.workPath,
					markupPath,
					img.src ?? "",
				);
				const srcsetPath = resolveURL(
					ewabConfig.workPath,
					markupPath,
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
							const source = html.window.document.createElement("source");
							source[srcType] = newURL;
							source.type = mimeType;

							img.parentElement.insertBefore(source, img);
						}

					}

				}

			}

			for(const img of html.window.document.querySelectorAll("img, picture > source")){

				if((/^\s*[^,\s]+$/u).test(img.srcset)){

					const imagePath = resolveURL(
						ewabConfig.workPath,
						markupPath,
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

		await fs.writeFile(markupPath, html.serialize());

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
		3840, // Full screen UHD Landscape
		2160, // Full screen UHD Portrait
		2560, // Full screen QHD Landscape
		1440, // Full screen QHD Portrait
		1920, // Full screen SHD Landscape
		1080, // Full screen SHD Portrait
		512,  // Medium size image
		265,  // Small image
		196,  // Large icon
		128,  // Medium icon
		64,   // Medium icon
		32,   // Small icon
		16,   // Small icon
		convertConfig.minSize,
	];

	// Make sure no extra image is larger or smaller than alllowed
	extraSizes = extraSizes.filter(size => {
		if(size > convertConfig.maxSize) return false;
		if(size < convertConfig.minSize) return false;
		return true;
	});

	// Make sure they are sorted from largest to smallest to make sure largest images
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
 * 
 * @param {object}	imageSize			- The current image size.
 * @param {number}	imageSize.height	- The current image height.
 * @param {number}	imageSize.width		- The current image width.
 * @param {number}	imageConstraint		- The constraint (both height and width).
 * 
 * @returns {object} - The new image size, fitted to the constraints.
 */
function fitImageSizeToConstraints(imageSize, imageConstraint){

	const resizeRatio = Math.min(
		imageConstraint / imageSize.height,
		imageConstraint / imageSize.width,
		1,
	);

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

	matchVersion(entries = {}){
		return [ ...this.matchAllVersions(entries) ][0];
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

