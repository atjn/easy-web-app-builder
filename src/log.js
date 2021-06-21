/* global ewabConfig */

/**
 * @file
 * These functions handle all of EWAB's logging.
 * Since logging is used extensively in this project, some best practices have been sacrificed in order to make the functions faster to use.
 */

import chalk from "chalk";
import logUpdate from "log-update";

import files from "./files.js";

export const logInterfaces = {
	modern: "Default, makes the output look nice.",
	minimal: "WIll only show what it is currently doing. The only logs persisted after a completed runs are any warnings encountered.",
	basic: "Outputs a simple line-by-line log.",
	none: "No output at all",
	debug: "Outputs a wealth of information that can help figure out why EWAB is that *that thing*",
};

export const defaultInterface = "modern";

const progressBar = {
	length: 13,
	progress: 0,
	spinnerFrames: [ "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏", "⠋" ],
	spinnerCurrentFrame: "⠙",
	generate: () => {
		const completedLength = Math.round(progressBar.length * progressBar.progress);
		return `${chalk.bgGreen(" ".repeat(completedLength))}${chalk.bgGray(" ".repeat(progressBar.length - completedLength))} ${progressBar.spinnerCurrentFrame} ${progressBar.message}`;
	},
};

let warmupLogged = false;

const deferredLogs = [];

let disabled = false;

/**
 * Works mostly like `.padStart()` and `.padEnd()`, but splits the padding evenly between start and end, effectively centering the text.
 * 
 * @param	{number}	length	- How long the final string should be.
 * @param	{string}	padding	- The string to use as padding.
 * 
 * @returns {string} - The new padded string.
 */
String.prototype.padAround = function (length, padding){

	const endLength = Math.round((length - this.length) / 2);
	const startLength = (length - this.length) - endLength;

	return `${padding.repeat(startLength)}${this}${padding.repeat(endLength)}`;
};

/**
 * Takes any log message and figures out how/if it should be logged.
 * Any message that is logged without a defined type will default to `debug`.
 * 
 * @param	{"standard"|"debug"|"warning"|"error"|"modern-only"}	[type]	- What kind of message it is.
 * @param	{string}												message	- The message to log.
 */
export function log(type = "debug", message){

	if(disabled) return;

	//This is a pro gamer move that allows logging debug messages without having to define "debug" a million times.
	if(message === undefined){
		message = type;
		type = "debug";
	}

	if(type === "error"){

		bar.freeze();
		console.log(`${chalk.black.bgRed("error".padAround(progressBar.length, " "))} ${chalk.red(message)}${ewabConfig.interface === "debug" ? "" : "\n"}`);
		files.clean();
		throw new Error(message);

	}else if(!ewabConfig.interface){

		deferredLogs.push({type, message});

	}else if(type === "warning"){

		logUpdate.clear();
		console.log(`${chalk.black.bgYellow("warning".padAround(progressBar.length, " "))} ${chalk.yellow(message)}`);

	}else if(ewabConfig.interface === "debug" && type === "debug"){

		console.log(`${chalk.black.bgGrey("debug".padAround(progressBar.length, " "))} ${message}`);

	}else if(
		(ewabConfig.interface === "debug" && type !== "modern-only") ||
		(ewabConfig.interface !== "minimal" && type === "standard") ||
		(ewabConfig.interface === "modern" && type === "modern-only")
	){

		console.log(message);

	}

}

/**
 * This is called several times during startup, to make sure logging starts as soon as possible.
 * Will test if an 'interface' type has been set, and if it has, begins proper logging.
 * 
 * @param {string}	[possibleInterface]	- An interface that could be used if it is valid and something else hasn't aready been set.
 * 
 */
log.warmup = (possibleInterface) => {

	if(warmupLogged) return;

	if(!ewabConfig.interface && Object.keys(logInterfaces).includes(possibleInterface)){
		ewabConfig.interface = possibleInterface;
	}
	
	if(ewabConfig.interface){

		disabled = Boolean(ewabConfig.interface === "none");

		bar.begin("Warming up");

		for(const deferredLog of deferredLogs){
			log(deferredLog.type, deferredLog.message);
		}

		log(`Figured out that interface '${ewabConfig.interface}' should be used. Will now log ${deferredLogs.length + 1} logs that were queued for this moment.`);

		warmupLogged = true;

	}
};

/**
 * Logs the EWAB header.
 */
log.header = () => {
	log("standard", `${chalk.black.bgCyan(" easy-web-app-builder ")} Building webapp`);
};

/**
 * Updates the ongoing progress bar with new progress/messages.
 * 
 * @param	{number}	progress - A decimal number between 0 and 1. Defines how close the progress is to completion.
 * @param	{string}	[message] - Updates the status message beside the bar. If this isn't defined, the old message is kept.
 */
export function bar(progress, message){

	if(disabled) return;

	progressBar.progress = progress;

	if(message){

		if(!useTTY(ewabConfig.interface) && message && message !== progressBar.message){

			log("standard", `${" ".repeat(progressBar.length)} ${message}..`);

		}

		progressBar.message = message;

	}

}

/**
 * Starts logging a progress bar to the console.
 * The progress bar can the be updated by calling `bar()`.
 * 
 * @param	{string}	message	- Defines the status message to show beside the bar. 
 */
bar.begin = (message) => {

	if(disabled) return;

	progressBar.progress = 0;
	progressBar.message = message;

	if(useTTY(ewabConfig.interface)){

		progressBar.pulse = setInterval(() => {
			progressBar.spinnerCurrentFrame = progressBar.spinnerFrames[(progressBar.spinnerFrames.indexOf(progressBar.spinnerCurrentFrame) + 1) % progressBar.spinnerFrames.length];
			logUpdate(progressBar.generate());
		}, 100);

	}else{

		log("standard", `${" ".repeat(progressBar.length)} ${message}..`);
		
	}

};

/**
 * Completes the ongoing progress bar, and keeps it in the terminal with a completion message.
 * 
 * @param	{string}	message	- The completion message to show beside the bar.
 */
bar.end = (message) => {

	if(disabled) return;

	bar.hide();
	
	if(ewabConfig.interface !== "minimal"){
		log("standard", `${chalk.black.bgGreen("success".padAround(progressBar.length, " "))} ${message}`);
	}

};

/**
 * Completes the ongoing progress bar, and hides it as if it was never there.
 */
bar.hide = () => {

	if(disabled) return;

	if(progressBar.pulse){
		clearInterval(progressBar.pulse);
		logUpdate.clear();
	}

};

/**
 * Freezes the ongoing progress bar.
 */
bar.freeze = () => {

	if(disabled) return;

	if(progressBar.pulse){
		clearInterval(progressBar.pulse);
		logUpdate.done();
	}

};

function useTTY(interfaceMode){

	if(!process.stdout.isTTY) return false;

	if(!["modern", "minimal"].includes(interfaceMode)) return false;

	return true;
}
