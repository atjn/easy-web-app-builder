
import { configOptions } from "../src/config.js";

import fs from "fs-extra";
import path from "path";
import { ewabSourcePath } from "../src/tools.js";

await fs.copy(path.join(ewabSourcePath, "build-docs/templates"), path.join(ewabSourcePath, "docs"));

let doc = await fs.readFile(path.join(ewabSourcePath, "docs/config.md"));

doc += "```js\n" + printObject((configOptions.describe()).keys) + "\n```\n\n\n";

await fs.writeFile(path.join(ewabSourcePath, "docs/config.md"), doc);

function printObject(object, indentation = 0){

	if(Object.keys(object || {}).length === 0) return "Object"

	const i = " ".repeat(indentation + 2);

	let string = object.type === "array" ? `[` : `{`;

	for(const [ key, value ] of object.type === "array" ? (object.items || []).map(value => ["", value]) : Object.entries(object || {})){
		if(value.flags?.description){
			string += `\n${i}//${value.flags.description}`;
		}
		string += `\n${i}`;
		if(key) string += `${key}: `;
		switch(value.type){
			case "object":
				string += printObject(value.keys, indentation + 2);
				break;
			case "array":
				string += printObject(value, indentation + 2);
				break;
			default:
				if(value.type === "boolean") value.flags.default = value.flags?.default || false;
				if(value.type) string += value.type.charAt(0).toUpperCase() + value.type.slice(1);
				if(value.flags?.default !== undefined && value.type !== "array"){
					string += `: ${value.type === "string" ? `"` : ``}${value.flags.default}${value.type === "string" ? `"` : ``}`;
				}
				if(value.allow){
					string += ` ("${value.allow.join(`", "`)}")`;
				}
				break;
		}
		
		if(value.flags?.description) string += `\n${i}`;

	}

	string += `\n${" ".repeat(indentation)}${object.type === "array" ? "]" : "}"},`;

	return string;

}
