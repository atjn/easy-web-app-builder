#!/usr/bin/env node

/**
 * @file
 * When a user activates easy-webapp from the command line, this file parses the raw command and activates the main EWA file with the correct settings.
 * If the user was calling command (such as `setup`), this file will instead activate the correct file for that command.
 */

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import easyWebapp from "../src/easyWebapp.js";

import wizard from "./wizard.js";
import scaffold from "./scaffold.js";


const args = yargs(hideBin(process.argv))
	.option("root-path", {
		type: "string",
		description: "Define the absolute path of easy-webapp's working directory (root). By default the same as the Node working directory.",
	})
	.option("config-name", {
		type: "string",
		description: "Define an alternative name for all easy-webapp config (ewaconfig) files.",
	})
	.option("interface", {
		type: "string",
		description: "Choose in what style easy-webapp should log its progress.",
	})
	.option("use-cache", {
		type: "boolean",
		description: "Enable or disable use of a cache to speed things up on concurrent runs.",
	})
	.command(["setup", "wizard", "initialize", "init"], "Opens a wizard to help set up easy-webapp")
	.epilogue("Only a few options are available through the CLI. To access all options, you must create a config file.")
	.strict()
	.demandCommand(0, 1)
	.argv;

if(args._.length > 0){
	switch(args._[0]){
		case "setup":
			wizard();
			break;
		case "scaffold":
			scaffold();
			break;
	}
}else{
	easyWebapp(args);
}
