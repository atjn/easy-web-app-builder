#!/usr/bin/env node

"use strict";

const yargs = require("yargs/yargs");
const {hideBin} = require("yargs/helpers");

const argv = yargs(hideBin(process.argv))
	.option("root", {
		"type": "string",
		"description": "Define the absolute path of easy-webapp's working directory (root). This is by default the same as Node's working directory.",
	})
	.option("config-path", {
		"type": "string",
		"description": "Define an alternative path to the root config file.",
	})
	.epilogue("Only a few options are available through the CLI. To access all options, you must write a config object instead.")
	.argv;


const {easyWebapp} = require("../src/easy-webapp.js");

easyWebapp(argv);
