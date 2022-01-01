
/**
 * @file
 * This enables ESlint linting of all javascript files.
 */

module.exports = {

	extends: [
		"@atjn/eslint-config",  
	],

	parserOptions: {
		sourceType: "module",
		ecmaVersion: "latest",
	},

};
