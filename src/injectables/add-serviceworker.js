
/**
 * @file
 * If loaded, this script registers the EWA serviceworker.
 * The serviceworker will then install itself and begin to handle all network traffic on the site.
 */

if("serviceWorker" in navigator && "caches" in window){
	window.addEventListener("load", () => {
		const alias = "ewa"; //the alias is automatically updated to the correct value when this file is copied into the output folder
		navigator.serviceWorker.register(`${alias}-serviceworker.js`);	
	});
}
