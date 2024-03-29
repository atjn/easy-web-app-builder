#!/usr/bin/env node

/**
 * @file
 * When a user activates easy-web-app-builder from the command line, this file parses the raw command and activates the main EWAB file with the correct settings.
 * If the user was calling command (such as `setup`), this file will instead activate the correct file for that command.
 */

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import ewab from "../src/ewab.js";
import { defaults } from "../src/config.js";
import { ewabPackage } from "../src/tools.js";

import scaffold from "./scaffold.js";
import setup from "./setup.js";
import watch from "./watch.js";


const args = yargs(hideBin(process.argv))
	.option("root-path", {
		type: "string",
		normalize: true,
		default: process.cwd(),
		description: "Define the absolute path of EWABs working directory (root).",
	})
	.option("config-name", {
		type: "string",
		default: defaults.configName,
		description: "Define an alternative name for the EWAB config file.",
	})
	.option("config", {
		type: "string",
		default: "{}",
		description: "Pass a JSON config object. Values defined here will override the values in the config file.",
	})
	.command(["setup", "wizard", "guide", "initialize", "init"], `Opens a wizard to help set up ${ewabPackage.name}.`)
	.command(["scaffold", "template"], "Add some template files to the source website to help you get started.", yargs => {
		yargs
			.positional("type", {
				type: "string",
				default: "all",
				choices: ["all", "all-overwrite", "index", "manifest"],
				description: "What files should be scaffolded? ('all' will scaffold all files that don't already exist. 'all-overwrite' will also overwrite files that already exist)",
			});
	})
	.strict()
	.demandCommand(0, 1)
	.recommendCommands()
	.argv;

//console.log(args);
//console.log(args._);

if(args._.length > 0){
	switch(args._[0]){
		case "scaffold":
			scaffold({type: args.type});
			break;
		case "setup":
			setup(args);
			break;
		case "watch":
			watch(args);
			break;
	}
}else{
	ewab(args);
}
