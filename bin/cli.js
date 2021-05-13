#!/usr/bin/env node

/**
 * @file
 * T.
 */

import yargs from "yargs";
import {hideBin} from "yargs/helpers";

import easyWebapp from "../src/easyWebapp.js";


const argv = yargs(hideBin(process.argv))
	.option("root-path", {
		alias: "r",
		type: "string",
		description: "Define the absolute path of easy-webapp's working directory (root). This is by default the same as Node's working directory.",
	})
	.option("config-name", {
		alias: "c",
		type: "string",
		description: "Define an alternative name for all easy-webapp config (ewaconfig) files.",
	})
	.option("interface", {
		alias: "i",
		type: "string",
		description: "Choose in what style easy-webapp should log its progress.",
	})
	.option("use-cache", {
		type: "boolean",
		description: "Enable or disable use of a cache to speed things up.",
	})
	.epilogue("Only a few options are available through the CLI. To access all options, you must write a config object instead.")
	.argv;

easyWebapp(argv);
