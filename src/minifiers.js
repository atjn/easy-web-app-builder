"use strict";

/**
 * @file
 * Collection of file minifiers / removers to be used by main function.
 * Input is always an absolute file path, output is saved to cache with a hash-reference to the original file.
 * All functions will return how many bytes the minification saved.
 */

const path = require("path");
const fs = require("fs-extra");
const {hashElement} = require("folder-hash");

module.exports = {

	/**
	 * Minifies a raster image (png, jpg, webp) and saves it in the easy-webapp cache folder with a hash reference to the original image.
	 *
	 * @param	{string}	imagePath			- Absolute path of the image to minify.
	 * @param	{string}	cacheDirectory		- Absolute path of the easy-webapp cache folder.
	 * @param	{string[]}	targetExtensions	- Which file extensions the image should be saved to. Defaults to the same extension as the input image.
	 * @param	{object}	[options]			- Options to pass to the minifier.
	 * 
	 * @returns	{Promise<number>}				- How many bytes were saved in the conversion.
	 * 
	 */
	minifyImage: async (imagePath, cacheDirectory, targetExtensions, options) => {

		const imageHash = (await hashElement(imagePath, {"encoding": "hex"})).hash;
		const imageSize = (await fs.stat(imagePath)).size;


		//(ext === target_ext) ? console.log(`Minifying '${path.join(image_path)}'`) : console.log(`Converting '${path.join(image_path)}' to minified ${target_ext}`);

		return Promise.all(targetExtensions.map(async targetExtension => {

			const imageCachePath = path.join(cacheDirectory, `${imageHash}.${targetExtension}`);
			const newImagePath = imagePath.replace(/\.\w+$/u, `.${targetExtension}`);

			if(!fs.pathExistsSync(imageCachePath)){

				const imagemin = require("imagemin");
				const imagemin_mozjpeg = require("imagemin-mozjpeg");
				const imagemin_optipng = require("imagemin-optipng");
				const imagemin_webp = require("imagemin-webp");

				const engines = [];

				switch(targetExtension){
				case "webp":
					engines.push(imagemin_webp());
					break;
				case "png":
					engines.push(imagemin_optipng());
					break;
				case "jpg":
				case "jpeg":
					engines.push(imagemin_mozjpeg());
					break;
				default:
					throw new Error(`Does not support minifying to image with extension "${targetExtension}"`);
				}

				await fs.writeFile(
					imageCachePath, 
					await imagemin.buffer(
						await fs.readFile(imagePath),
						{...{"plugins": engines}, ...options},
					),
				).catch(error => {
					throw new Error(
						`Failed to minify "${imagePath}" to extension "${targetExtension}". Error:
						${error}`,
					);
				});
			}

			fs.copySync(imageCachePath, newImagePath);

			return imageSize - fs.statSync(imageCachePath).size;

		})).then(result => {

			return Math.round(result.reduce((a, b) => a + b, 0) / result.length);

		});

	},

	/**
	 * Minifies a file (html, css, js, json, svg) and saves it in the easy-webapp cache folder with a hash reference to the original file.
	 * 
	 * @param	{string}	file_path		- Absolute path of the file to minify.
	 * @param	{string}	cache_directory	- Absolute path of the easy-webapp cache folder.
	 * @param	{object}	[options]		- Options to pass directly to the underlying minifier.
	 * 
	 * @returns {Promise<number>}			- How many bytes were saved in the conversion.
	 * 
	 */
	minifyFile: async (file_path, cache_directory, options) => {

		const extension = path.extname(file_path).toLowerCase();

		const original_hash = (await hashElement(file_path, {"encoding": "hex"})).hash;
		const original_size = fs.statSync(file_path).size;

		const file_cache_path = path.join(cache_directory, original_hash + extension);

		if(!fs.pathExistsSync(file_cache_path)){

			if([".html", ".css", ".js"].includes(extension)){

				const minify = require("minify");

				//console.log(`Minifying '${path.join(file_path)}' with 'minify'`);
				//actions_taken.files_minified.add(file_path);

				await minify(
					file_path,
					{...{img: {maxSize: 0}}, ...options},
				).catch(error => {
					throw new Error(
						`Unable to minify file "${file_path}. Error:
						${error}`,
					);
				}).then(minified => {
					return fs.writeFile(file_cache_path, minified);
				});

			}else if(".json" === extension){

				//console.log(`Minifying '${path.join(file_path)}' with builtin JSON parser`);
				//actions_taken.files_minified.add(file_path);

				await fs.writeFile(
					file_cache_path,
					JSON.stringify(JSON.parse(fs.readFileSync(file_path))),
				);

			}else if(".svg" === extension){

				const svgo = require("svgo");

				//console.log(`Minifying '${path.join(file_path)}' with 'svgo'`);
				//actions_taken.files_minified.add(file_path);

				await fs.writeFile(
					file_cache_path,
					svgo.optimize(
						fs.readFileSync(file_path),
						options,
					).data,
				);

			}else{
				throw new Error(`Does not support minifying file with extension "${extension}"`);
			}

		}
		
		await fs.copy(file_cache_path, file_path);

		return original_size - fs.statSync(file_cache_path).size;

	},

	/**
	 * Removes a file or directory (item).
	 * 
	 * @param	{string}	itemPath	- Absolute path of the item to remove.
	 * 
	 * @returns	{Promise<number>}		- How many bytes were saved by removing the item.
	 * 
	 */
	removeItem: async (itemPath) => {

		const folderSize = require("get-folder-size");

		const itemStats = fs.statSync(itemPath);

		const itemSize = itemStats.isDirectory() ? folderSize(itemPath) : itemStats.size;

		await fs.remove(itemPath);

		return itemSize;

	},


};
