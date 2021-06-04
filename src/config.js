/* global ewaConfig */

/**
 * @file
 * These functions handle everything related to setting up and managing the config object.
 */

import path from "path";
import minimatch from "minimatch";
import deepmerge from "deepmerge";
import objectHash from "object-hash";

import { fileExists } from "./tools.js";
import { log } from "./log.js";
import { importAny } from "./compat.js";

const cwd = process.cwd();


/**
 * Generates the main config object which determines how easy-webapp should operate.
 * 
 * @param	{object}	callConfig	- The call config object (CLI options).
 * 
 * @returns	{object}				- The main config object.
 * 
 */
async function generateMain(callConfig){

	validate(callConfig, "call");
	const rootPath = callConfig.rootPath || cwd;
	
	const rootFileConfig = await getRootFileConfig(rootPath, callConfig.configName);
	validate(rootFileConfig, "main");

	log("Merging all config sources into the main config object");

	const mainConfig = deepmerge.all([
		defaults,
		rootFileConfig,
		mapCall(callConfig),
		{"rootPath": rootPath},
	]);

	mainConfig.fileExceptions.push(
		{
			glob: `${mainConfig.alias}/icons/**/*`,
			images: {
				minify: false,
			},
		},
		{
			glob: `**/@(${mainConfig.alias}-serviceworker.js|workbox-*.js)`,
			files: {
				minify: false,
			},
		},
	);

	mainConfig.cachePath = mainConfig.cachePath || path.join(mainConfig.rootPath, `.${mainConfig.alias}-cache`);

	mainConfig.hash = objectHash(mainConfig);

	return mainConfig;

}

/**
 * Generates a config object for a given local file, taking into account any `fileExceptions`.
 * 
 * @param	{string}	filePath	- Absolute path of the file to build a config for.
 * 
 * @returns	{object}				- A config object for the file.
 * 
 */
function generateForFile(filePath){

	const localFilePath = path.relative(ewaConfig.workPath, filePath);

	let exceptionsConfig = {};

	for(const exception of ewaConfig.fileExceptions){

		if(minimatch(localFilePath, exception.glob)){

			exceptionsConfig = deepmerge(exceptionsConfig, exception);
			delete exceptionsConfig.glob;

		}

	}

	return deepmerge(ewaConfig, exceptionsConfig);

}


/**
 * Many of the CLI options directly affect options in the config object.
 * This function maps the CLI options to a config object so they can be merged with the active config object.
 * 
 * @param	{object}	callConfig		- The CLI call configuration.
 * 
 * @returns	{object}					- A config object.
 * 
 */
function mapCall(callConfig){

	const directAllowList = [
		"interface",
		"useCache",
	];
	const scopedAllowList = [
		//rootPath is handled when the main config is generated
		"configName",
	];


	const config = {call: {}};

	for(const key of directAllowList){
		if(callConfig[key] !== undefined) config[key] = callConfig[key];
	}
	for(const key of scopedAllowList){
		if(callConfig[key] !== undefined) config.call[key] = callConfig[key];
	}

	return config;

}

/**
 * Tries to find an easy-webapp config file in a given folder.
 * 
 * @param	{string}	folderPath		- Absolute path to folder.
 * @param	{string}	[configName]	- Specify a custom config file name (with/without extension and leading dot).
 * 
 * @returns	{object}					- An array of string rules.
 * 
 */
async function getRootFileConfig(folderPath, configName = "ewaconfig"){

	log(`Trying to find config file '${configName}' in project root folder`);

	configName = configName.startsWith(".") ? configName : `.${configName}`;

	for(const filePath of [
		path.join(folderPath, `${configName}.js`),
		path.join(folderPath, `${configName}.json`),
		path.join(folderPath, configName),
	]){

		if(fileExists(filePath)){

			log(`Found a config file at '${path.relative(folderPath, filePath)}', attempting to read it`);

			return await importAny(filePath);

		}
	}

}

/**
 * Validates a config object. This method will not catch everything, but it will catch common issues with wrong types and misspellings.
 * 
 * @param	{object}			config	- The config object to validate.
 * @param	{"main"|"call"}		type	- Which type of config it is.
 * 
 * @returns	{true | Error}				- If the config object passed validation.
 * 
 */
function validate(config, type){

	log(`Validating ${type === "call" ? "the" : "a"} ${type} config`);

	if(type === "call"){
		return Boolean(config);
	}

	return Boolean(config);

	/*
	
	const {Schema} = require("validate");

	const mask = new Schema({

	});
	
	*/

}

/**
 * The default config object which defines much of easy-webapps default behavior.
 */
const defaults = {

	alias: "ewa",
	configName: "ewaconfig",
	interface: "modern",
	useCache: true,

	inputPath: "/source",
	outputPath: "/public",

	indexPath: "index.html",
	manifestPath: "manifest.json",
	
	icons: {
		add: true,
		source: "",
		list: [],
		blockList: [],
		mergeMode: {
			index: "override",
			manifest: "override",
		},
	},

	serviceworker: {
		add: false,
		clean: false,
	},

	files: {
		minify: true,
		addSourceMaps: true,
		directOptions: {},
	},

	images: {
		minify: true,
		convert: true,
		updateReferences: true,
		keepOriginalFormat: true,
		targetExtension: "webp",
		targetExtensions: [ "webp", "jxl" ],
		resize: {
			auto: true,
			fallbackSize: undefined,
			maxSize: 2560,
			sizes: "",
			addSizesTagToImg: true,
			customSizes: [],
		},
	},

	fileExceptions: [],
	
};

export default { generateMain, generateForFile };
