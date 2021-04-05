/* global ewaConfig ewaObjects */

/**
 * @file
 * Collection of file minifiers / removers to be used by main function.
 * Input is always an absolute file path, output is saved to cache with a hash-reference to the original file.
 * All functions will return how many bytes the minification saved.
 */

import path from "path";
import fs from "fs-extra";
import { hashElement as hashItem } from "folder-hash";
import {log, bar} from "./log.js";
import tools from "./tools.js";
import config from "./config.js";


import globModule from "glob";
const glob = globModule.glob;
//import getFolderSize from "get-folder-size";

import {minify as htmlMinifier} from "html-minifier-terser";
import {minify as terser} from "terser";
import CleanCSS from "clean-css";
import {optimize as svgo} from "svgo";

import imagemin from "imagemin";
import imagemin_mozjpeg from "imagemin-mozjpeg";
import imagemin_optipng from "imagemin-optipng";
import imagemin_webp from "imagemin-webp";

export default minify;

/**
 * Hi there.
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

	const itemProcesses = [];
	const itemProcessResults = [];

	for(const itemPath of glob.sync("**/*", {cwd: path.join(ewaConfig.rootPath, ewaConfig.output), absolute: true})){

		if(["files", "images"].includes(type) && !tools.fileExists(itemPath)) continue;

		const extension = tools.getExtension(itemPath);

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


		itemProcesses.push(
			processItem(itemPath, extension, type, fileConfig)
			.then(result => {
				itemProcessResults.push(result);
				bar(itemProcessResults.length / itemProcesses.length);
				return;
			}),
		);

	}

	await Promise.allSettled(itemProcesses); 

	if(itemProcesses.length === 0){
		bar.hide();
	}else{
		bar.end(`${processName.action.past} ${itemProcesses.length} ${itemProcesses.length === 1 ? processName.item.singular : processName.item.plural}, saving ${(itemProcessResults.reduce((a, b) => a + b, 0) / 1000).toFixed(2)} kb`);
	}

}

