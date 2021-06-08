
import path from "path";
import fs from "fs-extra";


import { EWASourcePath } from "../src/compat.js";
import { getRootFileConfig } from "../src/config.js";

export default async function (type, inputPath){

	if(!inputPath){
		const rootConfig = await getRootFileConfig(process.cwd);
		inputPath = rootConfig.inputPath;
	}

	switch(type){
		case "all":
			await fs.copy(path.join(EWASourcePath, "src/injectables/generic"), inputPath);
			break;
		case "html":
			await fs.copyFile(path.join(EWASourcePath, "injectables/generic/index.html"), path.join(inputPath, "index.html"));
			break;
		case "manifest":
			await fs.copyFile(path.join(EWASourcePath, "injectables/generic/manifest.json"), path.join(inputPath, "manifest.json"));
			break;
	}

}
