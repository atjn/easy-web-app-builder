
/**
 * @file
 * t.
 */

import inquirer from "inquirer";
import fileTree from "inquirer-file-tree-selection-prompt";

const prompt = inquirer.createPromptModule();
prompt.registerPrompt("file-tree", fileTree);

import chalk from "chalk";
import glob from "tiny-glob";

import path from "node:path";
import fs from "fs-extra";

import { fileExists, deepMerge, ewabPackage } from "../src/tools.js";
import { findInputFolderCandidates, decideOutputFolderName } from "../src/files.js";
import scaffold from "./scaffold.js";
import { defaults } from "../src/config.js";

import detectIndent from "detect-indent";

/**
 * @param args
 */
export default async function (args){

	const p = "\n \n→";
	const s = "\n";

	console.log("");
	console.log(chalk.bgCyan.black("  Welcome to the Easy Web App Builder (EWAB) setup wizard  "));
	console.log(chalk.dim("This wizard covers everything a normal user needs. For advanced stuff, look here: https://github.com/atjn/easy-web-app-builder#advanced"));
	console.log("");
	console.log(chalk.yellow(`NOTE: Some of these operations ${chalk.underline("will overwrite files")} in your project. Make sure to back up anything important first.`));

	//Certain parts of ewabConfig must be defined in order to run some of EWABs functions:
	global.ewabConfig = {
		interface: "none",
		alias: "ewab",
		rootPath: args.rootPath ?? process.cwd(),
	};

	const inputFolderCandidates = findInputFolderCandidates(global.ewabConfig.rootPath);

	let allAnswers = {};
	const metaData = {};
	await runPrompt({
		ui: [
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
				message: `Which folder should we put the source files in?\n  ${chalk.dim("If you choose a folder that already exists, it will be overwritten.")}`,
				default: "source",
				filter: answer => normalizeOutputPaths(answer),
			},
			{
				when: answers => !answers.cleanSetup && inputFolderCandidates.length === 1,
				name: "config.inputPath",
				type: "list",
				prefix: p, suffix: s,
				message: `EWAB thinks that the source files for your website are in the folder called "${inputFolderCandidates[0]?.name}". Is that correct?`,
				choices: [
					"Yes!",
					"No",
				],
				filter: answer => {
					if(answer === "Yes!"){
						allAnswers.inputFolderCandidateIsValid = true;
						allAnswers.inputPath = inputFolderCandidates[0]?.name;
					}
					return undefined;
				},
			},
			{
				when: answers => !answers.cleanSetup && !allAnswers.inputFolderCandidateIsValid,
				name: "config.inputPath",
				type: "file-tree",
				onlyShowDir: true,
				onlyShowValid: true,
				prefix: p, suffix: s,
				message: `${inputFolderCandidates.length === 1 ? "Alright no problem, which one is it then?" : "The source files for your website should be in a folder somewhere. Which one is that?"}\n  ${chalk.dim("If you haven't made the folder yet, stop this guide and do that first, then try again.")}`,
				validate: async path => path !== global.ewabConfig.rootPath,
				filter: answer => normalizeOutputPaths(answer),
			},
		],
		handler: async () => {
			global.ewabConfig.inputPath = allAnswers.inputPath;
		},
	});

	await runIntermediate(async () => {
		metaData.outputFolderName = decideOutputFolderName(allAnswers.inputPath);
	});

	await runPrompt({
		ui: [
			{
				name: "config.outputPath",
				type: "list",
				prefix: p, suffix: s,
				message: `When EWAB is done, it needs a folder to save the completed webapp in. It wants to call that folder "${metaData.outputFolderName}", is that cool?\n  ${chalk.dim(fs.pathExists(path.join(global.ewabConfig.rootPath, metaData.outputFolderName)) ? "A folder already exists at this path. It will be overwritten." : "There is no folder at this path right now, so there's no risk something wil be overwritten.")}`,
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
				message: `Alright, then what should we call it?\n  ${chalk.dim("If a folder already exists at the path you choose, it will be overwritten.")}`,
				default: "public",
				filter: rawPath => {
					const normalizedPath = normalizeOutputPaths(rawPath);
					allAnswers.outputPath = normalizedPath;
					return normalizedPath;
				},
			},
			{
				when: async answers => Boolean(!answers.cleanSetup && (await glob("**/*.{html,htm}", {cwd: path.join(global.ewabConfig.rootPath, allAnswers.inputPath), absolute: true})).length === 0),
				name: "addScaffolding",
				type: "list",
				prefix: p, suffix: s,
				message: `It doesn't seem like the folder contains a valid website right now. Should I paste scaffolding for a basic website into it?\n  ${chalk.dim("The basic website is complete with CSS files, JS files, a manifest, and a logo.")}`,
				choices: [
					"Please do, but don't overwrite existing files",
					"Please do, and overwrite existing files if necessary",
					"Sure, but only paste what is absolutely necessary in order to make the website valid",
					"No thanks",
				],
				filter: answer => {
					switch(answer){
						case "Please do, but don't overwrite existing files":
							return "all";
						case "Please do, and overwrite existing files if necessary":
							return "all-overwrite";
						case "Sure, but only paste what is absolutely necessary in order to make the website valid":
							return "html";
						default:
							return "no";
					}
				},
			},
		],
		handler: async () => {
			allAnswers.config.fileExceptions = allAnswers.config.fileExceptions ?? [];

			metaData.absoluteInputPath = path.join(global.ewabConfig.rootPath, global.ewabConfig.inputPath);

			if(allAnswers.cleanSetup){

				await fs.emptyDir(metaData.absoluteInputPath);
				await scaffold({
					type: "all-overwrite",
					inputPath: metaData.absoluteInputPath,
					silent: true,
				});
				console.log(chalk.bold.cyan(" Great! I just added the source folder to your project and put some scaffolding files into it to help you get started."));
		
			}else if(allAnswers.addScaffolding === "no"){
		
				console.log(chalk.bold.cyan(" That's cool, just know that some things won't work with an invalid website."));
		
			}else if(allAnswers.addScaffolding){
		
				await scaffold({
					type: allAnswers.addScaffolding, 
					inputPath: metaData.absoluteInputPath,
					silent: true,
				});
				console.log(chalk.bold.cyan(" Great! These scaffolding files should help you get started."));
		
			}
		},
	});
	await runPrompt({
		ui: [
			{
				when: async () => {
					const foundEnds = [];
					for(const filePath of await glob("**/*[-_.]{dev.*,dev,src.*,src,source.*,source}", {cwd: path.join(global.ewabConfig.rootPath, allAnswers.inputPath), absolute: true})){
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
							remove: true,
						});
					}
					return choices;
				},
			},
			{
				when: async () => {
					const foundExtensions = [];
					for(const filePath of await glob("**/*{.pcss,.scss,.less,.ts,.tsx,config,rc}", {cwd: path.join(global.ewabConfig.rootPath, allAnswers.inputPath), absolute: true})){
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
					fs.emptyDirSync(metaData.absoluteInputPath);
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
				message: `I will save your preferences in a file called ".${defaults.configName}.js". Is that cool?\n  ${chalk.dim("If you choose a different name, EWAB won't be able to find the file automatically.")}`,
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
				message: `Alright, what should I call it then?\n  ${chalk.dim(`When you call EWAB, you'll have to use '${ewabPackage.name} --config-name "yourconfigname"' for it to read your preferences.`)}`,
				default: defaults.configName,
			},

		],
		handler: async () => {
			const configFile = `\n/**\n * @file\n * Configuration script for easy-web-app-builder.\n */\n\nexport default ${JSON.stringify(allAnswers.config, null, 2)}\n`;
			await fs.writeFile(path.join(global.ewabConfig.rootPath, allAnswers.useDefaultConfigName ? `.${defaults.configName}.js` : `.${allAnswers.configName}.js`), configFile);
		},
	});
	await runPrompt({
		ui: [
			{
				when: async () => {
					const filePath = path.join(global.ewabConfig.rootPath, ".gitignore");
					if(await fileExists(filePath)){
						const contents = await fs.readFile(filePath, "utf-8");
						return !contents.includes(ewabPackage.name) && !contents.includes(global.ewabConfig.alias);
					}
					return false;
				},
				name: "addGitIgnoreEntries",
				type: "list",
				prefix: p, suffix: s,
				message: `Should I configure Git to ignore build- and cache files from EWAB?`,
				choices: [
					"Yes",
					"No",
				],
				filter: answer => Boolean(answer === "Yes"),
			},
		],
		handler: async () => {
			if(allAnswers.addGitIgnoreEntries){
				fs.appendFile(path.join(global.ewabConfig.rootPath, ".gitignore"), `\n\n# Ignore output from ${ewabPackage.name}:\n.${global.ewabConfig.alias}-cache\n${allAnswers.outputFolderNameIsCool ? metaData.outputFolderName : allAnswers.config.outputPath}\n\n`);
			}
		},
	});
	await runPrompt({
		ui: [
			{
				when: async () => {
					const filePath = path.join(global.ewabConfig.rootPath, "package.json");
					if(await fileExists(filePath)){
						try{
							const json = await fs.readJson(filePath);
							if(!json.scripts?.build?.includes(ewabPackage.name)) return true;
						}catch(error){
							return false;
						}
					}
					return false;
				},
				name: "addBuildScript",
				type: "list",
				prefix: p, suffix: s,
				message: `Should I configure npm to run EWAB as part of 'npm run build'?`,
				choices: [
					"Yes",
					"No",
				],
				filter: answer => Boolean(answer === "Yes"),
			},
		],
		handler: async () => {
			if(allAnswers.addBuildScript){
				const filePath = path.join(global.ewabConfig.rootPath, "package.json");
				const fileContents = await fs.readFile(filePath, "utf-8");
				const indentation = detectIndent(fileContents).indent || "\t";
				const json = JSON.parse(fileContents);
				if(!json.scripts) json.scripts = {};
				json.scripts.build = `${json.scripts.build ? `${json.scripts.build} && ` : ""}npx ${ewabPackage.name}`;
				await fs.writeJson(filePath, json, {spaces: indentation});
			}
		},
	});


	/**
	 * @param handler
	 */
	async function runIntermediate(handler){
		await handler()
		.catch(error => handleError(error));
	}

	/**
	 * @param promptData
	 */
	async function runPrompt(promptData){

		await prompt(promptData.ui)
		.then(answers => allAnswers = deepMerge(allAnswers, answers))
		.catch(error => handleError(error));

		if(promptData.handler){
			await promptData.handler()
			.catch(error => handleError(error));
		}

	}


}

/**
 * @param error
 */
function handleError(error){
	if(error.isTtyError){
		console.log("Sorry, but your terminal doesn't support TTY, which is required for this wizard to work. See this list to find a supported terminal: https://github.com/SBoudrias/Inquirer.js#support");
	}else{
		console.log(chalk.bgRed.black("  Sorry, something went wrong. You are welcome to file a bug with the following information at: https://github.com/atjn/easy-web-app-builder/issues/new/choose  "));
		console.error(error);
		console.log(`\n${chalk.cyan("There is a good chance that the rest of the guide still works fine despite this error.")}`);
	}
}

/**
 * @param outputPath
 */
function normalizeOutputPaths(outputPath){
	return path.isAbsolute(outputPath) ? path.relative(global.ewabConfig.rootPath, outputPath) : outputPath;
}
