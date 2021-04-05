

/**
 * @file
 * Fsfdfsdf.
 */

module.exports = {

	extends: [
		"@atjn/eslint-config",  
	],

	env: {
		es6: true,
	},

	parserOptions: {
		sourceType: "module",
	},

	plugins: [
		"jsdoc",
	],

	rules: {
		"no-case-declarations":				 "off",
		"indent":							["error", "tab", {"MemberExpression": "off"}],
		"no-multiple-empty-lines":			["error", {"max": 4, "maxEOF": 1, "maxBOF": 2}],

		//JSDOC rules: https://github.com/gajus/eslint-plugin-jsdoc
		"jsdoc/check-access":								"error",
		"jsdoc/check-examples":								"error",
		"jsdoc/check-indentation":							"error",
		"jsdoc/check-syntax":								"error",
		"jsdoc/require-description":						"error",
		"jsdoc/require-description-complete-sentence":		"error",
		"jsdoc/require-file-overview":						"error",
		"jsdoc/require-hyphen-before-param-description":	"error",
	},

};
