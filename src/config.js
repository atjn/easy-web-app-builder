/* global ewabConfig */

/**
 * @file
 * These functions handle everything related to setting up and managing the config object.
 */

import path from "path";
import minimatch from "minimatch";
import objectHash from "object-hash";
import joiBase from "joi";

import { fileExists, deepMerge, importAny } from "./tools.js";
import { log } from "./log.js";

/**
 * Contains a few defaults that are used across the package.
 */
export const defaults = {
	alias: "ewab",
	configName: "ewabconfig",
	interface: "modern",
	imageExtension: "webp",
	imageExtensions: ["webp", "jxl"],
};

export const logInterfaces = {
	modern: "Default, makes the output look nice.",
	minimal: "Will only show what it is currently doing. The only logs persisted after a completed runs are any warnings encountered.",
	basic: "Outputs a simple line-by-line log.",
	none: "No output at all",
	debug: "Outputs a wealth of information that can help figure out why EWAB is that *that thing*",
};

export const supportedImageExtensions = ["webp", "jxl", "avif", "jpg", "png"];


/**
 * Generates the main config object which determines how easy-web-app-builder should operate.
 * 
 * @param	{object}	callConfig	- The call config object (CLI options).
 * 
 * @returns	{object}				- The main config object.
 * 
 */
async function generateMain(callConfig){

	let configFromCall;
	try{
		configFromCall = JSON.parse(callConfig.config);
	}catch(error){
		log("error", "Was unable to read the config object passed in the CLI, it seems to be invalid.");
	}

	log.warmup(configFromCall.interface);

	const configFromFile = await getRootFileConfig(callConfig.rootPath, callConfig.configName);

	log("Validating and combining config objects");

	await Promise.all([
		validateConfig(configFromCall, "CLI config object"),
		validateConfig(configFromFile, "root config file"),
	]);

	const mainConfig = await validateConfig(deepMerge(
		configFromFile,
		configFromCall,
	), "combined config object");

	log.warmup(mainConfig.interface);

	mainConfig.rootPath = callConfig.rootPath;
	mainConfig.cachePath = mainConfig.cachePath ?? path.join(mainConfig.rootPath, `.${mainConfig.alias}-cache`);

	mainConfig.fileExceptions.push(
		{
			glob: `${mainConfig.alias}/icons/**/*`,
			images: {
				compress: false, //TEMPORARY
				convert: false,
				targetExtension: "png",
			},
		},
		{
			glob: `${mainConfig.alias}/**/*`,
			files: {
				module: true,
			},
		},
	);

	mainConfig.hash = objectHash(mainConfig);

	if(mainConfig.alias !== defaults.alias) log(`NOTE: The EWAB alias has been changed to '${mainConfig.alias}'. If this alias collides with other names in the project, it could cause weird behavior.`);

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

	const localFilePath = path.relative(ewabConfig.workPath, filePath);

	let exceptionsConfig = {};

	for(const exception of ewabConfig.fileExceptions){

		if(minimatch(localFilePath, exception.glob)){

			exceptionsConfig = deepMerge(exceptionsConfig, exception);
			delete exceptionsConfig.glob;

		}

	}

	return deepMerge(ewabConfig, exceptionsConfig);

}

/**
 * Tries to find an easy-web-app-builder config file in a given folder.
 * 
 * @param	{string}	folderPath		- Absolute path to folder.
 * @param	{string}	[configName]	- Specify a custom config file name (with/without extension and leading dot).
 * 
 * @returns	{object}					- An array of string rules.
 * 
 */
export async function getRootFileConfig(folderPath, configName = defaults.configName){

	log(`Trying to find config file '${configName}' in project root folder`);

	configName = configName.startsWith(".") ? configName : `.${configName}`;

	for(const filePath of [
		path.join(folderPath, `${configName}.js`),
		path.join(folderPath, `${configName}.json`),
		path.join(folderPath, configName),
	]){

		if(fileExists(filePath)){

			log(`Found a config file at '${path.relative(folderPath, filePath)}', attempting to read it`);

			try{

				return await importAny(filePath);

			}catch(error){
				log("error", `Was unable to read the config file '${path.relative(folderPath, filePath)}', it seems to be invalid.`);
			}

		}
	}

}

