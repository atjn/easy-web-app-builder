/* global ewabConfig ewabRuntime */

/**
 * @file
 * These functions handle all of EWAB's logging.
 * Since logging is used extensively in this project, some best practices have been sacrificed in order to make the functions faster to use.
 */

import chalk from "chalk";
import logUpdate from "log-update";

import files from "./files.js";
import { logInterfaces } from "./config.js";

const progressBar = {
	length: 11,
	progress: 0,
	spinnerFrames: [ "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏", "⠋" ],
	spinnerCurrentFrame: "⠙",
	generate: () => {
		const completedLength = Math.round(progressBar.length * progressBar.progress);
		return `${chalk.bgGreen(" ".repeat(completedLength))}${chalk.bgGray(" ".repeat(progressBar.length - completedLength))} ${progressBar.spinnerCurrentFrame} ${progressBar.message}`;
	},
};

let warmupLogged = false;

const allLogs = [];

let loggingDisabled = false;

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
 * If called with only a single string, that is logged as a `debug` message.
 * 
 * @param	{"standard"|"debug"|"warning"|"error"|"modern-only"}	[type] - What kind of message it is.
 * @param	{string}												[message] - The message to log.
 * @param	{Error}													[error] - The error to throw. Only used when `type` = "error".
 */
export function log(type = "debug", message, error){

	if(loggingDisabled) return;

	//This is a pro gamer move that allows logging debug messages without having to define "debug" a million times.
	if(message === undefined){
		message = type;
		type = "debug";
	}

	if(type === "error"){

		bar.freeze();
		console.log(`${chalk.black.bgRed("error".padAround(progressBar.length, " "))} ${chalk.red(message)}${ewabConfig.interface === "debug" ? "" : "\n"}`);
		if(ewabConfig.ignoreErrors){
			log("warning", "Will ignore this error and try to complete the process. Please disable this behavior (config.ignoreErrors) before publishing to production!");
		}else{
			ewabRuntime.fatalErrorEncountered = true;
			// Decoupling the cleanup function gives other read/write functions a chance to complete and exit.
			setTimeout(async () => {
				await files.clean();
				throw error;
			}, 10);
		}

	}else if(!ewabConfig.interface){

		allLogs.push({type, message});

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

		loggingDisabled = Boolean(ewabConfig.interface === "none");

		const headerWidth = 26;
		log("modern-only", chalk.black.bgCyan(`\n${"".padAround(headerWidth, " ")}\n${"Easy Web App Builder".padAround(headerWidth, " ")}\n${"".padAround(headerWidth, " ")}\n`));

		bar.begin("Warming up");

		for(const queuedLog of allLogs){
			log(queuedLog.type, queuedLog.message);
		}

		log(`Figured out that interface "${ewabConfig.interface}" should be used. Will now log ${allLogs.length + 1} logs that were queued.`);

		warmupLogged = true;

	}
};

/**
 * Updates the ongoing progress bar with new progress/messages.
 * 
 * @param	{number}	progress - A decimal number between 0 and 1. Defines how close the progress is to completion.
 * @param	{string}	[message] - Updates the status message beside the bar. If this isn't defined, the old message is kept.
 */
export function bar(progress, message){

	if(loggingDisabled) return;

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

	if(loggingDisabled) return;

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

	if(loggingDisabled) return;

	bar.hide();
	
	if(ewabConfig.interface !== "minimal"){
		log("standard", `${chalk.black.bgGreen("success".padAround(progressBar.length, " "))} ${message}`);
	}

};

/**
 * Completes the ongoing progress bar, and hides it as if it was never there.
 */
bar.hide = () => {

	if(loggingDisabled) return;

	if(progressBar.pulse){
		clearInterval(progressBar.pulse);
		logUpdate.clear();
	}

};

/**
 * Freezes the ongoing progress bar.
 */
bar.freeze = () => {

	if(loggingDisabled) return;

	if(progressBar.pulse){
		clearInterval(progressBar.pulse);
		logUpdate.done();
	}

};

/**
 * Determines whether TTY functions should be used.
 * 
 * @param {string}	interfaceMode	- The name of the interface being used right now.
 * 
 * @returns {boolean}	- Whether TTY functions should be used.
 */
function useTTY(interfaceMode){

	if(!process.stdout.isTTY) return false;

	if(!["modern", "minimal"].includes(interfaceMode)) return false;

	return true;
}
