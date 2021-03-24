"use strict";

/**
 * @file
 * Collection of its and bits used for organizing configuration data.
 */

module.exports = {

	/**
	 * The standard config object which defines most app defaults.
	 */
	baseConfig: {

		alias: "ewa",
		verbose: false,
		useCache: true,

		source: "/source",
		output: "/public",

		index: "index.html",
		manifest: "manifest.json",
		
		icons: {
			add: true,
			source: "",
			list: [],
			blockList: [],
			mergeMode: {
				index: "override",
				manifest: "override",
			},
		},

		serviceworker: {
			add: true,
		},

		files: {
			minify: true,
		},

		images: {
			minify: true,
			convert: true,
			updateReferences: true,
			removeOriginal: true,
			targetEctensions: ["webp"],
		},

		fileExceptions: [],
		
	},

};
