/* global ewaConfig */

/**
 * @file
 * These functions handle most of the work relating to logging what easy-webapp is doing.
 * Since logging is used extensively in this project, some best practice has been sacrificed in order to make the functions cleaner and faster to use.
 */


import chalk from "chalk";
export const c = new chalk.Instance();

import Gauge from "gauge";
import gaugeThemes from "gauge/themes.js";
const gaugeTheme = {
	...gaugeThemes({hasUnicode: true, hasColor: true}),
	...{
		preProgressbar: "",
		postProgressbar: "",
	},
};
if(gaugeTheme.progressbarTheme.postComplete === "\x1B[0m"){
	gaugeTheme.progressbarTheme.preComplete = "\x1B[32;42m";
}
const gaugeTemplate = [
	{type: "progressbar", length: 13},
	{type: "activityIndicator", kerning: 1, length: 1},
	{type: "section", kerning: 1, default: ""},
	{type: "subsection", kerning: 1, default: ""},
];

const ewaProgressBar = {};

/**
 * Takes any log message and figures out if and how it should be logged.
 * Any message that is logged without a defined type will default to `debug`.
 * 
 * @param	{"modern"|"basic"|"warning"|"error"|"debug"}	[type]	- What kind of message it is.
 * @param	{string}										message	- The message to log.
 */
export function log(type = "debug", message){

	if(ewaConfig.interface === "none") return;

	//This is a pro gamer move that allows logging debug messages without having to define "debug" a million times.
	if(message === undefined){
		message = type;
		type = "debug";
	}

	if(type === "warning"){

		console.log(`${c.black.bgYellow("   warning   ")} ${c.yellow(message)}`);

	}else if(type === "error"){

		bar.end();
		console.log(`${c.black.bgRed("    error    ")} ${c.red(message)}`);
		console.log("");
		throw new Error(message);

	}else if(ewaConfig.interface === "debug" && type === "debug"){

		console.log(`${c.black.bgGrey("    debug    ")} ${message}`);

	}else if(
		(ewaConfig.interface === "debug" && type !== "modern") ||
		(ewaConfig.interface !== "minimal" && type === "basic") ||
		(ewaConfig.interface === "modern" && type === "modern")
	){

		console.log(message);

	}

}

export function bar(progress, message){

	if(ewaConfig.interface === "none") return;

	message = message || ewaProgressBar.lastMessage;

	if(["modern", "minimal"].includes(ewaConfig.interface)){

		ewaProgressBar.main.show(message, progress);

	}else{

		if(message !== ewaProgressBar.lastMessage){
			ewaProgressBar.lastMessage = message;
			log("basic", `              ${message}..`);
		}

	}

}
	
bar.begin = (message) => {

	if(ewaConfig.interface === "none") return;

	if(["modern", "minimal"].includes(ewaConfig.interface)){

		ewaProgressBar.main = new Gauge({
			template: gaugeTemplate,
			theme: gaugeTheme,
		});
		ewaProgressBar.pulse = setInterval(() => {
			ewaProgressBar.main.pulse();
		}, 100);

		ewaProgressBar.main.show(message, 0);

	}else{

		ewaProgressBar.lastMessage = message;
		log("basic", `              ${message}..`);
		
	}

};

bar.end = (message) => {

	if(ewaConfig.interface === "none") return;

	bar.hide();
	
	if(message && ewaConfig.interface !== "minimal"){
		log("basic", `${c.black.bgGreen("   success   ")} ${message}`);
	}

};

bar.hide = () => {

	if(ewaConfig.interface === "none") return;

	if(ewaProgressBar?.pulse) clearInterval(ewaProgressBar.pulse);
	if(ewaProgressBar?.main) ewaProgressBar.main.hide();

};
