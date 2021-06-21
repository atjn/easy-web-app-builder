

/**
 * @file
 * These functions handle any compatibility issues with packages or the Node environment.
 */

import fs from "fs-extra";
import url from "url";
import path from "path";
import { getExtension } from "./tools.js";


/**
 * The absolute path to the directory that easy-web-app-builder is running out of.
 */
export const ewabSourcePath = path.join(url.fileURLToPath(import.meta.url), "../../");


/**
 * Has the same behavior as `import`, but also allows importing JSON files.
 * This feature is coming to Node: https://nodejs.org/docs/latest/api/esm.html#esm_json_modules.
 * 
 * @param	{string}	filePath	- Absolute path to the file being imported.
 * 
 * @returns	{any}	- Whatever the file was exporting. If it was a JSON file, the JSON is returned as text.
 * 
 */
export async function importAny(filePath){

	let data = {};

	switch(getExtension(filePath)){
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
