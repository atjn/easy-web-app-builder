/* global ewaConfig ewaObjects */

/**
 * @file
 * Collection of file minifiers / removers to be used by main function.
 * Input is always an absolute file path, output is saved to cache with a hash-reference to the original file.
 * All functions will return how many bytes the minification saved.
 */

import path from "path";
import fs from "fs-extra";
import { hashElement as folderHash } from "folder-hash";
import getItemSize from "get-folder-size";
import prettyBytes from "pretty-bytes";
import { log, bar } from "./log.js";
import { fileExists, getExtension, resolveURL } from "./tools.js";
import config from "./config.js";

//import imageSize from "image-size";

import jsdom from "jsdom";



//import { ImagePool } from "@squoosh/lib";

import os from "os";


import glob from "glob";

import { minify as htmlMinifier } from "html-minifier-terser";
import { minify as terser } from "terser";
import CleanCSS from "clean-css";
import { optimize as svgo } from "svgo";

import asyncPool from "tiny-async-pool";

export default minify;

/**
 * Hi there.
 * 
 * @param	{"remove"|"images"|"files"}	type 
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
					present: "Minifying",
					past: "Minified",
				},
				item: {
					singular: "image",
					plural: "images",
				},
			};
			break;
	}

	bar.begin(`${processName.action.present} ${processName.item.plural}`);

	//global.imagePool = type === "images" ? new ImagePool() : undefined;
	global.ImagePool = {};

	const itemProcesses = [];
	const itemProcessResults = [];

	for(const itemPath of glob.sync("**/*", {cwd: ewaConfig.workPath, absolute: true})){

		if(["files", "images"].includes(type) && !fileExists(itemPath)) continue;

		const extension = getExtension(itemPath);

		if(
			(type === "files" && !["html", "css", "js", "json", "svg"].includes(extension)) ||
			(type === "images" && !["png", "jpg", "jpeg", "webp"].includes(extension))
		){
			continue;
		}

		const fileConfig = config.generateForFile(itemPath);

		if(
			(type === "remove" && fileConfig.files.remove !== true) ||
			(type === "files" && fileConfig.files.minify !== true) ||
			(type === "images" && fileConfig.images.minify !== true)
		){
			continue;
		}

		itemProcesses.push({path: itemPath, extension, type, fileConfig});

	}

	const processItemMeta = async (item) => {
		await processItem(item)
		.then(result => {
			itemProcessResults.push(result);
			bar(itemProcessResults.length / itemProcesses.length);
			return;
		});
	};

	//await Promise.allSettled(itemProcesses); 

	const concurrentThreads = Math.round(Math.min(
		os.freemem() / 8000,
		os.cpus().length / 2,
	));

	await asyncPool(concurrentThreads, itemProcesses, processItemMeta);

	if(itemProcesses.length === 0){
		bar.hide();
	}else{
		bar.end(`${processName.action.past} ${itemProcesses.length} ${itemProcesses.length === 1 ? processName.item.singular : processName.item.plural}, saving ${prettyBytes(1000/*itemProcessResults.reduce((a, b) => a + b, 0) / 1000*/)}`);
	}

	if(type === "images" && ewaConfig.images.updateReferences){

		await updateImageReferences();

	}

	if(type === "images"){
		//global.imagePool.close();
	}

}

