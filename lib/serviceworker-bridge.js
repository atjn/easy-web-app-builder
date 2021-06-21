
/**
 * @file
 * This file is inserted into the webapp when EWAB is told to build a serviceworker. When loaded by the browser, it registers the EWAB serviceworker.
 * The serviceworker will then install itself and begin to handle all network traffic for the app.
 */

//these values are automatically corrected when this file is copied into the output folder
const
	mode = "add",
	alias = "ewab",
	debug = false;



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

if(mode === "clean"){

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


}else if(mode === "add"){

	if("serviceWorker" in navigator && "caches" in window && "indexedDB" in window){
		window.addEventListener("load", () => {
			navigator.serviceWorker.register(`../${alias}-serviceworker.js`).then(registration => {
				log("info", "Registered serviceworker.", registration);
				return registration;
			}).catch(error => {
				log("error", "Was unable to register serviceworker.", error);
			});
		});
		/*
		function updateServiceWorker (){

		}
		*/
	}

}
