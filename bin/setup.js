
/**
 * @file
 * t
 */

import inquirer from "inquirer";
import fileTree from "inquirer-file-tree-selection-prompt";

const prompt = inquirer.createPromptModule();
prompt.registerPrompt("file-tree", fileTree);

import chalk from "chalk";
import glob from "tiny-glob";

import path from "path";
import fs from "fs-extra";

import { fileExists, deepMerge } from "../src/tools.js";
import { findInputFolderCandidates, decideOutputFolderName } from "../src/files.js";
import scaffold from "./scaffold.js";
import { defaultConfigName } from "../src/config.js";

export default async function (args){

	const p = "\n \n→";
	const s = "\n";

	console.log("");
	console.log(chalk.bgCyan.black("  Welcome to the Easy-WebApp (EWAB) setup wizard  "));
	console.log(chalk.dim("This wizard covers everything a normal user needs. For advanced stuff, check this out: https://github.com/atjn/easy-web-app-builder#advanced"));
	console.log("");
	console.log(chalk.yellow(`NOTE: Some of these operations ${chalk.underline("will overwrite files")} in your project. Make sure to back up anything important first.`));

	//Certain parts of ewabCOnfig must be defined in order to run some of EWABs functions:
	global.ewabConfig = {
		interface: "none",
		alias: args.alias,
		rootPath: args.rootPath || process.cwd(),
	};

	const inputFolderCandidates = findInputFolderCandidates(global.ewabConfig.rootPath);

	let allAnswers = {};

	await prompt([
		{
			name: "cleanSetup",
			type: "list",
			prefix: p, suffix: s,
			message: `What are we doing today?`,
			choices: [
				"Adding EWAB to an existing project",
				"Setting up a new project from scratch",
			],
			filter: answer => Boolean(answer === "Setting up a new project from scratch"),
		},
		{
			when: answers => answers.cleanSetup,
			name: "config.inputPath",
			type: "input",
			prefix: p, suffix: s,
			message: `Which folder should we put the source files in?\n  ${chalk.dim("If you choose a folder that already exists, it will be overridden.")}`,
			default: "source",
			filter: answer => normalizeOutputPaths(answer),
		},
		{
			when: answers => Boolean(!answers.cleanSetup && inputFolderCandidates.length === 1),
			name: "config.inputPath",
			type: "list",
			prefix: p, suffix: s,
			message: `EWAB thinks that the source files for your website are in the folder called '${inputFolderCandidates[0].name}'. Is that correct?`,
			choices: [
				"Yes!",
				"No",
			],
			filter: answer => {
				if(answer === "Yes!"){
					allAnswers.inputFolderCandidateIsValid = true;
					allAnswers.inputPath = inputFolderCandidates[0].name;
				}
				return undefined;
			},
		},
		{
			when: answers => Boolean(!answers.cleanSetup && !allAnswers.inputFolderCandidateIsValid),
			name: "config.inputPath",
			type: "file-tree",
			onlyShowDir: true,
			onlyShowValid: true,
			prefix: p, suffix: s,
			message: `${inputFolderCandidates.length === 1 ? "Alright no problem, which one is it then?" : "The source files for your website should be in a folder somewhere. Which one is that?"}\n  ${chalk.dim("If you haven't made the folder yet, stop this guide and do that first, then try again.")}`,
			validate: async path => Boolean(path !== process.cwd()),
			filter: answer => normalizeOutputPaths(answer),
		},
	])
	.then(answers => allAnswers = deepMerge(allAnswers, answers))
	.catch(error => handleError(error));

	global.ewabConfig.inputPath = allAnswers.inputPath;

	const outputFolderName = decideOutputFolderName(allAnswers.inputPath);

	await prompt([
		{
			name: "config.outputPath",
			type: "list",
			prefix: p, suffix: s,
			message: `When EWAB is done, it needs a folder to save the completed webapp in. It wants to call that folder '${outputFolderName}', is that cool?\n  ${chalk.dim(fs.pathExists(path.join(global.ewabConfig.rootPath, outputFolderName)) ? "A folder already exists at this path. It will be overridden." : "There is no folder at this path right now, so there's no risk something wil be overridden.")}`,
			choices: [
				"Yes!",
				"No, I want to call it something else",
			],
			filter: answer => {
				if(answer === "Yes!") allAnswers.outputFolderNameIsCool = true;
				return undefined;
			},
		},
		{
			when: () => !allAnswers.outputFolderNameIsCool,
			name: "config.outputPath",
			type: "input",
			prefix: p, suffix: s,
			message: `Alright, then what should we call it?\n  ${chalk.dim("If a folder already exists at the path you choose, it will be overridden.")}`,
			default: "public",
			filter: rawPath => {
				const normalizedPath = normalizeOutputPaths(rawPath);
				allAnswers.inputPath = normalizedPath;
				return normalizedPath;
			},
		},
		{
			when: async () => Boolean((await glob("**/*.{html,htm}", {cwd: path.join(process.cwd(), allAnswers.inputPath), absolute: true})).length === 0),
			name: "addScaffolding",
			type: "list",
			prefix: p, suffix: s,
			message: `I can't find any HTML files in your website folder. Should I paste some basic scaffolding into it?\n  ${chalk.dim("Scaffolding includes HTML, CSS, JS files and a logo.")}`,
			choices: [
				"Sounds good, give me all of it",
				"Sure, but only the HTML file",
				"No thanks",
			],
			filter: answer => {
				switch(answer){
					case "Sounds good, give me all of it":
						return "all";
					case "Sure, but only the HTML file":
						return "html";
					default:
						return "no";
				}
			},
		},
	])
	.then(answers => allAnswers = deepMerge(allAnswers, answers))
	.catch(error => handleError(error));

	allAnswers.config.fileExceptions = allAnswers.config.fileExceptions || [];

	const absoluteInputPath = path.join(process.cwd(), allAnswers.inputPath);
	if(allAnswers.cleanSetup){

		await fs.emptyDir(absoluteInputPath);
		await scaffold("all", absoluteInputPath);
		console.log(chalk.bold.cyan(" Great! I just added the source folder to your project and put some scaffolding files into it to help you get started."));

	}else if(allAnswers.addScaffolding === "no"){

		console.log(chalk.bold.cyan(" That's cool, just know that some things won't work until you add valid HTML file."));

	}else if(allAnswers.addScaffolding){

		await scaffold(allAnswers.addScaffolding, absoluteInputPath);
		console.log(chalk.bold.cyan(" Great! These scaffolding files should help you get started."));

	}
	console.log("");


	await prompt([
		{
			when: async () => {
				const foundEnds = [];
				for(const filePath of await glob("**/*[-_.]{dev.*,dev,src.*,src,source.*,source}", {cwd: path.join(process.cwd(), allAnswers.inputPath), absolute: true})){
					const fileEnd = filePath.match(/(?<fileEnd>[-_.](?:dev|src|source)(?:\..*|$))/ui).groups.fileEnd;
					if(!foundEnds.includes(fileEnd)) foundEnds.push(fileEnd);
				}
				if(foundEnds.length === 0){
					return false;
				}else{
					allAnswers.devFileEnds = foundEnds;
					return true;
				}
			},
			name: "removeDevFiles",
			type: "checkbox",
			prefix: p, suffix: s,
			message: () => `I noticed that you have some files that, judging from their name, aren't necessary in production.\n  Should I set up rules that remove files with these endings automatically? Choose the endings to remove.`,
			choices: () => allAnswers.devFileEnds,
			filter: choices => {
				for(const choice of choices){
					allAnswers.config.fileExceptions.push({
						glob: `**/*${choice}`,
						files: {
							remove: true,
						},
					});
				}
				return choices;
			},
		},
		{
			when: async () => {
				const foundExtensions = [];
				for(const filePath of await glob("**/*{.pcss,.scss,.less,.ts,.tsx,config,rc}", {cwd: path.join(process.cwd(), allAnswers.inputPath), absolute: true})){
					const extension = path.extname(filePath);
					if(!foundExtensions.includes(extension)) foundExtensions.push(extension);
				}
				if(foundExtensions.length === 0){
					return false;
				}else{
					allAnswers.unsupportedExtensions = foundExtensions;
					return true;
				}
			},
			name: "removeExtensions",
			type: "checkbox",
			prefix: p, suffix: s,
			message: () => `I noticed that your project contains some build files. (${allAnswers.unsupportedExtensions.join(", ")})\n  Maybe you have already taken this into account, but just remember that EWAB doesn't support any of these files.\n  If you have a build step, I would recommend running it before EWAB, then posting the output into EWABs input folder.\n  \n  Should I set up rules that remove these files automatically? Choose the ones that should be removed.`,
			choices: () => allAnswers.unsupportedExtensions,
			filter: choices => {
				for(const choice of choices){
					allAnswers.config.fileExceptions.push({
						glob: `**/*${choice}`,
						files: {
							remove: true,
						},
					});
				}
				return choices;
			},
		},
		{
			name: "config.icons.add",
			type: "list",
			prefix: p, suffix: s,
			message: `Should EWAB handle your icons for you?\n  ${chalk.dim("EWAB will take your icon, render it in a bunch of different sizes, then use those in the final app.")}`,
			choices: [
				"Yes",
				"No",
			],
			filter: answer => Boolean(answer === "Yes"),
		},
		{
			name: "config.files.minify",
			type: "list",
			prefix: p, suffix: s,
			message: `Should EWAB minify your files?\n  ${chalk.dim("EWAB will minify most files, such as HTML, CSS, JS, SVG.")}`,
			choices: [
				"Yes",
				"No",
			],
			filter: answer => Boolean(answer === "Yes"),
		},
		{
			when: answers => answers.config.files.minify,
			name: "config.files.addSourceMaps",
			type: "list",
			prefix: p, suffix: s,
			message: `Cool beans! Should the minified files include source maps?\n  ${chalk.dim("Source maps are great for debugging, but they also leak your source code to all your users.")}`,
			choices: [
				"Yes",
				"No",
			],
			filter: answer => Boolean(answer === "Yes"),
		},
		{
			name: "useDefaultConfigName",
			type: "list",
			prefix: p, suffix: s,
			message: `That was all! I will save your preferences in a file called ".${defaultConfigName}.js". Is that cool?\n  ${chalk.dim("If you choose a different name, EWAB won't be able to find the file automatically.")}`,
			choices: [
				"Yes!",
				"No, I want to call it something else",
			],
			filter: answer => Boolean(answer === "Yes!"),
		},
		{
			when: answers => !answers.useDefaultConfigName,
			name: "configName",
			type: "input",
			prefix: p, suffix: s,
			message: `Alright, what should I call it then?\n  ${chalk.dim(`When you call EWAB, you'll have to use 'easy-web-app-builder --config-name "yourconfigname"' for it to read your preferences.`)}`,
			default: defaultConfigName,
		},

	])
	.then(answers => allAnswers = deepMerge(allAnswers, answers))
	.catch(error => handleError(error));

	const configFile = `\n/**\n * @file\n * Configuration script for eay-webapp.\n */\n\nexport default ${JSON.stringify(allAnswers.config, null, 2)}\n`;
	await fs.writeFile(path.join(process.cwd(), allAnswers.useDefaultConfigName ? `.${defaultConfigName}.js` : `.${allAnswers.configName}.js`), configFile);


}

function handleError(error){
	if(error.isTtyError){
		console.log("Sorry, but your terminal doesn't support TTY, which is required for this wizard to work. See this list to find a supported terminal: https://github.com/SBoudrias/Inquirer.js#support");
	}else{
		console.log(chalk.bgRed.black("  Sorry, something went wrong. You are welcome to file a bug with the following information at: https://github.com/atjn/easy-web-app-builder/issues/new/choose  "));
		console.error(error);
	}
};

function normalizeOutputPaths(outputPath){
	return path.isAbsolute(outputPath) ? path.relative(process.cwd(), outputPath) : outputPath;
}