async function processItem(item){

	const itemRelativePath = path.relative(ewaConfig.workPath, item.path);

	try{

		const originalSize = await getItemSize.loose(item.path);
		const originalHash = (await folderHash(item.path, { "encoding": "hex" })).hash;

		switch(item.type){

			case "remove": {

				log(`Removing '${itemRelativePath}'`);
				await fs.remove(item.path);
				return originalSize;

			}


			case "files": {

				const fileMapPath = path.join(ewaConfig.workPath, ewaConfig.alias, "sourceMaps", `${originalHash}.${item.extension}.map`);
				const fileMapRelativePath = path.relative(path.join(item.path, ".."), fileMapPath);
				const itemFolderPathRelativeToFileMap = path.join(path.relative(path.join(fileMapPath, ".."), item.path), "..");

				const cachedFilePath = path.join(ewaConfig.cachePath, "items", `${originalHash}.${item.extension}`);
				const cachedFileMapPath = `${cachedFilePath}.map`;

				if(fileExists(cachedFilePath)){
					log(`Copying minified version of '${itemRelativePath}' from cache`);
				}else{

					switch(item.extension){
						case "html":
						case "htm": {

							log(`Minifying '${itemRelativePath}' with html-minifier-terser`);

							const minifiedHTML = htmlMinifier(
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

							log(`Minifying '${itemRelativePath}' with clean-css`);

							const minifiedCSS = await new CleanCSS(
								{
									returnPromise: true,
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
								},
							).minify(await fs.readFile(item.path));

							await fs.writeFile(
								cachedFilePath,
								minifiedCSS.styles,
							);

							break;
						}
						case "js":
						case "mjs":
						case "cjs": {

							log(`Minifying '${itemRelativePath}' with terser`);

							const minifiedJS = await terser(
								{[path.basename(item.path)]: (await fs.readFile(item.path, "utf8"))},
								{
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

				ewaObjects.minifiedHashes.push(originalHash);

				return originalSize - fs.statSync(item.path).size;
			
			}

			case "images": {

				//item.fileConfig.images.resize = processResizeSettings(item.fileConfig.images.resize, item.path);

				const targetExtensions = [ ...new Set([ ...item.fileConfig.images.targetExtensions, item.fileConfig.images.targetExtension ]) ];


				for(const size of item.fileConfig.images.resize.resizeTo){

					try{

						const cachedImagePath = path.join(ewaConfig.cachePath, "items", `${originalHash}-${size.width}w.`);
						const newImagePath = item.path.replace(/\.\w+$/u, `-${size.width}w$&`).replace(/\.\w+$/u, ".");

						let integrity = true;
						for(const targetExtension of targetExtensions){
							if(!fileExists(`${cachedImagePath}${targetExtension}`)) integrity = false;
						}
						if(integrity){
							log(`Copying minified version of '${itemRelativePath}' from cache`);
						}else{

							const image = await global.imagePool.ingestImage(item.path);

							await image.manipulate(
								{
									resize: {
										enabled: true,
										width: size.width,
										height: size.height,
									},
								},
							);

							const options = {};

							for(const targetExtension of targetExtensions){

								let engine;

								switch(targetExtension){
									case "jxl":
									case "avif":
									case "wp2":
									case "webp":
										engine = targetExtension;
										break;
									case "png":
										engine = "oxipng";
										break;
									case "jpg":
										engine = "mozjpeg";
										break;
									default:
										throw new Error(`Does not support minifying to image with extension "${targetExtension}"`);
								}
								log(`Minifying '${itemRelativePath}' to a ${size.width}x${size.height} .${targetExtension} image`);

								options[engine] = "auto";

							}

							await image.encode(options);
							
							await Promise.all(targetExtensions.map(targetExtension => {
								const minifiedImage = image.encodedAs[targetExtension];
								if(!minifiedImage){
									throw new Error(`Unexpected error while minifying to "${targetExtension}"`);
								}
								return fs.writeFile(`${cachedImagePath}.${targetExtension}`, minifiedImage);
							}));

						
						}
						
						await Promise.all(targetExtensions.map(targetExtension => {
							return fs.copy(`${cachedImagePath}.${targetExtension}`, `${newImagePath}.${targetExtension}`);
						}));

					}catch(error){

						log("warning", `Unable to minify '${itemRelativePath}'. Enable the debug interface to see more info.`);
						log(error);
					}
					
				}

			}

		}

	}catch(error){

		log("warning", `Unable to minify '${itemRelativePath}'. Enable debug to see more info.`);
		log(error);

	}

	return;

}

async function updateImageReferences(){

	for(const sheetPath of glob.sync("**/*.css", {cwd: ewaConfig.workPath, absolute: true})){

		let css = await fs.readFile(sheetPath, "utf8");

		for(const imageSet of css.matchAll(/[:,\s]-?\w*-?image-set\(\s*(?<urlElement>url\(\s*["'](?<url>["']+)["']\s*\))\s*\)/gui)){

			const imagePath = resolveURL(
				ewaConfig.workPath,
				sheetPath,
				imageSet.groups.url,
			);

			if(fileExists(imagePath)){

				const fileConfig = config.generateForFile(imagePath);

				if(fileConfig.images.minify && fileConfig.images.convert){

					log(`In ${path.relative(ewaConfig.rootPath, sheetPath)}: Updating reference to ${path.relative(ewaConfig.rootPath, imagePath)} with minified/converted images`);

					const images = [];

					for(const targetExtension of fileConfig.images.targetExtensions){

						const newURL = imageSet.groups.url.replace(/\.\w+$/u, `.${targetExtension}`);

						const mime = targetExtension === "jpg" ? "jpeg" : targetExtension;
						
						images.push(`url("${newURL}") type("image/${mime}")`);

					}

					css = css.replace(imageSet.groups.urlElement, ` /* Generated by easy-webapp */ ${images.join(", ")}`);

				}

			}else{
				log(`In ${path.relative(ewaConfig.rootPath, sheetPath)}: Unable to parse URL at index: ${imageSet.index}, aboprting uprgade of the image-set.`);
			}
			

		}

		await fs.writeFile(sheetPath, css);


	}

	for(const markupPath of glob.sync("**/*.{html,htm}", {cwd: ewaConfig.workPath, absolute: true})){

		const html = new jsdom.JSDOM((await fs.readFile(markupPath)));

		if(html?.window?.document){

			for(const img of html.window.document.querySelectorAll("picture > img")){

				if(true){
					
					const srcPath = resolveURL(
						ewaConfig.workPath,
						markupPath,
						img.src || "",
					);
					const srcsetPath = resolveURL(
						ewaConfig.workPath,
						markupPath,
						img.srcset || "",
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
						ewaConfig.workPath,
						markupPath,
						img.srcset,
					);

					if(fileExists(imagePath)){

						const fileConfig = config.generateForFile(imagePath);

						if(fileConfig.images.minify && fileConfig.images.convert){
							//fileConfig.images.resize = processResizeSettings(fileConfig.images.resize, imagePath);

							if(fileConfig.images.resize.addSizesTagToImg && fileConfig.images.resize.sizes) img.sizes = img.sizes || fileConfig.images.resize.sizes;

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

		await fs.writeFile(markupPath, html.window.document.documentElement.outerHTML);

	}

}

function processResizeSettings(resizeConfig, imagePath){

	const originalSize = null; //imageSize(imagePath);
	resizeConfig.resizeTo = [];

	resizeConfig.fallbackSize = resizeConfig.fallbackSize || Math.max( Math.min(originalSize.width, resizeConfig.maxSize, 1920), Math.min(originalSize.height, resizeConfig.maxSize, 1920) );

	if(resizeConfig.auto){
		const autoSizes = (resizeConfig.sizes ?
			resizeConfig.sizes.match(/(?<width>\d+)(?<unit>(?:vw|px))\s*(?:,|$)/gui).map(match => {return match.groups;}) :
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
						1920, //SHD - Lanscape
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
	
	resizeConfig.resizeTo = [ ...resizeConfig.resizeTo, ...resizeConfig.customSizes ].sort((a, b) => {return a.width - b.width;});

	return resizeConfig;
	

}

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
