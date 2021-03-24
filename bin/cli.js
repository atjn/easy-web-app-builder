#!/usr/bin/env node

"use strict";

const yargs = require("yargs/yargs");
const {hideBin} = require("yargs/helpers");

const argv = yargs(hideBin(process.argv))
	.option("root", {
		"type": "string",
		"description": "Define the absolute path of easy-webapp's working directory (root). This is by default the same as Node's working directory.",
	})
	.option("config-name", {
		"type": "string",
		"description": "Define an alternative name for all easy-webapp config (ewaconfig) files.",
	})
	.option("use-cache", {
		"type": "boolean",
		"description": "Enable or disable use of a cache to speed things up.",
	})
	.epilogue("Only a few options are available through the CLI. To access all options, you must write a config object instead.")
	.argv;


const {easyWebapp} = require("../src/easy-webapp.js");

easyWebapp(argv);
