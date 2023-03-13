/* global ewabConfig ewabRuntime */

/**
 * @file
 * Collection of file minifiers / removers to be used by main function.
 * Input is always an absolute file path, output is saved to cache with a hash-reference to the original file.
 */

import path from "node:path";
import fs from "fs-extra";
import { AppFileMeta, ImageVersion } from "./files.js";
import { log, bar } from "./log.js";
import { File, resolveAppUrl, globApp, fatalError, generateRelativeAppUrl, resolveAppSrcset, getAllAppSheetFiles, fileExistsSync, vips, vipsImageFromFile, vipsImageFromSvgFile } from "./tools.js";
import { supportedImageExtensions } from "./config.js";

import os from "node:os";

import { minify as htmlMinifier } from "html-minifier-terser";
import { minify as terser } from "terser";
import CleanCSS from "clean-css";
import { optimize as svgo } from "svgo";

import postcss from "postcss";
import cssValueParser from "postcss-value-parser";

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
		new ImageEncoding({
			mimeType: "image/svg+xml",
			extension: "svg",
			encodingEngine: "htmlparser2",
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

export const imageEncodings = new ImageEncodings();



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

	if(processType === "images"){

		await updateImageReferences();

	}

	if(itemProcessingQueue.length === 0){
		bar.hide();
	}else{
		bar.end(`${processName.action.past} ${itemProcessingQueue.length} ${itemProcessingQueue.length === 1 ? processName.item.singular : processName.item.plural}`);
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

				const originalImage = vipsImageFromFile(appFile);

				const originalSize = {
					width: originalImage.width,
					height: originalImage.height,
				};

				if(appFile.config.images.convert.enable) appFile.config.images.convert = processConvertSettings(appFile.config.images.convert, originalSize);

				const targetExtensions = [ ...new Set([ ...appFile.config.images.convert.targetExtensions, appFile.config.images.convert.targetExtension ]) ];

				const newImageMeta = new AppFileMeta({
					appFile,
					width: originalSize.width,
					height: originalSize.height,
				});
				ewabRuntime.appFilesMeta.set(newImageMeta);

				if(appFile.is("svg")){
					newImageMeta.imageVersions.push(new ImageVersion({
						appFile,
						type: "svg",
						encoding: imageEncodings.match("svg"),
					}));
				}

				const sortedSizeConstraints = [ ...new Set([ appFile.config.images.convert.size, ...appFile.config.images.convert.sizes ]) ].sort((a, b) => b - a);

				for(const sizeConstraint of appFile.config.images.convert.enable ? sortedSizeConstraints : [ originalSize.width ]){

					try{

						const isSvg = appFile.is("svg");

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
								?	vipsImageFromSvgFile(appFile, {scale: fittedImageSize.width / originalImage.width})
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
							newImageMeta.imageVersions.push(new ImageVersion({
								appFile: new AppFile({workPath: newImagePath}),
								type: targetExtension,
								encoding: targetEncoding,
								width: fittedImageSize.width,
								height: fittedImageSize.height,
								constraint: sizeConstraint,
							}));
							return fs.copy(`${cachedImagePath}.${targetExtension}`, newImagePath);
						}));
					
					}catch(error){

						log("warning", `Unable to compress "${appFile}".${ewabConfig.interface === "debug" ? "" : " Enable the debug interface to see more info."}`);

						log(`Error: ${error}`);
					}
					
				}

				log(`Completed compression of ${appFile}:`);
				for(const report of reports) log(`  ${report}`);

				return;

			}

		}

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

	for await (const { sheetFile } of getAllAppSheetFiles()){

		/**
		 *
		 */
		const imageSetTransformer = () => ({
			postcssPlugin: "ewab-image-reference-transformer",
			Once(root){
				root.walkRules(rule => {
					/*
					Map(property) => [group nr inside rule] => Map(outer value) => urls: [{
						declaration,
						urls => [
							{
								url: String,
								size: String | undefined,
							}
						],
						outerValue => String
					}]
					*/
					const images = new Map();
					const lastNodeProperty = "";
					const lastNodeIndex = -Infinity;
					/**
					 *
					 * @param property
					 * @param image
					 */
					function setNewImage(image){
						const propertyImages = images.get(image.declaration.prop) || [];

						const nodeIndex = rule.index(image.declaration);
						let currentGroupIndex = propertyImages.length - 1;
						if(lastNodeProperty !== image.declaration.property || lastNodeIndex < nodeIndex - 1){
							currentGroupIndex++;
						}

						const generalGroupImages = propertyImages[currentGroupIndex] || new Map();
						const groupImages = generalGroupImages.get(image.outerValue) || [];
						groupImages.push(image);
						generalGroupImages.set(image.outerValue, groupImages);
						propertyImages[currentGroupIndex] = generalGroupImages;
						images.set(image.declaration.prop, propertyImages);
					}

					rule.walkDecls(declaration => {
						const valueRoot = cssValueParser(declaration.value);
						let match = false;
						const urls = [];
						let valueIndex;

						let currentValueIndex = -1;
						valueRoot.nodes.forEach(node => {
							currentValueIndex++;
							if(node.type === "function" && node.value === "url"){
								if(node.nodes.length === 1 && ["word", "string"].includes(node.nodes[0].type)){
									urls.push({
										url: node.nodes[0].value,
									});
									valueIndex ??= currentValueIndex;
									match = true;
								}
							}
							if(node.value === "image-set"){
								let nodeMatch = false;
								for(let [index, setUrl] of node.nodes.entries()){
									if(setUrl.type === "function" && setUrl.value === "url"){
										if(setUrl.nodes.length === 1 && ["word", "string"].includes(setUrl.nodes[0].type)){
											setUrl = setUrl.nodes[0];
											setUrl.type = "string";
										}
									}
									const startDelimiter = node.nodes[index - 1];
									const spaceOrEndDelimiter = node.nodes[index + 1];
									const sizeWord = node.nodes[index + 2];
									const endDelimiter = node.nodes[index + 3];
									if(
										( !startDelimiter || startDelimiter.type === "div" ) &&
										( setUrl.type === "string" ) &&
										( !spaceOrEndDelimiter || (
											spaceOrEndDelimiter.type === "space" &&
												sizeWord.type === "word" &&
												( !endDelimiter || endDelimiter.type === "div" )
										)
										)
									){
										const sizeMatch = sizeWord?.value?.match?.(/^(?<size>\d+.?\d*)[a-z]{1,5}$/ui);	
										urls.push({
											url: setUrl.value,
											size: sizeMatch?.groups?.size,
										});
										valueIndex ??= currentValueIndex;
										nodeMatch = true;
									}
								}
								if(nodeMatch){
									match = true;
								}
							}
						});
						if(match){
							setNewImage({
								declaration,
								urls,
								outerValue: valueRoot.nodes.map(node => node.value).join(""),
								valueIndex,
							});
						}
					});

					//console.log("images", images.entries());
					for(const ruleProperties of images.values()){
						//console.log("ruleProperties", ruleProperties);
						for(const generalPropertyImages of ruleProperties){
							//console.log("generalPropertyImages", generalPropertyImages.entries());
							for(const propertyImages of generalPropertyImages.values()){
								//console.log("propertyImages", propertyImages);
								let bestUrl;
								for(const image of propertyImages){
									for(const url of image.urls){
										if(!bestUrl || (url.size && (!bestUrl.size || url.size > bestUrl.size))){
											bestUrl = url;
										}
									}
								}
								// Overwrite the existing assignments with the default template, trying to keep as much as possible from the original styles.
								// This is complicated, but helps keep the sourceMap as accurate as possible, which makes it easier to debug the styles later on.
								const declarationTemplate = ["url", "set-types", "set-sizes-types"];
								const bestImageFile = resolveAppUrl(sheetFile, bestUrl.url);
								if(!fileExistsSync(bestImageFile.workPath)){
									log("warning", `You have defined an image with path: ${bestUrl.url} in ${sheetFile} "${rule.selector}" (line ${rule.source.start.line}:${rule.source.start.column}), which do not seem to exist. Please remove references to files that don't exist.`);
									continue;
								}
								const bestImageConfig = bestImageFile.config;
								let propertyDeclarationIndex = -1;
								for(const template of declarationTemplate){
									propertyDeclarationIndex++;
									if(propertyDeclarationIndex >= propertyImages.length){
										const newDeclaration = propertyImages.at(-1).declaration.cloneAfter();
										propertyImages.push({...propertyImages.at(-1), ...{declaration: newDeclaration}});
									}
									const existingDeclaration = propertyImages[propertyDeclarationIndex].declaration;
									switch(template){
										case "url": {
											const targetEncoding = imageEncodings.match(bestImageConfig.images.convert.targetExtension);
											const bestUrl = generateRelativeAppUrl(sheetFile, bestImageFile.meta.matchImageVersionClosestToWidth({encoding: targetEncoding}, bestImageConfig.images.convert.size).appFile);
											existingDeclaration.value = `url("${bestUrl}")`;
											break;
										}
										case "set-types": {
											const setVersions = [];
											for(const targetExtension of bestImageConfig.images.convert.targetExtensions){
												const targetEncoding = imageEncodings.match(targetExtension);
												const bestUrl = generateRelativeAppUrl(sheetFile, bestImageFile.meta.matchImageVersionClosestToWidth({encoding: targetEncoding}, bestImageConfig.images.convert.size).appFile);
												setVersions.push(`url("${bestUrl}") 1x type("${targetEncoding.mimeType}")`);
											}
											existingDeclaration.value = `image-set(${setVersions.join(", ")})`;
											break;
										}
										case "set-sizes-types": {
											const setVersions = [];
											for(const targetExtension of bestImageConfig.images.convert.targetExtensions){
												const targetEncoding = imageEncodings.match(targetExtension);
												for(const imageVersion of bestImageFile.meta.matchAllImageVersions({encoding: targetEncoding})){
													const bestUrl = generateRelativeAppUrl(sheetFile, imageVersion.appFile);
													setVersions.push(`url("${bestUrl}") ${imageVersion.width}w type("${targetEncoding.mimeType}")`);
												}
											}
											existingDeclaration.value = `image-set(${setVersions.join(", ")})`;
											break;
										}
									}
								}
								while(propertyDeclarationIndex < propertyImages.length - 1){
									const extraProperty = propertyImages.pop();
									extraProperty.declaration.remove();
								}
							}
						}
					}
				});
			},
		});
		imageSetTransformer.postcss = true;
		const cssProcessor = postcss([imageSetTransformer]);

		const result = await cssProcessor.process(await sheetFile.read(), { from: sheetFile.appPath, to: sheetFile.appPath });
		sheetFile.write(result.css);

	}

	log("Looking for HTML files with image references that need to be updated.");
	
	for await (const { markupFile, markup } of getAllAppMarkupFiles()){

		if(markupFile.config.images.updateReferences && markup?.window?.document) continue;

		const pictureElements = markup.window.document.querySelectorAll("picture");

		if(pictureElements.length > 0) log(`Found ${pictureElements.length} picture elements in ${markupFile}, will try to update them now.`);

		for(const picture of pictureElements){

			const sources = [];
			/**
			 * Saves the source correctly. Sources are grouped with other sources that use the same media attribute. They should be identical.
			 *
			 * @param {object} newSource - Information about the new source.
			 */
			function setNewSource(newSource){

				newSource.media = newSource.media?.trim?.() || "";
				if(typeof newSource.srcsets === "string") newSource.srcsets = [ newSource.srcsets ];
				newSource.srcsets = newSource.srcsets.filter(srcset => srcset);

				for(const [index, source] of sources.entries()){
					if(source.media === newSource.media){
						source.srcsets = [ ...source.srcsets, ...newSource.srcsets ];
						sources[index] = source;
						return;
					}
				}
				// If no existing source was found
				sources.push(newSource);
			}
			/**
			 * Returns a group of sources that corresponds to a given media.
			 * Normal img elements should always have `media = ""`.
			 *
			 * @param {string} media - The media query.
			 */
			function matchSource(media){
				media = media?.trim?.() || "";

				for(const source of sources){
					if(source.media === media) return source;
				}
				// If no existing source was found
				return null;
			}

			const imgList = picture.querySelectorAll("img");

			if(imgList.length === 0){
				log("warning", `You have defined a <picture> element which contains no <img> element (in ${markupFile}). This will not work properly in browsers, please add an <img> element.`);
				continue;
			}else if(imgList.length > 1){
				log("warning", `You have defined a <picture> element which contains more than one <img> element (in ${markupFile}). This can result in unexpected behavior, please only define a single <img> element.`);
			}

			const sourceList = picture.querySelectorAll("source");
			
			for(const source of sourceList){
				setNewSource({
					media: source.media,
					sizes: source.sizes,
					srcsets: source.srcset,
				});
				source.remove();
			}

			for(const [index, img] of imgList.entries()){
				setNewSource({
					srcsets: [img.src, img.srcset],
				});
				if(index > 0) img.remove();
			}

			const sourceElements = [];

			for(const source of sources){
				const sourceFile = resolveAppSrcset(
					markupFile,
					source.srcsets,
				);
				if(!sourceFile){
					log("warning", `You have defined images with paths: ${source.srcsets} in ${markupFile}, which do not seem to exist. Please remove references to files that don't exist.`);
					continue;
				}
				const sourceConfig = sourceFile.config;
				for(const targetExtension of sourceConfig.images.convert.targetExtensions){
					const targetEncoding = imageEncodings.match(targetExtension);
					const sourceElement = markup.window.document.createElement("source");
					if(source.media) sourceElement.media = source.media;
					sourceElement.type = targetEncoding.mimeType;
					if(source.sizes) sourceElement.sizes = source.sizes;
					const srcsetParts = [];
					for(const imageVersion of sourceFile.meta.matchAllImageVersions({encoding: targetEncoding})){
						const url = generateRelativeAppUrl(markupFile, imageVersion.appFile);
						srcsetParts.push(`${url} ${imageVersion.width}w`);
					}
					sourceElement.srcset = srcsetParts.join(",");

					sourceElements.push(sourceElement);
				}
			}
			picture.prepend(...sourceElements);

			const imgSource = matchSource("");
			const imgFile = resolveAppSrcset(
				markupFile,
				imgSource.srcsets,
			);
			if(!imgFile){
				log("warning", `You have defined images with paths: ${imgSource.srcset} in ${markupFile}, which do not seem to exist. Please remove references to files that don't exist.`);
				continue;
			}
			const imgConfig = imgFile.config;
			const imgElement = imgList[0];

			const targetEncoding = imageEncodings.match(imgConfig.images.convert.targetExtension);

			if(imgSource.sizes) imgElement.sizes = imgSource.sizes;
			const srcsetParts = [];
			for(const imageVersion of imgFile.meta.matchAllImageVersions({encoding: targetEncoding})){
				const url = generateRelativeAppUrl(markupFile, imageVersion.appFile);
				srcsetParts.push(`${url} ${imageVersion.width}w`);
			}
			imgElement.srcset = srcsetParts.join(", ");
			imgElement.src = generateRelativeAppUrl(markupFile, imgFile.meta.matchImageVersionClosestToWidth({encoding: targetEncoding}, imgConfig.images.convert.size).appFile);
		}

		const imgElements = markup.window.document.querySelectorAll(":not(picture) > img");

		if(pictureElements.length > 0) log(`Found ${pictureElements.length} img elements in ${markupFile}, will try to update them now.`);
		// TODO: Add hints here that the img files should be upgraded to picture files.

		for(const img of imgElements){

			const imgFile = resolveAppSrcset(
				markupFile,
				[img.src, img.srcset],
			);
			if(!imgFile){
				log("warning", `You have defined images with paths: ${[img.src, img.srcset]} in ${markupFile}, which do not seem to exist. Please remove references to files that don't exist.`);
				continue;
			}
			const imgConfig = imgFile.config;

			const targetEncoding = imageEncodings.match(imgConfig.images.convert.targetExtension);
			
			img.width ||= imgFile.meta.width;
			const srcsetParts = [];
			for(const imageVersion of imgFile.meta.matchAllImageVersions({encoding: targetEncoding})){
				const url = generateRelativeAppUrl(markupFile, imageVersion.appFile);
				srcsetParts.push(`${url} ${imageVersion.width}w`);
			}
			img.srcset = srcsetParts.join(", ");
			img.src = generateRelativeAppUrl(markupFile, imgFile.meta.matchImageVersionClosestToWidth({encoding: targetEncoding}, imgConfig.images.convert.size).appFile);

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

	convertConfig.size = Math.min(convertConfig.size, convertConfig.maxSize);

	convertConfig.sizes.push(Math.max(originalSize.width, originalSize.height));

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

	// Make sure they are sorted from largest to smallest to make sure larger images
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
