
/**
 * @file
 * If loaded, this script removes any serviceworkers that were previously attached to the website.
 * This is useful if a serviceworker was used previously, but has now been scrapped.
 */

if("serviceWorker" in navigator){
	window.addEventListener("load", () => {
		navigator.serviceWorker.getRegistrations()
			.then(registrations => {
				for(const registration of registrations){
					registration.unregister();
				}
				return;
			})
			.catch(error => {
				throw new Error(`Unable to unregister serviceworkers: ${error}`);
			});
	});
}
