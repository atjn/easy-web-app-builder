

/**
 * @file
 * These functions handle any compatibility issues with packages or the Node environment.
 * As time passes, it should be possible to replace these functions with native methods.
 */

import fs from "fs-extra";
import url from "url";
import path from "path";
import tools from "./tools.js";
import os from "os";

import { promisify } from "util";
//import imageSizeCallback from "image-size";
//const imageSize = promisify(imageSizeCallback);
import { exec as execCallback, spawn } from "child_process";
//const exec = promisify(execCallback);

/*
export async function getImageSize(imagePath){

	return await imageSize(imagePath);

}
*/

export async function squoosh(image, options){

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "node-squoosh-api-"));
	const imagePath = path.join(tmpDir, "image");

	fs.writeFileSync(imagePath, image);

	const optionStrings = [];

	for(const key of Object.keys(options)){
		if([
			"v",
			"version",
			"d",
			"output-dir",
			"s",
			"suffix",
			"h",
			"help",
		].includes(key.toLowerCase())){
			continue;
		}
		//optionStrings.push(`--${key} "${typeof options[key] === "string" ? options[key] : JSON.stringify(options[key])}"`);
		optionStrings.push(`--${key} ${JSON.stringify(options[key])}`);
	}

	const run = async (command, args) => {

		const process = spawn(command, args, {timeout: 600000});

		process.stdout.on("data", data => {
			console.log(data.toString());
		});

		process.stderr.on("data", data => {
			throw new Error(`The Squoosh process encountered an error: ${data.toString()}`);
		});

		process.on("close", code => {
			if(code === 0){
				return;
			}else{
				throw new Error(`The Squoosh process exited with code: ${code}`);
			}
		});

	};

	await run();

	//await exec(`squoosh-cli ${optionStrings.join(" ")} --output-dir "${tmpDir}" "${imagePath}"`, {timeout: 300000});

	

	const minifiedImages = new Map();

	for(const name of fs.readdirSync(tmpDir)){
		const minifiedImagePath = path.join(tmpDir, name);
		if(!fs.lstatSync(minifiedImagePath).isFile()) continue;
		const extension = path.extname(minifiedImagePath);
		if(extension) minifiedImages.set(extension.substring(1), fs.readFileSync(minifiedImagePath));
	}

	await fs.rm(tmpDir, {recursive: true});

	return minifiedImages;


}


/**
 * The absolute path to the directory that easy-webapp is running out of.
 */
export const EWASourcePath = path.join(url.fileURLToPath(import.meta.url), "../../");


/**
 * Has the same behavior as `import`, but also allows importing JSON files.
 * This feature is coming to Node: https://nodejs.org/docs/latest/api/esm.html#esm_json_modules.
 * 
 * @param	{string}	filePath	- Absolute path to the file being imported.
 * 
 * @returns	{any}					- Whatever the file was exporting.
 * 
 */
export async function importAny(filePath){

	let data = {};

	switch(tools.getExtension(filePath)){
		case "js": {
			const module = await import(filePath);
			data = module.default;
			break;
		}
		case "json": {
			data = await fs.readJson(filePath);
			break;
		}
	}

	return data;

}
