
import { configOptions } from "../src/config.js";
import { ewabSourcePath } from "../src/compat.js";

import fs from "fs-extra";
import path from "path";

await fs.copy(path.join(ewabSourcePath, "build-docs/templates"), path.join(ewabSourcePath, "docs"));

let doc = await fs.readFile(path.join(ewabSourcePath, "docs/config.md"));

doc += "```js\n" + printObject((configOptions.describe()).keys) + "\n```\n\n\n";

await fs.writeFile(path.join(ewabSourcePath, "docs/config.md"), doc);

function printObject(object, indentation = 0){

	if(Object.keys(object || {}).length === 0) return "Object"

	const i = " ".repeat(indentation + 2);

	let string = `{`;

	for(const [ key, value ] of Object.entries(object || {})){
		switch(value.type){
			case "object":
				string += `\n${i}${key}: `;
				string += printObject(value.keys, indentation + 2);
				break;
			case "array":
				string += `\n${i}${key}: `;
				string += printArray(value, indentation + 2);
				break;
			default:
				string += `\n${i}${key}: `;
				if(value.type === "boolean") value.flags.default = value.flags.default || false;
				string += value.type.charAt(0).toUpperCase() + value.type.slice(1);
				if(value.flags?.default !== undefined && value.type !== "array"){
					string += `: ${value.type === "string" ? `"` : ``}${value.flags.default}${value.type === "string" ? `"` : ``}`;
				}
				if(value.allow){
					string += ` ("${value.allow.join(`", "`)}")`;
				}
				break;
		}

	}

	string += `\n${" ".repeat(indentation)}},`;

	return string;

}

function printArray(object, indentation = 0){

	const i = " ".repeat(indentation + 2);

	let string = `[`;

	for(const value of object.items || []){
	switch(value.type){
		case "object":
			string += `\n${i}`;
			string += printObject(value.keys, indentation + 2);
			break;
		case "array":
			string += `\n${i}`;
			string += printArray(value, indentation + 2);
			break;
		default:
			string += `\n${i}`;
			if(value.type === "boolean") value.flags.default = value.flags.default || false;
			string += value.type.charAt(0).toUpperCase() + value.type.slice(1);
			if(value.flags?.default !== undefined && value.type !== "array"){
				string += `: ${value.type === "string" ? `"` : ``}${value.flags.default}${value.type === "string" ? `"` : ``}`;
			}
			if(value.allow){
				string += ` ("${value.allow.join(`", "`)}")`;
			}
			break;
	}

}

	string += `\n${" ".repeat(indentation)}],`;

	return string;

}
