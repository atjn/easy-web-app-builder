
/**
 * @file
 * If loaded, this script registers the epwa serviceworker.
 * The serviceworker will then install itself and begin to handle all network traffic on the site.
 */

if("serviceWorker" in navigator && "caches" in window){
	window.addEventListener("load", () => {
		navigator.serviceWorker.register("epwa-serviceworker.js");	
	});
}
