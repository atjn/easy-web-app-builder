/**
 * @file
 * This file runs unit tests on the shared tool components.
 */

import { describe, test, expect, afterEach } from "@jest/globals";

import * as tools from "../../src/tools.js";

describe("File", () => {
	afterEach(() => {
		delete global.ewabConfig;
	});
	describe(`rootPath can be inferred from absolutePath`, () => {
		test.each([
			["rootpath/",	"rootpath/path/to/script.js",	"path/to/script.js"],
			["rootpath",	"rootpath/path/to/script.js",	"path/to/script.js"],
			["rootpath",	"/rootpath/path/to/script.js",	"path/to/script.js"],
			["rootpath/",	"/rootpath/path/to/script.js",	"path/to/script.js"],
			// TODO: ["/rootpath",	"rootpath/path/to/script.js",	"path/to/script.js"],
			// TODO: ["/rootpath",	"/rootpath/path/to/script.js",	"path/to/script.js"],
			// Absolute rootpaths should probably be treated as relative rootpaths
		])(`"%s" & "%s" => "%s"`, (configRootPath, absolutePath, rootPath) => {
			global.ewabConfig = {rootPath: configRootPath};
			const file = new tools.File({absolutePath});
			expect(file.rootPath).toBe(rootPath);
		});
	});
	describe(`rootPath remains intact after normalization`, () => {
		test.each([
			["rootpath/",	"",						""],
			["rootpath",	"",						""],
			["rootpath/",	"/",					""],
			["rootpath",	"/",					""],
			["rootpath/",	"single",				"single"],
			["rootpath",	"single",				"single"],
			["rootpath/",	"/single.css",			"single.css"],
			["rootpath",	"/single.css",			"single.css"],
			["rootpath/",	"path/to/script.js",	"path/to/script.js"],
			["rootpath",	"path/to/script.js",	"path/to/script.js"],
			["rootpath/",	"/path/to/script.js",	"path/to/script.js"],
			["rootpath",	"/path/to/script.js",	"path/to/script.js"],
			["rootpath",	"/path/to//script.js",	"path/to/script.js"],
			["rootpath",	"/path/to///script.js",	"path/to/script.js"],
			["rootpath",	"/path//to//script.js",	"path/to/script.js"],
			["rootpath/",	"path/to/script",		"path/to/script"],
			["rootpath",	"path/to/script",		"path/to/script"],
			["rootpath/",	"/path/to/script",		"path/to/script"],
			["rootpath",	"/path/to/script",		"path/to/script"],
			["rootpath/",	"path/to/script/",		"path/to/script"],
			["rootpath",	"path/to/script/",		"path/to/script"],
			["rootpath/",	"/path/to/script/",		"path/to/script"],
			["rootpath",	"/path/to/script/",		"path/to/script"],
		])(`"%s" & "%s" => "%s"`, (configRootPath, newRootPath, normalizedRootPath) => {
			global.ewabConfig = {rootPath: configRootPath};
			const file = new tools.File({rootPath: newRootPath});
			expect(file.rootPath).toBe(normalizedRootPath);
		});
	});
	describe(`extension only returns filename extension`, () => {
		test.each([
			["path/to/file.css",		"css"],
			["path/to/file.js",			"js"],
			["path/to/file.test.cjs",	"cjs"],
			["path/to/file.css.map",	"map"],
			["path/to/file..html",		"html"],
			["path.to/file.html",		"html"],
			["path/to.file.html",		"html"],
			["path.to.file.html",		"html"],
			["path/to/file.html.",		""],
			["path/to/file",			""],
			["path/to/file/",			""],
			["path.to/file",			""],
			["path.to/file/",			""],
		])(`"%s" => "%s"`, (rootPath, extension) => {
			global.ewabConfig = {rootPath: "rootpath"};
			const file = new tools.File({rootPath});
			expect(file.extension).toBe(extension);
		});
	});
});
