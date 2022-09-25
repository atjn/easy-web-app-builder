/* global ewabConfig ewabRuntime */

/**
 * @file
 * Collection of file minifiers / removers to be used by main function.
 * Input is always an absolute file path, output is saved to cache with a hash-reference to the original file.
 */

import path from "path";
import fs from "fs-extra";
import { hashElement as folderHash } from "folder-hash";
import { log, bar } from "./log.js";
import { fileExists, getExtension, resolveURL, deepClone, ewabPackage } from "./tools.js";
import config, { supportedImageExtensions } from "./config.js";
import lodash from "lodash";

import jsdom from "jsdom";



import { ImagePool } from "@squoosh/lib";
import { ssim } from "ssim.js";

import os from "os";


import glob from "tiny-glob";

import { minify as htmlMinifier } from "html-minifier-terser";
import { minify as terser } from "terser";
import CleanCSS from "clean-css";
import { optimize as svgo } from "svgo";

import asyncPool from "tiny-async-pool";

export default minify;

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

	global.imagePool = type === "images" ? new ImagePool() : undefined;

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
			(type === "images" && fileConfig.images.compress !== true)
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

	await asyncPool(
		concurrentThreads,
		itemProcessingQueue,
		async item => {
			await processItem(item);
			completedItemProcesses++;
			bar(completedItemProcesses / itemProcessingQueue.length);
		},
	);

	if(type === "images") global.imagePool.close();

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

		ewabRuntime.minifiedHashes.push(originalHash);

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

				const originalImage = global.imagePool.ingestImage(item.path);

				await originalImage.decoded;

				const originalSize = {
					width: (await originalImage.decoded).bitmap.width, 
					height: (await originalImage.decoded).bitmap.height
				};

				item.fileConfig.images.resize = processResizeSettings(item.fileConfig.images.resize, originalSize);

				const targetExtensions = item.fileConfig.images.convert ?
					[ ...new Set([ ...item.fileConfig.images.targetExtensions, item.fileConfig.images.targetExtension ]) ] :
					[ item.fileConfig.images.targetExtension ];


				for(const size of item.fileConfig.images.convert ? item.fileConfig.images.resize.resizeTo : [ originalSize ]){

					try{

						const cachedImagePath = path.join(ewabConfig.cachePath, "items", `${originalHash}-${size.width}w`);
						const newImagePath = (item.fileConfig.images.preserveOriginalFile && size.width === (await originalImage.decoded).bitmap.width) ?
							item.path :
							item.path.replace(/\.\w+$/u, `-${size.width}w$&`).replace(/\.\w+$/u, ".");

						let integrity = true;
						for(const targetExtension of targetExtensions){
							if(!fileExists(`${cachedImagePath}.${targetExtension}`)) integrity = false;
						}
						if(integrity){
							reports.push(`${size.width}x${size.height}, (${targetExtensions.join(", ")}), copied from cache`);
						}else{

							const image = deepClone(originalImage);
							
							await image.preprocess(
								{
									resize: {
										enabled: true,
										width: size.width,
										height: size.height,
									},
								},
							);

							for(const targetExtension of targetExtensions){

								const options = {};
								const engine = {};

								switch(targetExtension){
									case "png":
										engine.name = "oxipng";
										engine.mainQualityOption = {
											onlyLossless: true,
										};
										break;
									case "avif":
										engine.losslessOptions = {
											cqLevel: 0,
											subsample: 3,
										};
										engine.mainQualityOption = {
											key: "cqLevel",
											min: 62,
											max: 0,
											probes: [50, 30],
										};
										break;
									case "webp":
										engine.losslessOptions = {
											lossless: 1,
										};
										break;
									case "jpg":
										engine.name = "mozjpeg";
										engine.options = {
											progressive: true,
										};
										engine.losslessOptions = {
											quality: 100,
										};
										break;
									case "jxl":
										engine.options = {
											progressive: true,
										};
										engine.losslessOptions = {
											quality: 100,
										};
										break;
									default:
										throw new Error(`Does not support compressing to image with extension "${targetExtension}"`);
								}

								engine.name = engine.name ?? targetExtension;
								engine.mainQualityOption = engine.mainQualityOption ?? {
									key: "quality",
									min: 40,
									max: 100,
									probes: [40, 60],
								};

								options[engine.name] = {
									...engine.options,
									...item.fileConfig.images.encoderOptions[targetExtension],
								};

								let loggedQuality = "";

								if(engine.mainQualityOption.onlyLossless === true){

									loggedQuality = `only supports highest`;

								}else if(item.fileConfig.images.encoderOptions[targetExtension][engine.mainQualityOption.key]){

									loggedQuality = `${item.fileConfig.images.encoderOptions[targetExtension][engine.mainQualityOption.key]} (directly set in config)`;

								}else if(item.fileConfig.images.quality === 1){

									loggedQuality = `highest (as set in config)`;
									options[engine.name] = { ...options[engine.name], ...engine.losslessOptions };

								}else{

									const results = [];

									for(const quality of engine.mainQualityOption.probes){
										options[engine.name][engine.mainQualityOption.key] = quality;
										await image.encode(options);

										const compressedImage = global.imagePool.ingestImage((await image.encodedWith[engine.name]).binary);

										results.push(ssim((await image.decoded).bitmap, (await compressedImage.decoded).bitmap).mssim);
									}

									/**
									 * If an image is hard/impossible to compress, the SSIM values can be very close to a straight line.
									 * Minor noise can cause the probes to describe a line where less quality results in a better looking image, which is obviously not true.
									 * This check catches that situation, and encodes the image losslessly instead.
									 */
									if(results[0] >= results[1]){

										options[engine.name][engine.mainQualityOption.key] = engine.mainQualityOption.max;

									}else{

										/**
										 * The next three lines plot a linear graph from the results of the two probes,
										 * then determines what quality setting correlates with the desired SSIM quality, according to the graph.
										 */
										const slope = (results[1] - results[0]) / (engine.mainQualityOption.probes[1] - engine.mainQualityOption.probes[0]);
										const offset = results[0] - (slope * engine.mainQualityOption.probes[0]);
										options[engine.name][engine.mainQualityOption.key] = Math.round( lodash.clamp((( item.fileConfig.images.quality - offset ) / slope), engine.mainQualityOption.min, engine.mainQualityOption.max) );

									}

									loggedQuality = `${options[engine.name][engine.mainQualityOption.key]} (mathing overall quality set in config: ${item.fileConfig.images.quality})`;

									if(options[engine.name][engine.mainQualityOption.key] === engine.mainQualityOption.max){
										options[engine.name] = { ...options[engine.name], ...engine.losslessOptions };
									}


								}

								await image.encode(options);
								if(!(await image.encodedWith[engine.name])?.extension || !(await image.encodedWith[engine.name])?.binary) throw new Error(`Unexpected error while compressing image`);
								await fs.writeFile(`${cachedImagePath}.${(await image.encodedWith[engine.name]).extension}`, (await image.encodedWith[engine.name]).binary);


								reports.push(`${size.width}x${size.height}, ${targetExtension}, quality: ${loggedQuality}`);

							}
						
						}
						
						await Promise.all(targetExtensions.map(targetExtension => {
							return fs.copy(`${cachedImagePath}.${targetExtension}`, `${newImagePath}.${targetExtension}`);
						}));
					
					}catch(error){

						log("warning", `Unable to compress '${itemRelativePath}'.${ewabConfig.interface === "debug" ? "" : " Enable the debug interface to see more info."}`);

						log(`Squoosh error: ${error}`);
					}
					
				}

				if(!item.fileConfig.images.keepOriginal) await fs.remove(item.path);

				log(`Completed compression of ${itemRelativePath}:`);
				for(const report of reports) log(`  ${report}`);

				return;

			}

		}

	}catch(error){

		if(String(error).includes("has an unsupported format")){
			log("warning", `Was not able to read '${itemRelativePath}', it will not be compressed.`);
		}else{
			log("warning", `Unable to compress '${itemRelativePath}'.${ewabConfig.interface === "debug" ? "" : " Enable the debug interface to see more info."}`);
		}
		log(`Squoosh error: ${error}`);

	}

}

