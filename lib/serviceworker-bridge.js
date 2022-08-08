
/**
 * @file
 * This file is inserted into the webapp when EWAB is told to build a serviceworker. When loaded by the browser, it registers the EWAB serviceworker.
 * The serviceworker will then install itself and begin to handle all network traffic for the app.
 */

import { Workbox } from "./workbox-window.js";

import { Dialog, InfoDialog } from "./dialogs.js";

// These values are automatically corrected when this file is copied into the output folder
const settings = {
	add: "true",
	clean: false,
	alias: "ewab",
	debug: false,
	displayUpdateDialog: true,
	instantUpdateWindowSeconds: 2,
	periodicUpdateCheckHours: 1,
};


globalThis[settings.alias] ??= {};

const updateSessionStatusName = `${settings.alias}-update-status`;

/**
 * @param type
 * @param message
 * @param object
 */
function log(type, message, object){

	if(false && debug){

		const typeColorMap = {
			info: object ? "52 152 219" : "46 204 113",
			warning: "243 156 18",
			error: "192 57 43",
		};

		const styledMessage = [
			`%cewabb%c    ${message}`,
			`background-color:rgb(${typeColorMap[type]});color:white;padding:.2em .5em;border-radius:.5em;font-weight:bold`,
			"",
		];

		if(object){
			console.groupCollapsed(...styledMessage);
			console.log(object);
			console.groupEnd();
		}else{
			console.log(...styledMessage);
		}

	}

}

if(settings.clean){

	if("serviceWorker" in navigator){
		window.addEventListener("load", () => {
			navigator.serviceWorker.getRegistrations()
				.then(async registrations => {
					for(const registration of registrations){
						await registration.unregister();
						log("info", "Asked browser to unregister serviceworker.", registration);
					}
					return;
				})
				.catch(error => {
					log("error", "Unable to unregister serviceworkers.", error);
				});
		});
	}


}else if(settings.add){

	if(settings.displayUpdateDialog){

		const infoDialogName = `${settings.alias}-info-dialog`;
		customElements.define(infoDialogName, InfoDialog);

		if(window.sessionStorage?.getItem(updateSessionStatusName) === "reloading"){
			window.sessionStorage?.removeItem(updateSessionStatusName);
			const infoDialog = document.createElement(infoDialogName);
			infoDialog.message = "The app just updated to the latest version";
			infoDialog.timeout = 4000;
			document.body.appendChild(infoDialog);
		}

		const updateDialogName = `${settings.alias}-update-dialog`;

		class UpdateDialog extends Dialog{

			constructor(){
				super("A new version of the app is available");
			}
			
			connectedCallback(){
				super.connectedCallback();
		
				// Putting this in JS is stupid, but there is no native way to import it from an html template file (╯°□°)╯︵ ┻━┻
				const reloadButtonStyle = document.createElement("style");
				reloadButtonStyle.textContent = `
.reload {
	text-transform: uppercase;
	font-size: .9em;
	font-weight: bold;
	color: rgb(191 215 255);
}
				`;
				const reloadButton = document.createElement("button");
				reloadButton.classList.add("reload");
				reloadButton.innerText = "Reload";		
		
				reloadButton.addEventListener("click", async () => {
					this.#updateEvent?.reload?.();
					this.close();
				}, { passive: true });

				this.shadowRoot.appendChild(reloadButtonStyle);
				const dialog = this.shadowRoot.querySelector("dialog");
				dialog.insertBefore(reloadButton, dialog.querySelector("button.close"));
		
				document.addEventListener(`${settings.alias}-update-available`, async event => {
					this.#updateEvent = event;
					this.open();
				}, { passive: true });
			
			}

			#updateEvent;

		}
		
		customElements.define(updateDialogName, UpdateDialog);
		const updateDialog = document.createElement(updateDialogName);
		document.body.appendChild(updateDialog);

	}

	if("serviceWorker" in navigator && "caches" in window && "indexedDB" in window){

		const serviceWorker = new Workbox(`../${settings.alias}-serviceworker.js`);

		globalThis[settings.alias].serviceWorker = serviceWorker;

		let contentLoaded;

		document.addEventListener("DOMContentLoaded", () => {
			contentLoaded = Date.now();
		});

		serviceWorker.addEventListener("waiting", () => {
			if(settings.instantUpdateWindowSeconds > 0 && ( !contentLoaded || contentLoaded >= Date.now() - (settings.instantUpdateWindowSeconds * 1000) )){
				setUpdateSessionStatus("reloading");
				serviceWorker.messageSkipWaiting();
			}else{
				setUpdateSessionStatus("waiting");
				const event = new CustomEvent(`${settings.alias}-update-available`);
				event.reload = () => {
					setUpdateSessionStatus("reloading");
					serviceWorker.messageSkipWaiting();
				};
				document.dispatchEvent(event);
			}
		});

		navigator.serviceWorker.addEventListener("controllerchange", () => {

			// Make sure that the EWAB is responsible for the controllerchange. If yes, then restart to finish the update.
			if(window.sessionStorage?.getItem(updateSessionStatusName) === "reloading"){
				window.location.reload();
			}
			
		});

		serviceWorker.register().then(registration => {
			log("info", "Registered serviceworker.", registration);
			globalThis[settings.alias].serviceWorkerRegistration = registration;
			updateServiceWorkerPrediodically();
			return registration;
		}).catch(error => {
			log("error", "Was unable to register serviceworker.", error);
		});
		
	}

}

/**
 *
 * @param status
 */
function setUpdateSessionStatus(status){
	try {
		window.sessionStorage.setItem(updateSessionStatusName, status);
	}catch{
		console.warn("Unable to use session storage when updating the serviceworker. The update will still work, but it will not be as user-friendly.");
	}
}

/**
 *
 */
function updateServiceWorkerPrediodically(){
	registration.update();

	const hour = 1000 * 60 * 60;
	setTimeout(updateServiceWorkerPrediodically, settings.periodicUpdateCheckHours * hour);
}
