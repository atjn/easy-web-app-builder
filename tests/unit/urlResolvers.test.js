/**
 * @file
 * This file runs unit tests on the shared tool components.
 */

import { describe, test, expect } from "@jest/globals";

import * as tools from "../../src/tools.js";

describe("generateRelativeAppUrl", () => {
	describe("generates relative url from the first file to the second", () => {
		test.each([
			["file.html",			"path/to/script.js",	"path/to/script.js"],
			["path/to/file.html",	"path/to/script.js",	"script.js"],
			["path/to/file",		"path/to/script.js",	"script.js"],
			["path/to/file.html",	"path/to/other/script",	"other/script"],
			["path/to/file",		"path/to/other/script",	"other/script"],
			["path/to/file.html",	"path/style.css",		"../style.css"],
			["path/to/file",		"path/style.css",		"../style.css"],
			["path/to/file.html",	"style.css",			"../../style.css"],
			["path/to/file",		"style.css",			"../../style.css"],
		])(`"%s" + "%s" => "%s"`, (fromPath, toPath, expected) => {
			const fromFile = new tools.AppFile({appPath: fromPath});
			const toFile = new tools.AppFile({appPath: toPath});
			const relativeUrl = tools.generateRelativeAppUrl(fromFile, toFile);
			expect(relativeUrl).toBe(expected);
		});
	});
	describe(`url-encodes special characters`, () => {
		test.each([
			["path/to/file.html",	"path/to/@+relative-urlencoded.js", "%40%2Brelative-urlencoded.js"],
			["path/to/file.html",	"path/to/relative urlencoded.js",	"relative%20urlencoded.js"],
			["path/to/file.html",	"path/to/relative—urlencoded.js",	"relative%E2%80%94urlencoded.js"],
			["file@.html",			"path/@/relative-urlencoded.js",	"path/%40/relative-urlencoded.js"],
		])(`"%s" + "%s" => "%s"`, (fromPath, toPath, expected) => {
			const fromFile = new tools.AppFile({appPath: fromPath});
			const toFile = new tools.AppFile({appPath: toPath});
			const relativeUrl = tools.generateRelativeAppUrl(fromFile, toFile);
			expect(relativeUrl).toBe(expected);
		});
	});
});