/**
 * Updates references to images in other documents, such as HTTP and CSS.
 * This is not perfect, it won't catch every link.
 */
async function updateImageReferences(){

	for(const sheetPath of await glob("**/*.css", {cwd: ewabConfig.workPath, absolute: true})){

		let css = await fs.readFile(sheetPath, "utf8");

		for(const imageSet of css.matchAll(/[:,\s]-?\w*-?image-set\(\s*(?<urlElement>url\(\s*["'](?<url>["']+)["']\s*\))\s*\)/gui)){

			const imagePath = resolveURL(
				ewabConfig.workPath,
				sheetPath,
				imageSet.groups.url,
			);

			if(fileExists(imagePath)){

				const fileConfig = config.generateForFile(imagePath);

				if(fileConfig.images.compress && fileConfig.images.convert){

					log(`In ${path.relative(ewabConfig.rootPath, sheetPath)}: Updating reference to ${path.relative(ewabConfig.rootPath, imagePath)} with compressed/converted images`);

					const images = [];

					for(const targetExtension of fileConfig.images.targetExtensions){

						const newURL = imageSet.groups.url.replace(/\.\w+$/u, `.${targetExtension}`);

						const mime = targetExtension === "jpg" ? "jpeg" : targetExtension;
						
						images.push(`url("${newURL}") type("image/${mime}")`);

					}

					css = css.replace(imageSet.groups.urlElement, ` /* Generated by ${ewabPackage.name} */ ${images.join(", ")}`);

				}

			}else{
				log(`In ${path.relative(ewabConfig.rootPath, sheetPath)}: Unable to parse URL at index: ${imageSet.index}, aboprting uprgade of the image-set.`);
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

				if(fileExists(srcsetPath)){
					imagePath = srcsetPath;
					srcType = "srcset";
				}else if(fileExists(srcPath)){
					imagePath = srcPath;
					srcType = "src";
				}else{
					continue;
				}
				const fileConfig = config.generateForFile(imagePath);
				const url = img[srcType];

				if(fileConfig.images.updateReferences){

					for(const targetExtension of fileConfig.images.targetExtensions){
						const newURL = url.replace(/\.\w+$/u, `.${targetExtension}`);
						const mimeType = `image/${targetExtension === "jpg" ? "jpeg" : targetExtension}`;

						if(targetExtension === fileConfig.images.targetExtensions[fileConfig.images.targetExtensions.length - 1]){
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

					if(fileExists(imagePath)){

						const fileConfig = config.generateForFile(imagePath);

						if(fileConfig.images.compress && fileConfig.images.convert){
							//fileConfig.images.resize = processResizeSettings(fileConfig.images.resize, imagePath);

							if(fileConfig.images.resize.addSizesTagToImg && fileConfig.images.resize.sizes) img.sizes = img.sizes ?? fileConfig.images.resize.sizes;

							const srcset = [];

							for(const size of fileConfig.images.resize.resizeTo){
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
 * Processes the EWAB resize config for an image.
 * Adds a list of sizes the image should be resized to.
 * 
 * @param {object}	resizeConfig	- The image resizeConfig from its fileConfig.
 * @param {object}	originalSize	- The original size of the image.
 * 
 * @returns {object} - The processed resizeConfig.
 */
function processResizeSettings(resizeConfig, originalSize){

	resizeConfig.resizeTo = [];

	if(!resizeConfig.fallbackSize){
		resizeConfig.fallbackSize = Math.max( Math.min(originalSize.width, resizeConfig.maxSize, 1920), Math.min(originalSize.height, resizeConfig.maxSize, 1920) );
		//log(`No fallback size set in config, so decided that ${resizeConfig.fallbackSize} pixels was reasonable.`);
	}

	if(resizeConfig.auto){
		const autoSizes = (resizeConfig.sizes ?
			resizeConfig.sizes.match(/(?<width>\d+)(?<unit>(?:vw|px))\s*(?:,|$)/gui).map(match => match.groups) :
			[ { width: "100", unit: "vw" } ]
		).map(size => {

			switch(size.unit.toLowerCase()){
				case "px":

					return fitImageSizeToConstraints(originalSize, {
						height: resizeConfig.maxSize,
						width: size.width,
					});

				case "vw":

					return [
						3840, //UHD - Landscape
						2160, //UHD - Portrait
						2560, //QHD - Landscape
						1440, //QHD - Portrait
						1920, //SHD - Landscape
						1080, //SHD - Portrait
					]
					.map(screenWidth => {
						return fitImageSizeToConstraints(originalSize, {
							height: resizeConfig.maxSize,
							width: Math.min(resizeConfig.maxSize, size.width * screenWidth / 100),
						});
					});

			}

		});

		resizeConfig.resizeTo.push( ...autoSizes.flat(2) );
	}

	resizeConfig.customSizes.push({height: resizeConfig.fallbackSize, width: resizeConfig.fallbackSize});
	resizeConfig.customSizes = resizeConfig.customSizes.map(size => {
		return fitImageSizeToConstraints(originalSize, size);
	});

	resizeConfig.resizeTo = resizeConfig.resizeTo.filter(size => {
		for(const customSize of resizeConfig.customSizes){
			if(customSize.width * 1.40 > size.width && size.width > customSize.width * 0.60) return false;
		}
		return true;
	});

	resizeConfig.resizeTo.sort((a, b) => {return b.width - a.width;});
	let largerIndex = 0;
	while(largerIndex < resizeConfig.resizeTo.length){
		const largerSize = resizeConfig.resizeTo[largerIndex];
		resizeConfig.resizeTo = resizeConfig.resizeTo.filter((size, index) => {
			if(largerSize.width === size.width && largerIndex !== index) return false;
			if(largerSize.width > size.width && size.width > largerSize.width * 0.60) return false;
			return true;
		});
		largerIndex++;
	}

	if(ewabConfig.images.preserveOriginalFile) resizeConfig.customSizes.push(originalSize);
	
	resizeConfig.resizeTo = [ ...new Set([ ...resizeConfig.resizeTo, ...resizeConfig.customSizes ]) ].sort((a, b) => {return a.width - b.width;});

	return resizeConfig;
	

}

/**
 * Takes a specific image size, and makes it fit inside a given set of constraints, while preserving aspect ratio.
 * 
 * @param {object}	imageSize			- The current image size.
 * @param {object}	imageConstraints	- The constraints.
 * 
 * @returns {object} - The new image size, fitted to the constraints.
 */
function fitImageSizeToConstraints(imageSize, imageConstraints){

	const resizeRatio = Math.min(
		imageConstraints.height / imageSize.height,
		imageConstraints.width / imageSize.width,
		1,
	);

	return {
		height: Math.round( imageSize.height * resizeRatio ),
		width: Math.round( imageSize.width * resizeRatio ),
	};

}
