

import path from "path";
import fs from "fs-extra";


import { getRootFileConfig } from "../src/config.js";
import { ewabSourcePath } from "../src/tools.js";

import chalk from "chalk";


/**
 * @param root0
 * @param root0.type
 * @param root0.inputPath
 */
export default async function ({type, inputPath, silent}){
	
	if(!inputPath){
		const rootConfig = await getRootFileConfig(process.cwd());
		inputPath = rootConfig.inputPath;
	}

	switch(type){
		case "all":
			await fs.copy(path.join(ewabSourcePath, "lib/scaffolding"), inputPath, {overwrite: false});
			finish("Great! You now have a basic website in your source folder.");
			break;
		case "all-overwrite":
			await fs.copy(path.join(ewabSourcePath, "lib/scaffolding"), inputPath, {overwrite: true});
			finish("Great! You now have a basic website in your source folder.");
			break;
		case "html":
			await fs.copyFile(path.join(ewabSourcePath, "lib/scaffolding/index.html"), path.join(inputPath, "index.html"));
			finish("Great! You now have a basic starting HTML file.");
			break;
		case "manifest":
			await fs.copyFile(path.join(ewabSourcePath, "lib/scaffolding/manifest.json"), path.join(inputPath, "manifest.json"));
			finish("Great! You now have a basic starting manifest file.");
			break;
	}

	function finish(message){
		if(!silent) console.log(chalk.bold.cyan(` ${message}`));
	}	

}
