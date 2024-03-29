/**
 * @file
 * These functions handle everything related to setting up and managing the config object.
 */

import path from "node:path";
import objectHash from "object-hash";
import joiBase from "joi";

import { File, deepMerge, importAny } from "./tools.js";
import { log } from "./log.js";

/**
 * Contains a few defaults that are used across the package.
 */
export const defaults = {
	alias: "ewab",
	configName: "ewabconfig",
	interface: "modern",
	imageExtension: "webp",
	imageExtensions: ["webp", "jpg"],
};

export const logInterfaces = {
	modern: "Default, makes the output look nice.",
	minimal: "Will only show what it is currently doing. The only logs persisted after a completed runs are any warnings encountered.",
	basic: "Outputs a simple line-by-line log.",
	none: "No output at all",
	debug: "Outputs a wealth of information that can help figure out why EWAB is doing *that thing*",
};

export const supportedImageExtensions = ["jxl", "avif", "webp", "jpg", "png"];

export const supportedIconPurposes = ["any", "maskable", "monochrome"];


/**
 * Generates the main config object which determines how easy-web-app-builder should operate.
 * 
 * @param {object} callConfig - The call config object (CLI options).
 * @returns {object} - The main config object.
 */
async function generateMain(callConfig){

	let configFromCall;
	try{
		configFromCall = JSON.parse(callConfig.config);
	}catch(error){
		log("error", "Was unable to read the config object passed in the CLI, it seems to be invalid.", error);
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
			// All EWAB files are built as modules. This ensures that they are also minified as such.
			glob: `${mainConfig.alias}/**/*`,
			files: {
				module: true,
			},
		},
		{
			// By default, there is no reason to generate raster versions of an SVG.
			glob: "**/*.svg",
			images: {
				compress: {
					enable: false,
				},
				convert: {
					enable: false,
				},
			},
		},
	);

	mainConfig.hash = objectHash(mainConfig);

	if(mainConfig.alias !== defaults.alias) log(`NOTE: The EWAB alias has been changed to "${mainConfig.alias}". If this alias collides with other names in the project, it could cause weird behavior.`);
	if(mainConfig.ignoreErrors) log("warning", `EWAB has been instructed to ignore errors. This should only be used for debugging purposes. Before publishing to production, please disable config.ignoreErrors.`);

	return mainConfig;

}

/**
 * Tries to find an easy-web-app-builder config file in a given folder.
 * 
 * @param {string} folderPath - Absolute path to folder.
 * @param {string} [configName] - Specify a custom config file name (with/without extension and leading dot).
 * @returns {object} - An array of string rules.
 */
export async function getRootFileConfig(folderPath, configName = defaults.configName){

	log(`Trying to find config file "${configName}" in project root folder`);

	configName = configName.startsWith(".") ? configName : `.${configName}`;

	for(const filePath of [
		path.join(folderPath, `${configName}.js`),
		path.join(folderPath, `${configName}.json`),
		path.join(folderPath, configName),
	]){

		const file = new File({absolutePath: filePath});

		if(await file.exists()){

			log(`Found a config file at "${path.relative(folderPath, filePath)}", attempting to read it`);

			try{

				return await importAny(file);

			}catch(error){
				log("error", `Was unable to read the config file "${path.relative(folderPath, filePath)}", it seems to be invalid.`, error);
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
 * @returns {Promise<object>} - The validated config object.
 */
async function validateConfig(config, source){
	try{
		config = await configOptions.validateAsync(config, {abortEarly: false});
	}catch(error){
		log("error", `Found some unsupported options in the ${source}: ${error.details.map(detail => detail.message).join(", ")}.`, error);
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

		ignoreErrors: joi.boolean().default(false).description("if EWAB should ignore runtime errors"),

		inputPath: joi.string().description("path to the input folder"),

		outputPath: joi.string().description("path to the output folder"),

		manifestPath: joi.string().description("path to the manifest, relative to the input folder"),

		icons: joi.object({

			add: joi.boolean().default(true).description("if custom icons should be added to the app"),

			source: joi.object({

				main: joi.string().description("the main icon"),

				backgroundImage: joi.string().description("a background image to use for maskable icons"),

				backgroundColor: joi.string().description("a background color to use for maskable icons"),

			}),

			custom: joi.object([...supportedIconPurposes].reverse().reduce((object, purpose) => { return { [purpose]: joi.string(), ...object }; }, {})).description("path to the icons to generate all other icons from. Icons are split into purposes: https://developer.mozilla.org/en-US/docs/Web/Manifest/icons#values"),

			mergeMode: joi.object({

				index: joi.string().default("override").valid("override", "combine"),

				manifest: joi.string().default("override").valid("override", "combine"),

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

			compress: joi.object({

				enable: joi.boolean().default(true),

				subject: joi.string().valid("auto", "flat", "organic").default("auto"),

				quality: joi.string().valid("high", "balanced").default("high"),

			}),

			convert: joi.object({

				enable: joi.boolean().default(true),

				updateReferences: joi.boolean().default(true),

				targetExtension: joi.string().valid(
					...supportedImageExtensions,
				).default(defaults.imageExtension),

				targetExtensions: joi.array().items(
					joi.string().valid(...supportedImageExtensions),
				).default(defaults.imageExtensions),

				maxSize: joi.number().integer().positive().default(3840),
				minSize: joi.number().integer().positive().default(64),

				sizeSteps: joi.number().positive().default(0.60),

				size: joi.number().integer().positive().default(1080),

				sizes: joi.array().items(joi.number().integer().positive()),

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



export default { generateMain };
