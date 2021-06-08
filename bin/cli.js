#!/usr/bin/env node

/**
 * @file
 * When a user activates easy-webapp from the command line, this file parses the raw command and activates the main EWA file with the correct settings.
 * If the user was calling command (such as `setup`), this file will instead activate the correct file for that command.
 */

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import ewa from "../src/ewa.js";

import wizard from "./wizard.js";
import scaffold from "./scaffold.js";


const args = yargs(hideBin(process.argv))
	.option("root-path", {
		type: "string",
		normalize: true,
		default: process.cwd,
		description: "Define the absolute path of easy-webapp's working directory (root).",
	})
	.option("config-name", {
		type: "string",
		default: "ewaconfig",
		description: "Define an alternative name for all easy-webapp config (ewaconfig) files.",
	})
	.option("interface", {
		type: "string",
		default: "modern",
		choices: ["modern", "minimal", "basic", "none", "debug"],
		description: "Choose in what style easy-webapp should log its progress.",
	})
	.option("use-cache", {
		type: "boolean",
		default: true,
		description: "Enable or disable use of a cache to speed things up on concurrent runs.",
	})
	.option("config", {
		type: "string",
		default: {},
		description: "Pass a config object. Values defined here will override the values in the config file.",
	})
	.command(["setup", "wizard", "initialize", "init"], "Opens a wizard to help set up easy-webapp.")
	.command(["scaffold", "template"], "Add some template files to the source website to help you get started.", yargs => {
		yargs
			.positional("type", {
				type: "string",
				default: "app",
				choices: ["app", "index", "manifest"],
				description: "What files should be scaffolded?",
			});
	})
	.epilogue("Only a few configuration options are available through the CLI. To access all options, you must create a config file.")
	.strict()
	.demandCommand(0, 1)
	.recommendCommands()
	.argv;

console.log(args);
console.log(args._);

if(args._.length > 0){
	switch(args._[0]){
		case "setup":
			wizard();
			break;
		case "scaffold":
			scaffold(args.type);
			break;
	}
}else{
	ewa(args);
}