async function processItem(itemPath, extension, type, fileConfig){

	const itemRelativePath = path.relative(path.join(ewaConfig.rootPath, ewaConfig.output), itemPath);

	try{

		const originalStats = fs.statSync(itemPath);
		//const originalSize = originalStats.isDirectory() ? getFolderSize(itemPath) : originalStats.size;
		const originalSize = originalStats.size;
		const originalHash = (await hashItem(itemPath, { "encoding": "hex" })).hash;

		switch(type){

		case "remove":

			log(`Removing '${itemRelativePath}'`);
			await fs.remove(itemPath);
			return originalSize;


		case "files":

			const fileMapPath = path.join(ewaConfig.rootPath, ewaConfig.output, ewaConfig.alias, "sourceMaps", `${originalHash}.${extension}.map`);
			const fileMapRelativePath = path.relative(itemPath, fileMapPath);

			const cachedFilePath = path.join(ewaConfig.cachePath, "items", `${originalHash}.${extension}`);
			const cachedFileMapPath = `${cachedFilePath}.map`;

			if(tools.fileExists(cachedFilePath)){
				log(`Copying minified version of '${itemRelativePath}' from cache`);
			}else{

				switch(extension){
				case "html":
				case "htm": 

					log(`Minifying '${itemRelativePath}' with html-minifier-terser`);

					const minifiedHTML = htmlMinifier(
						(await fs.readFile(itemPath, "utf8")),
						{
							...{
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
							},
							...fileConfig.files.directOptions.html,
						},
					);
					
					await fs.writeFile(
						cachedFilePath,
						minifiedHTML,
					);

					break;
				case "css":

					log(`Minifying '${itemRelativePath}' with clean-css`);

					const minifiedCSS = await new CleanCSS(
						{
							...{
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
							},
							...fileConfig.files.directOptions.css,
							...{sourceMap: fileConfig.files.addSourceMaps},
						},
					).minify((await fs.readFile(itemPath)));

					await fs.writeFile(
						cachedFilePath,
						(fileConfig.files.addSourceMaps ? `${minifiedCSS.styles}\n/*# sourceMappingURL=${fileMapRelativePath} */` : minifiedCSS.styles),
					);

					if(fileConfig.files.addSourceMaps){
						await fs.writeFile(
							cachedFileMapPath,
							minifiedCSS.sourceMap.toString(),
						);
					}


					break;
				case "js":
				case "mjs":
				case "cjs":

					log(`Minifying '${itemRelativePath}' with terser`);

					const minifiedJS = await terser(
						(await fs.readFile(itemPath, "utf8")),
						{
							...fileConfig.files.directOptions.js,
							...{sourceMap: fileConfig.files.addSourceMaps ? {url: fileMapRelativePath} : false},
						},
					);

					await fs.writeFile(
						cachedFilePath,
						minifiedJS.code,
					);

					if(fileConfig.files.addSourceMaps){
						await fs.writeFile(
							cachedFileMapPath,
							minifiedJS.map,
						);
					}

					break;
				case "json":

					log(`Minifying '${itemRelativePath}' with V8 JSON parser`);
					
					await fs.writeJson(
						cachedFilePath,
						(await fs.readJson(itemPath)),
					);

					break;
				case "svg":

					log(`Minifying '${itemRelativePath}' with SVGO`);

					const minifiedSVG = svgo(
						(await fs.readFile(itemPath)),
						fileConfig.files.directOptions.svg,
					);
					
					await fs.writeFile(
						cachedFilePath,
						minifiedSVG.data,
					);

					break;
				}

			}

			await fs.copy(cachedFilePath, itemPath);

			if(fileConfig.files.addSourceMaps && tools.fileExists(cachedFileMapPath)){
				await fs.copy(cachedFileMapPath, fileMapPath);
			}

			ewaObjects.minifiedHashes.push(originalHash);

			return originalSize - fs.statSync(itemPath).size;


		case "images":

			return await Promise.all(fileConfig.images.targetExtensions.map(async (targetExtension) => {

				const cachedImagePath = path.join(ewaConfig.cachePath, "items", `${originalHash}.${targetExtension}`);
				const newImagePath = itemPath.replace(/\.\w+$/u, `.${targetExtension}`);

				if(tools.fileExists(cachedImagePath)){
					log(`Copying minified version of '${itemRelativePath}' from cache`);
				}else{
		
					const engines = [];
			
					switch(targetExtension){
					case "webp":
						log(`Minifying '${itemRelativePath}' with imagemin and cwebp`);
						engines.push(imagemin_webp());
						break;
					case "png":
						log(`Minifying '${itemRelativePath}' with imagemin and optipng`);
						engines.push(imagemin_optipng());
						break;
					case "jpg":
					case "jpeg":
						log(`Minifying '${itemRelativePath}' with imagemin and mozjpeg`);
						engines.push(imagemin_mozjpeg());
						break;
					default:
						throw new Error(`Does not support minifying to image with extension "${targetExtension}"`);
					}
			
					await fs.writeFile(
						cachedImagePath,
						await imagemin.buffer(
							await fs.readFile(itemPath),
							{ ...{ "plugins": engines }, ...fileConfig.images.options },
						),
					).catch(error => {
						log(
							"error",
							`Failed to minify "${itemPath}" to extension "${targetExtension}". Error:
								${error}`,
						);
					});
				
				}
		
				await fs.copy(cachedImagePath, newImagePath);
		
				return originalSize - fs.statSync(cachedImagePath).size;
			
			}))
			.then(result => {

				ewaObjects.minifiedHashes.push(originalHash);
		
				return result.reduce((a, b) => a + b, 0) / result.length;
		
			});
			

		}

	}catch(error){

		log("warning", `Unable to minify '${itemRelativePath}'. Enable debug to see more info.`);
		log(error);

	}

}
