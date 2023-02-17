
import { configOptions } from "../src/config.js";
import { coreFileExtensions } from "../src/serviceworker.js";
const describedConfig = configOptions.describe();

import fs from "fs-extra";
import path from "node:path";
import { ewabSourcePath, ewabPackage, deepClone } from "../src/tools.js";
import { log, bar } from "../src/log.js";

import glob from "tiny-glob";

global.ewabConfig = {interface: "modern"};


const values = {
	coreFileExtensions,
};

const inserters = {
	assert: async function (commands){
		breakDownObject(describedConfig, commands);
		return "";
	},
	getValue: async function (commands){
		const value = values[commands[0]];
		if(Array.isArray(value)){
			return value.map(item => `${"`"}${item}${"`"}`).join(", ");
		}else{
			return JSON.stringify(value);
		}
	},
	describeConfig: async function (commands){

		const { object } = breakDownObject(describedConfig, commands);

		return `${"```js\n"}${printObject(object.keys, 0, { addDescriptions: true })}${"\n```"}`;

	},
	setConfigValue: async function (commands){

		const setValue = commands.pop();
		const { object, workingObject } = breakDownObject(describedConfig, commands);

		const parsedSetValue = JSON.parse(setValue);
		if(workingObject.type && workingObject.type !== typeof parsedSetValue){
			throw new Error(`The value to set (${parsedSetValue}) should be of type '${workingObject.type}', but is of type '${typeof parsedSetValue}'.`);
		}
		if( workingObject.allow && !workingObject.allow.includes(parsedSetValue)){
			throw new Error(`The value to set is '${parsedSetValue}', but it is only allowed to be: ${workingObject.allow.join(", ")}`);
		}

		delete workingObject.type;
		delete workingObject.allow;
		workingObject.flags = workingObject.flags ?? {};
		workingObject.flags.default = setValue;

		return `${"```js\n"}${printObject(object.keys, 0, { addTrailingComma: true })}${"\n```"}`;

	},
	fullAPI: async function (commands){
		const apiName = commands[0];
		let text = "# Full API\n";
		if(describedConfig.keys[apiName]){
			text += `The complete global API looks like this:\n${await this.describeConfig([apiName])}\n`;
		}
		if(describedConfig.keys.fileExceptions.items[0].keys[apiName]){
			text += `The complete local file API looks like this:\n${await this.describeConfig(["fileExceptions", 0, apiName])}\n`;
		}
		text += "\n[See API for the entire project](./config.md).\n";
		return text;
	},
	backButton: async function (commands){
		const link = commands[0] ?? "../README.md";
		return `_[<- Back to the main page](${link})_`;
	},
};

/**
 * @param sourceObject
 * @param commands
 */
function breakDownObject(sourceObject, commands){
	const object = deepClone(sourceObject);
	let workingObject = object;
	for(const command of commands){
		if(workingObject.type === "array"){
			workingObject.items = [workingObject.items[command]];
			workingObject = workingObject.items[command];
		}else{
			for(const key of Object.keys(workingObject.keys ?? {})){
				if(key !== command && key !== "glob") delete workingObject.keys[key];
			}
			workingObject = workingObject.keys[command];
		}
		if(!workingObject) throw Error(`The given object name '${command}' doesn't exist.`);
	}
	return {
		object,
		workingObject,
	};
}

/**
 * @param object
 * @param indentation
 * @param options
 * @param firstRun
 */
function printObject(object, indentation, options = {}, firstRun = true){

	if(Object.keys(object ?? {}).length === 0) return "Object";

	const i = " ".repeat(indentation + 2);

	let string = object.type === "array" ? `[` : `{`;

	for(const [ key, value ] of object.type === "array" ? (object.items ?? []).map(value => ["", value]) : Object.entries(object ?? {})){
		if(value.flags?.description && !options.addDescriptions) value.flags.description = undefined;
		if(value.flags?.description){
			string += `\n${i}//${value.flags.description}`;
		}
		string += `\n${i}`;
		if(key) string += `${key}: `;
		switch(value.type){
			case "object":
				string += printObject(value.keys, indentation + 2, options, false);
				break;
			case "array":
				string += printObject(value, indentation + 2, options, false);
				break;
			default:
				if(value.type) string += value.type.charAt(0).toUpperCase() + value.type.slice(1);
				if(value.flags?.default !== undefined && value.type !== "array"){
					string += `${value.type ? ": " : ""}${value.type === "string" ? `"` : ``}${value.flags.default}${value.type === "string" ? `"` : ``}`;
				}
				if(value.allow){
					string += ` ("${value.allow.join(`", "`)}")`;
				}
				if(options.addTrailingComma){
					string += ",";
				}
				break;
		}
		
		if(value.flags?.description) string += `\n${i}`;

	}

	string += `\n${" ".repeat(indentation)}${object.type === "array" ? "]" : "}"}${firstRun ? "" : ","}`;

	return string;

}

bar.begin("Building docs");

await fs.remove(path.join(ewabSourcePath, "docs"));
await fs.copy(path.join(ewabSourcePath, "docs-source"), path.join(ewabSourcePath, "docs"));

const markdownPaths = await glob("**/*.{md}", {cwd: path.join(ewabSourcePath, "docs"), absolute: true});

for(const markdownPath of markdownPaths){
	bar(markdownPaths.indexOf(markdownPath) / markdownPaths.length, `Generating ${path.relative(ewabSourcePath, markdownPath)}`);

	let doc = await fs.readFile(markdownPath, "utf-8");

	if(!markdownPath.includes("main.md")) doc = `insert[backButton]\n${doc}`;

	for(const match of doc.matchAll(/(?:^|\W)(?<snippet>insert\[(?<command>[^\]]*?)\])(?:\W|$)/gu)){

		const command = match.groups.command.split(" ");

		doc = doc.replace(match.groups.snippet, await inserters[command.shift()](command));
		
	}

	doc += `\n---\n<p style="opacity:.8;font-style:italic;text-align:right">This documentation was generated for <a href="${ewabPackage.homepage}">Easy Web App Builder</a> ${ewabPackage.version}</p>\n`;

	await fs.writeFile(markdownPath, doc);
}

await fs.move(path.join(ewabSourcePath, "docs/main.md"), path.join(ewabSourcePath, "README.md"), {overwrite: true});

bar.end("Build docs");
log("modern-only", "");