/**
 * Validates a config object. This method will not catch everything, but it will catch common issues with wrong types and misspellings.
 * If a value is not present, the default value is set.
 * 
 * @param {object}	config	- The config object to validate.
 * @param {string}	source	- Text description of where the config object is coming from, used for logging.
 * 
 * @returns {Promise<object>} - The validated config object.
 * 
 */
async function validateConfig(config, source){
	try{
		config = await configOptions.validateAsync(config, {abortEarly: false});
	}catch(error){
		log("error", `Found some unsupported options in the ${source}: ${error.details.map(detail => detail.message).join(", ")}.`);
	}
	log(`The ${source} seems to be valid`);
	return config;
}

const joi = joiBase.defaults(schema => {
	switch (schema.type) {
		case "array":
			return schema.default([]);
		case "object":
			return schema.default();
		default:
			return schema;
	}
});

const options = {

	global: {

		alias: joi.string().default(defaults.alias).pattern(/^[a-zA-Z][0-9a-zA-Z_]*[a-zA-Z]$/um, "symbol").description("the name EWAB uses when adding elements to the web app"),

		interface: joi.string().default(defaults.interface).description("how progress is logged to the console")
			.valid(...Object.keys(logInterfaces)),

		useCache: joi.boolean().default(true).description("if a cache should be used to speed up consecutive runs"),

		inputPath: joi.string().description("path to the input folder"),

		outputPath: joi.string().description("path to the output folder"),

		manifestPath: joi.string().description("path to the manifest, relative to the input folder"),

		icons: joi.object({

			add: joi.boolean().default(true).description("if custom icons should be added to the app"),

			source: joi.string().description("path to the icon to generate all other icons from"),

			list: joi.array().items(
				joi.string(),
			).description("list of all icons currently in the project"),

			blockList: joi.array().items(
				joi.string(),
			),

			mergeMode: joi.object({

				index: joi.string().default("override")
					.valid("override", "combine"),

				manifest: joi.string().default("override")
				.valid("override", "combine"),

			}),

		}),

		serviceworker: joi.object({

			add: joi.boolean().default(false),

			clean: joi.boolean().default(false),

			debug: joi.boolean().default(false),

			networkTimeoutSeconds: joi.number().positive().default(4),

			displayUpdateDialog: joi.boolean().default(true),

			instantUpdateWindowSeconds: joi.number().integer().positive().default(2),

			periodicUpdateCheckHours: joi.number().integer().positive().default(1),

			customRules:  joi.array().items(
				joi.object(),
			),

		}),

	},
	
	universal: {

		files: joi.object({

			minify: joi.boolean().default(true),

			module: joi.boolean(),

			addSourceMaps: joi.boolean().default(true),

			directOptions: joi.object(),

		}),

		images: joi.object({

			compress:			joi.boolean().default(true),
			quality:			joi.number().min(0).max(1).default(0.999),
			convert:			joi.boolean().default(true),
			updateReferences:	joi.boolean().default(true),
			keepOriginal:		joi.boolean().default(true),

			targetExtension: joi.string().valid(...supportedImageExtensions).default(defaults.imageExtension),

			targetExtensions: joi.array().items(
				joi.string().valid(...supportedImageExtensions),
			).default(defaults.imageExtensions),

			resize: joi.object({

				auto: joi.boolean().default(true),

				fallbackSize: joi.number().integer().positive(),

				maxSize: joi.number().integer().positive().default(2560),

				sizes: joi.string(),

				addSizesTagToImg: joi.boolean().default(true),

				customSizes: joi.array().items(
					joi.object({
						width: joi.number().integer().positive(),
						height: joi.number().integer().positive(),
					}),
				),

			}),

			encoderOptions: joi.object([...supportedImageExtensions].reverse().reduce((object, extension) => { return { [extension]: joi.object(), ...object }; }, {})),

		}),

	},

	local: {
		glob: joi.string().description("glob pattern to match file with"),
		serviceworker: joi.object({
			type: joi.string().valid("static", "online", "core"),
		}),
	},

};

export const configOptions = joi.object({

	...deepMerge(options.global, options.universal),

	fileExceptions: joi.array().items(joi.object(
		
		deepMerge(
			{remove: joi.boolean().default(false)},
			deepMerge(
				options.local, 
				options.universal,
			),
		),

	)).description("alter the settings for certain files"),

});



export default { generateMain, generateForFile };
