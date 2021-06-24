

import path from "path";
import fs from "fs-extra";


import { getRootFileConfig } from "../src/config.js";
import { ewabSourcePath } from "../src/tools.js";


export default async function ({type, inputPath}){

	if(!inputPath){
		const rootConfig = await getRootFileConfig(process.cwd);
		inputPath = rootConfig.inputPath;
	}

	switch(type){
		case "all":
			await fs.copy(path.join(ewabSourcePath, "lib/scaffolding"), inputPath);
			break;
		case "html":
			await fs.copyFile(path.join(ewabSourcePath, "lib/scaffolding/index.html"), path.join(inputPath, "index.html"));
			break;
		case "manifest":
			await fs.copyFile(path.join(ewabSourcePath, "lib/scaffolding/manifest.json"), path.join(inputPath, "manifest.json"));
			break;
	}

}
