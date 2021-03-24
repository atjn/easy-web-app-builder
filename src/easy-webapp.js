"use strict";

/**
 * @file
 * Main function.
 */

const path = require("path");
const fs = require("fs-extra");
const {glob} = require("glob");
const merge = require("deepmerge");
const {hashElement} = require("folder-hash");
const jsdom = require("jsdom");

const t = require("./tools.js");
const {baseConfig} = require("./elements.js");
const {minifyImage, minifyFile, removeItem} = require("./minifiers.js");

const Gauge = require("gauge");

const icon_generator = require("pwa-asset-generator");
const {generateSW} = require("workbox-build");


const cwd = process.cwd();

module.exports = {
	
	/**
	 * 
	 * @param {object} callConfig - Can override some of the options found in a config file
	 */
	easyWebapp: async (callConfig = {}) => {	

		const warmup_gauge = new Gauge();
		const warmup_gauge_pulse = setInterval(() => {warmup_gauge.pulse();}, 100);
		warmup_gauge.show("easy-webapp: Warming up", 0);

		t.validateConfig(callConfig, "call");
		const rootPath = callConfig.root || cwd;
		
		const config = merge.all([
			baseConfig,
			t.getFolderConfig(rootPath, callConfig.configName),
			t.mapCallConfig(callConfig),
		]);

		config.fileExceptions.push({
			glob: `${config.alias}/icons/**/*`,
			images: {
				minify: false,
			},
		});


		const cachePath = path.join(rootPath, `.${config.alias}-cache`);

		await t.ensureCache(cachePath, !config.useCache);
		
		if(config.verbose) console.log(`Copying '${path.join(config.source)}' to '${path.join(config.output)}'`);
		await fs.ensureDir(path.join(rootPath, config.source));
		await fs.emptyDir(path.join(rootPath, config.output));
		await fs.copy(path.join(rootPath, config.source), path.join(rootPath, config.output));
		await fs.mkdir(path.join(rootPath, config.output, config.alias));

		
		const indexPath = path.join(rootPath, config.output, config.index);
		const indexDom = new jsdom.JSDOM(fs.readFileSync(indexPath));

		if(!indexDom.window.document.head){
			const head = indexDom.window.document.createElement("head");
			indexDom.window.document.appendChild(head);
		}

		if(config.icons.source){
			config.icons.source = path.join(rootPath, config.output, config.icons.source);
		}else{
			const domSource = indexDom.window.document.head.querySelector("link[rel=icon]")?.href;
			if(domSource){
				config.icons.source = path.join(rootPath, config.output, String(domSource));
			}else{
				config.icons.source = path.join(__dirname, "injectables/generic/images/logo.svg");
			}
		}

		//console.log(config.icons.source);

		for(const link of indexDom.window.document.head.querySelectorAll("link[rel*=icon]")){
			if(link.href) config.icons.list.push(path.join(rootPath, config.output, link.href));
		}

		clearInterval(warmup_gauge_pulse); warmup_gauge.hide(); console.log(`easy-webapp: Compiling webapp from '${config.source}' to '${config.output}':`);
		
		await addIcons();

		await minifyFiles();

		await addServiceworker();

		const cooldown_gauge = new Gauge();
		const cooldown_gauge_pulse = setInterval(() => {cooldown_gauge.pulse();}, 100);
		cooldown_gauge.show("Cooling down", 0);

		if(config.useCache){

			await t.cleanUnusedCacheFiles(path.join(rootPath, config.source), cachePath);

			await fs.writeJson(
				path.join(cachePath, "cache-hash.json"),
				{
					"hash": (await t.generateCacheHash(cachePath)),
					"version": "TODO - 1.1.0",
				},
			);

		}else{

			fs.remove(cachePath);

		}

		clearInterval(cooldown_gauge_pulse); cooldown_gauge.hide(); console.log("Done!"); console.log("");
		
		/**
		 * --Iterates through all sub-folders and runs all processes that could be influenced by a local folder config file.
		 */
		async function minifyFiles(){

			const fileModifiers = [];
			const filesModified = [];

			const gauge = new Gauge();
			const gauge_pulse = setInterval(() => {
				gauge.pulse();
				gauge.show("Minifying items", filesModified.length / fileModifiers.length);
			}, 100);

			generateFileExceptionIndex();

			//console.log(config.fileExceptionIndex);

			//console.log(glob.sync("**/*", {cwd: path.join(rootPath, config.output)}));

			for(const filePath of glob.sync("**/*", {cwd: path.join(rootPath, config.output), absolute: true})){

				const method = determineMinificationMethod(filePath);

				if(method){

					fileModifiers.push({
						...{
							"path": filePath,
						},
						...method,
					});

				}

			}
			
			for(const modifier of fileModifiers){

				if(modifier.method === "minifyFile"){
					fileModifiers.push(
						minifyFile(modifier.path, path.join(cachePath, "files"))
							.then(result => {
								return filesModified.push(result);
							}),
					);
				}else if(modifier.method === "minifyImage"){
					fileModifiers.push(
						minifyImage(modifier.path, path.join(cachePath, "files"), modifier.extensions)
							.then(result => {
								return filesModified.push(result);
							}),
					);
				}else if(modifier.method === "removeFile"){
					fileModifiers.push(
						removeItem(modifier.path)
							.then(result => {
								return filesModified.push(result);
							}),
					);
				}

			}

			await Promise.allSettled(fileModifiers);

			clearInterval(gauge_pulse); gauge.hide(); console.log(`- Minified ${filesModified.length} items, saving ${(filesModified.reduce((a, b) => a + b, 0) / 1000000).toFixed(2)} MB`);

		}

		/**
		 * Generates a map of all exception options applied to every single absolute file path and stores it in `config.fileExceptionIndex`.
		 * This function should run several times during the operation to account for files added by easy-webapp itself.
		 * 
		 * @returns			- 
		 * 
		 */
		function generateFileExceptionIndex(){

			const index = new Map();

			for(const exception of config.fileExceptions){

				for(const filePath of glob.sync(exception.glob, {cwd: path.join(rootPath, config.output), absolute: true})){
	
					let fileConfig = exception;
					delete fileConfig.glob;
	
					if(index.has(filePath)){
						fileConfig = merge(index.get(filePath), fileConfig);
					}
	
					index.set(filePath, fileConfig);
	
				}

			}

			return config.fileExceptionIndex = index;

		}

		/**
		 * Determines if and how a file should be minified and returns a configuration object that can be passed along to the minifier.
		 * 
		 * @param	{string}	filePath	- Absolute path of the file to check.
		 * 
		 * @returns	{object | false}		- Either a configuration object or `false` fi the file should not be minified.
		 * 
		 */
		function determineMinificationMethod(filePath){

			if(!fs.existsSync(filePath)) return false;

			const fileConfig = t.generateFileConfig(config, filePath);

			const extension = t.getExtension(filePath);
			

			//console.log(fileConfig);

			if(fileConfig.files.remove === true){

				return {"method": "removeFile"};

			}else if(fs.lstatSync(filePath).isFile()){
			
				if(fileConfig.files.minify === true && ["html", "css", "js", "json", "svg"].includes(extension)){

					return {"method": "minifyFile"};

				}else if(fileConfig.images.minify === true && ["png", "jpg", "jpeg", "webp"].includes(extension)){

					if(config.icons.list.includes(filePath)){

						return {"method": "minifyImage", "extensions": [extension]};

					}else if(fileConfig.images.convert === true){

						return {"method": "minifyImage",  "extensions": fileConfig.images.targetExtensions};

					}else{

						return {"method": "minifyImage",  "extensions": [extension]};

					}

				}

			}

			return false;

		}

		/**
		 * Generates missing icons and tries to inject them into the project where necessary.
		 */
		async function addIcons(){

			if(config.icons.add === true){

				const gauge = new Gauge();
				const gauge_pulse = setInterval(() => {gauge.pulse();}, 100);
				gauge.show("Checking if a valid icon cache exists", 0);
				
				const generatorConfig = {
					type: "png",
					opaque: false,
					scrape: false,
					favicon: Boolean(!indexDom.window.document.head.querySelector("link[rel=icon")),
					pathOverride: `${config.alias}/icons`,
					mstile: true,
					log: false,
				};
	
				const hash = {
					"source_hash": (await hashElement(config.icons.source)).hash,
					"config": generatorConfig,
				};
	
				await fs.ensureFile(path.join(cachePath, "icons-hash.json"));
				const cached_hash = await fs.readJson(path.join(cachePath, "icons-hash.json"), {throws: false});
	
				if(
					hash.source_hash !== cached_hash?.source_hash ||
					JSON.stringify(hash.config) !== JSON.stringify(cached_hash?.config)
				){
	
					gauge.show("Generating icons", .05);
					const gauge_generation_pulse = setInterval(() => {
						//Expects pwa-asset-generator to generate 30 files. Not a perfect measure, but good enough for a status bar.
						const progress = .05 + ((fs.readdirSync(path.join(cachePath, "icons")).length / 30) * .8);
						gauge.show("Generating icons", progress < .85 ? progress : .85);
					}, 500);
	
					fs.removeSync(path.join(cachePath, "icons")); fs.mkdir(path.join(cachePath, "icons"));
					fs.removeSync(path.join(cachePath, "icons-injectables")); fs.mkdir(path.join(cachePath, "icons-injectables"));
	
					const output = await icon_generator.generateImages(
						config.icons.source,
						path.join(cachePath, "icons"),
						generatorConfig,
					);
					
					clearInterval(gauge_generation_pulse);
					gauge.show("Generating icon references", .85);
					
	
					const htmlString = Object.values(output.htmlMeta).join("");
	
					fs.writeFileSync(path.join(cachePath, "icons-injectables/index.html"), htmlString);
					fs.writeJsonSync(path.join(cachePath, "icons-injectables/manifest.json"), output.manifestJsonContent);
					fs.writeJsonSync(path.join(cachePath, "icons-hash.json"), hash);	
				
				}
	
				gauge.show("Adding icons to project", .9);
				
				if(config.manifest_icons_merge_mode === "override"){
					for(const link of indexDom.window.document.head.querySelectorAll("link[rel*=icon")) link.remove();
				}
	
				fs.copySync(path.join(cachePath, "icons"), path.join(rootPath, config.output, config.alias, "icons"));
	
				config.icons.list = [...config.icons.list, ...t.getDirectoryFiles(path.join(rootPath, config.output, config.alias, "icons")).map(file => {return path.join(config.output, config.alias, "icons", file);})];
	
				indexDom.window.document.head.innerHTML += fs.readFileSync(path.join(cachePath, "icons-injectables/index.html"));
	
				clearInterval(gauge_pulse); gauge.hide(); console.log(`- Added icons`);
	
			}

		}

		/**
		 * Generates a serviceworker and injects it into the project.
		 */
		async function addServiceworker(){

			if(config.serviceworker.add === true){

				const gauge = new Gauge();
				const gauge_pulse = setInterval(() => {gauge.pulse();}, 100);
				gauge.show("Adding serviceworker", 0);
	
				const workboxConfig = {
					"globDirectory": config.output,
					"globPatterns": [
						"**/*.{css,js,svg,html,json}",
					],
					"swDest": path.join(cachePath, "serviceworker", `${config.alias}-serviceworker.js`),
					"cacheId": config.alias,
					"cleanupOutdatedCaches": true,
					"mode": "production",
					"sourcemap": false,
	
					"runtimeCaching": [
						{
							"urlPattern": /\.(?:png|jpg|jpeg|webp|avif|jxl)$/u,
							"handler": "CacheFirst",
							"options": {
								"cacheName": `${config.alias}-images`,
								"expiration": {
									"maxAgeSeconds": 30 * 24 * 60 * 60,
								},
							},
						},
						{
							"urlPattern": /\.json$/u,
							"handler": "NetworkFirst",
							"options": {
								"cacheName": `${config.alias}-content`,
								"networkTimeoutSeconds": 5,
							},
						},
					],
	
				};
	
				const hash = {
					"source_hash": (await hashElement(path.join(rootPath, config.output))).hash,
					"config": workboxConfig,
				};
	
				fs.ensureFileSync(path.join(cachePath, "serviceworker-hash.json"));
				const cached_hash = fs.readJsonSync(path.join(cachePath, "serviceworker-hash.json"), {throws: false});
	
				if(
					hash.source_hash !== cached_hash?.source_hash ||
					JSON.stringify(hash.config) !== JSON.stringify(cached_hash?.config)
				){
					gauge.show("Generating serviceworker", .05);
	
					fs.removeSync(path.join(cachePath, "serviceworker")); fs.mkdir(path.join(cachePath, "serviceworker"));
	
					await generateSW(workboxConfig);
	
				}
	
				gauge.show("Adding serviceworker to project", .9);
	
				fs.copySync(path.join(__dirname, "./injectables/add-serviceworker.js"), path.join(rootPath, config.output, config.alias, "add-serviceworker.js"));
	
				const script = indexDom.window.document.createElement("script"); script.src = `${config.alias}/add-serviceworker.js`; script.async = "true"; //async doesnt work
	
	
				indexDom.window.document.head.appendChild(script);
	
				let index_manifest = indexDom.window.document.head.querySelector("link[rel=manifest]");
				if(index_manifest){
					config.manifest = index_manifest.href;
				}else{
					index_manifest = indexDom.window.document.createElement("link"); index_manifest.href = config.manifest;
					indexDom.window.document.head.appendChild(index_manifest);
				}
	
				fs.writeFileSync(indexPath, indexDom.window.document.documentElement.outerHTML);
	
				const manifest_path = path.join(rootPath, config.output, config.manifest);
				if(!fs.existsSync(manifest_path) || !fs.lstatSync(manifest_path).isFile()){
					fs.copySync(path.join(rootPath, "./injectables/generic/manifest.json"), manifest_path);
					console.log("No manifest found, using generic manifest. You have to make your own manifest file, and a good way to start is to generate a generic one in your source folder with the command 'easy-pwa generate manifest'");
				}
	
				const manifest_json = JSON.parse(fs.readFileSync(manifest_path));
	
				for(const icon of manifest_json.icons){
					if(icon.src) config.icons.list.push(path.join(config.output, icon.src));
				}
	
	
				fs.copySync(path.join(cachePath, "serviceworker"), path.join(rootPath, config.output));
	
				fs.writeJsonSync(path.join(cachePath, "serviceworker-hash.json"), hash);	
	
				clearInterval(gauge_pulse); gauge.hide(); console.log(`- Added serviceworker`);
	
			}

		}

	},
	
};