describe("resolveAppUrl", () => {
	describe(`appends url to the file's parent folder in default case`, () => {
		test.each([
			["path/to/file.html",	"relative.js",					"path/to/relative.js"],
			["path/to/file",		"relative.js",					"path/to/relative.js"],
			["path/to/file.html",	"relative",						"path/to/relative"],
			["path/to/file",		"relative",						"path/to/relative"],
			["path/to/file.html",	"relative/",					"path/to/relative/"],
			["path/to/file",		"relative/",					"path/to/relative/"],
			["path/to/file.html",	"path/to/somewhere/else.js",	"path/to/path/to/somewhere/else.js"],
			["path/to/file",		"path/to/somewhere/else.js",	"path/to/path/to/somewhere/else.js"],
			["path/to/file.html",	"path/to/somewhere/else",		"path/to/path/to/somewhere/else"],
			["path/to/file",		"path/to/somewhere/else",		"path/to/path/to/somewhere/else"],
			["path/to/file.html",	"path/to/somewhere/else/",		"path/to/path/to/somewhere/else/"],
			["path/to/file",		"path/to/somewhere/else/",		"path/to/path/to/somewhere/else/"],
		])(`"%s" + "%s" => "%s"`, (appPath, url, expected) => {
			const file = new tools.AppFile({appPath});
			const resolvedFile = tools.resolveAppUrl(file, url);
			expect(resolvedFile.appPath).toBe(expected);
		});
	});
	describe(`appends url to the file's parent folder when url starts with "./"`, () => {
		test.each([
			["path/to/file.html",	"./",							"path/to"],
			["path/to/file",		"./",							"path/to"],
			["path/to/file.html",	"./relative.js",				"path/to/relative.js"],
			["path/to/file",		"./relative.js",				"path/to/relative.js"],
			["path/to/file.html",	"./path/to/somewhere",			"path/to/path/to/somewhere"],
			["path/to/file",		"./path/to/somewhere",			"path/to/path/to/somewhere"],
			["path/to/file.html",	"./path/to/somewhere/else.js",	"path/to/path/to/somewhere/else.js"],
			["path/to/file",		"./path/to/somewhere/else.js",	"path/to/path/to/somewhere/else.js"],
		])(`"%s" + "%s" => "%s"`, (appPath, url, expected) => {
			const file = new tools.AppFile({appPath});
			const resolvedFile = tools.resolveAppUrl(file, url);
			expect(resolvedFile.appPath).toBe(expected);
		});
	});
	describe(`ignores file path when url starts with "/"`, () => {
		test.each([
			["path/to/file.html",	"/",						"."],
			["path/to/file",		"/",						"."],
			["path/to/file.html",	"/changed.js",				"changed.js"],
			["path/to/file",		"/changed.js",				"changed.js"],
			["path/to/file.html",	"/path/to/other",			"path/to/other"],
			["path/to/file",		"/path/to/other",			"path/to/other"],
			["path/to/file.html",	"/path/to/other/file.js",	"path/to/other/file.js"],
			["path/to/file",		"/path/to/other/file.js",	"path/to/other/file.js"],
		])(`"%s" + "%s"`, (appPath, url, resolvedAppPath) => {
			const file = new tools.AppFile({appPath});
			const resolvedFile = tools.resolveAppUrl(file, url);
			expect(resolvedFile.appPath).toBe(resolvedAppPath);
		});
	});
	describe(`navigates back when encountering "../"`, () => {
		test.each([
			["path/to/file.html",	"../",								"path/"],
			["path/to/file",		"../",								"path/"],
			["path/to/file.html",	"../../",							"./"],
			["path/to/file",		"../../",							"./"],
			["path/to/file.html",	"../relative.js",					"path/relative.js"],
			["path/to/file",		"../relative.js",					"path/relative.js"],
			["path/to/file.html",	"../../relative.js",				"relative.js"],
			["path/to/file",		"../../relative.js",				"relative.js"],
			["path/to/file.html",	"../path/to/somewhere/else.js",		"path/path/to/somewhere/else.js"],
			["path/to/file",		"../path/to/somewhere/else.js",		"path/path/to/somewhere/else.js"],
			["path/to/file.html",	"../../path/to/somewhere/else.js",	"path/to/somewhere/else.js"],
			["path/to/file",		"../../path/to/somewhere/else.js",	"path/to/somewhere/else.js"],
			["path/to/file.html",	"path/to/../somewhere/else.js",		"path/to/path/somewhere/else.js"],
			["path/to/file",		"path/to/../somewhere/../else.js",	"path/to/path/else.js"],
			["path/to/file",		"path/to/../../somewhere/else.js",	"path/to/somewhere/else.js"],
			["path/to/file",		"path/to/somewhere/else.js/../",	"path/to/path/to/somewhere/"],
			["path/to/file",		"path/to/somewhere/else.js/..",		"path/to/path/to/somewhere"],
		])(`"%s" + "%s" => "%s"`, (appPath, url, expected) => {
			const file = new tools.AppFile({appPath});
			const resolvedFile = tools.resolveAppUrl(file, url);
			expect(resolvedFile.appPath).toBe(expected);
		});
	});
	describe(`normalizes double paths`, () => {
		test.each([
			["path/to/file.html",	".//",								"path/to"],
			["path/to/file",		".//",								"path/to"],
			["path/to/file.html",	".//relative.js",					"path/to/relative.js"],
			["path/to/file",		".//relative.js",					"path/to/relative.js"],
			["path/to/file.html",	".///relative.js",					"path/to/relative.js"],
			["path/to/file",		".//////relative.js",				"path/to/relative.js"],
			["path/to/file.html",	"./path///to/somewhere",			"path/to/path/to/somewhere"],
			["path/to/file",		"./path/to///somewhere",			"path/to/path/to/somewhere"],
			["path/to/file.html",	"./path//to//somewhere/else.js",	"path/to/path/to/somewhere/else.js"],
			["path/to/file",		"./path//to//somewhere/else.js",	"path/to/path/to/somewhere/else.js"],
		])(`"%s" + "%s" => "%s"`, (appPath, url, expected) => {
			const file = new tools.AppFile({appPath});
			const resolvedFile = tools.resolveAppUrl(file, url);
			expect(resolvedFile.appPath).toBe(expected);
		});
	});
	describe(`correctly combines back paths and double paths`, () => {
		test.each([
			["path/to/file.html",	".//../",							"path/to"],
			["path/to/file",		"..//",								"path/"],
			["path/to/file.html",	".//relative.js",					"path/to/relative.js"],
			["path/to/file",		".//relative.js",					"path/to/relative.js"],
			["path/to/file.html",	".///relative.js",					"path/to/relative.js"],
			["path/to/file",		".//////relative.js",				"path/to/relative.js"],
			["path/to/file.html",	"./path///to/somewhere",			"path/to/path/to/somewhere"],
			["path/to/file",		"./path/to///somewhere",			"path/to/path/to/somewhere"],
			["path/to/file.html",	"./path//to//somewhere/else.js",	"path/to/path/to/somewhere/else.js"],
			["path/to/file",		"./path//to//somewhere/else.js",	"path/to/path/to/somewhere/else.js"],
		])(`"%s" + "%s" => "%s"`, (appPath, url, expected) => {
			const file = new tools.AppFile({appPath});
			const resolvedFile = tools.resolveAppUrl(file, url);
			expect(resolvedFile.appPath).toBe(expected);
		});
	});
	// TODO: Correctly combines url encoded values with back paths and dot paths
	describe(`does not navigate outside app root by default`, () => {
		test.each([
			["path/to/file.html",	"../../../"],
			["path/to/file",		"../../../"],
			["path/to/file.html",	"../../../relative.js"],
			["path/to/file",		"../../../relative.js"],
			["path/to/file.html",	"../../../other/relative.js"],
			["path/to/file",		"../../../other/relative.js"],
			["path/to/file.html",	"../../../path/to/somewhere/else.js"],
			["path/to/file",		"../../../path/to/somewhere/else.js"],
		])(`"%s" + "%s" => null`, (appPath, url) => {
			const file = new tools.AppFile({appPath});
			const resolvedFile = tools.resolveAppUrl(file, url);
			expect(resolvedFile).toBeNull();
		});
	});
	describe(`navigates outside app root when asked to`, () => {
		test.each([
			["path/to/file.html",	"../../../",							"../"],
			["path/to/file",		"../../../",							"../"],
			["path/to/file.html",	"../../../relative.js",					"../relative.js"],
			["path/to/file",		"../../../relative.js",					"../relative.js"],
			["path/to/file.html",	"../../../other/relative.js",			"../other/relative.js"],
			["path/to/file",		"../../../other/relative.js",			"../other/relative.js"],
			["path/to/file.html",	"../../../path/to/somewhere/else.js",	"../path/to/somewhere/else.js"],
			["path/to/file",		"../../../path/to/somewhere/else.js",	"../path/to/somewhere/else.js"],
		])(`"%s" + "%s" => "%s"`, (appPath, url, expected) => {
			const file = new tools.AppFile({appPath});
			const resolvedFile = tools.resolveAppUrl(file, url, true);
			expect(resolvedFile.appPath).toBe(expected);
		});
	});
	describe(`decodes url-encoded characters in url`, () => {
		test.each([
			["path/to/file.html",	"%40%2Brelative-urlencoded.js",		"path/to/@+relative-urlencoded.js"],
			["path/to/file.html",	"relative%20urlencoded.js",			"path/to/relative urlencoded.js"],
			["path/to/file.html",	"relative%E2%80%94urlencoded.js",	"path/to/relative—urlencoded.js"],
			["path/to/file.html",	"relative-urlencoded.js%2521",		"path/to/relative-urlencoded.js%21"],
		])(`"%s" + "%s" => "%s"`, (appPath, url, expected) => {
			const file = new tools.AppFile({appPath});
			const resolvedFile = tools.resolveAppUrl(file, url);
			expect(resolvedFile.appPath).toBe(expected);
		});
	});
	describe(`does not decode url-encoded characters in file path`, () => {
		test.each([
			["%40%2Bpath/to/file.html",			"relative.js",			"%40%2Bpath/to/relative.js"],
			["path/to/important%21%/file.html",	"relative.js",			"path/to/important%21%/relative.js"],
			["path/to/important%21%/file.html",	"relative%20urlenc.js",	"path/to/important%21%/relative urlenc.js"],
		])(`"%s" + "%s" => "%s"`, (appPath, url, expected) => {
			const file = new tools.AppFile({appPath});
			const resolvedFile = tools.resolveAppUrl(file, url);
			expect(resolvedFile.appPath).toBe(expected);
		});
	});
	describe(`does not resolve urls to external servers`, () => {
		test.each([
			["",					"https://example.com/script.js"],
			["/",					"https://example.com/script.js"],
			["path/to/file.html",	"https://example.com/script.js"],
			["path/to/file",		"https://example.com/script.js"],
			["path/to/file.html",	"https://example.com"],
			["path/to/file.html",	"https://example.com/script"],
			["path/to/file.html",	"https://example.com/script/"],
			["path/to/file.html",	"http://example.com/script.js"],
			["path/to/file.html",	"//example.com/script.js"],
			["path/to/file.html",	"wss://example.com/script.js"],
			["path/to/file.html",	"foobar://example.com/script.js"],
		])(`"%s" + "%s" => null`, (appPath, url) => {
			const file = new tools.AppFile({appPath});
			const resolvedFile = tools.resolveAppUrl(file, url);
			expect(resolvedFile).toBeNull();
		});
	});
});
