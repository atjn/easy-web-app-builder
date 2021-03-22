"use strict";

/**
 * @file
 * Main function.
 */

/* eslint-disable complexity */


const workingDirectory = process.cwd();

module.exports = {
	
	/**
	 * 
	 * @param {object} options - Can override some of the options found in a config file
	 */
	easyWebapp: async (options) => {	

		options = options || {};

		const path = require("path");
		const site_root = options.root || workingDirectory;

		const fs = require("fs-extra");
		const matcher = require("matcher");
		const jsdom = require("jsdom");
		const {hashElement} = require("folder-hash");

		const {minify_image, minify_file, remove_item} = require("./minifiers.js");

		const t = require("./tools.js");

		const icon_generator = require("pwa-asset-generator");
		const {generateSW} = require("workbox-build");

		const Gauge = require("gauge");

		const warmup_gauge = new Gauge();
		const warmup_gauge_pulse = setInterval(() => {warmup_gauge.pulse();}, 100);
		warmup_gauge.show("Easy-PWA: Warming up", 0);


		const config_file_path = path.join(site_root, "/.epwaconfig.json");

		if(!fs.existsSync(config_file_path)) fs.writeFileSync(config_file_path, `{}`);

		const rule_options = [
			"minify_files", 
			"minify_images",
			"convert_images",
			"remove_files",
			"dont_minify_files", 
			"dont_minify_images",
			"dont_convert_images",
			"dont_remove_files",
		];

		const config = {
			...{

				"source": "/source",
				"output": "/public",

				"index": "index.html",
				"manifest": "manifest.json",
				"app_icon_source": "",

				"app_icons": [],

				"verbose": false,
				"use_cache": true,

				"auto_minify_files": true,
				"auto_minify_HTML": true,
				"auto_minify_CSS": true,
				"auto_minify_JS": true,
				"auto_minify_JSON": true,
				"auto_minify_SVG": true,

				"auto_minify_images": true,
				"auto_minify_PNG": true,
				"auto_minify_JPG": true,
				"auto_minify_WEBP": true,

				"auto_convert_images": true,
				"auto_convert_image_references": true,
				"auto_convert_PNG": true,
				"auto_convert_JPG": true,
				"auto_convert_WEBP": true,

				"convert_image_target": ".webp",

				"minify_files": [],
				"minify_images": [], 
				"convert_images": [], 
				"remove_files": [],

				"dont_minify_files": [],
				"dont_minify_images": [
					"*/epwa/icons/*",
				],
				"dont_convert_images": [], 
				"dont_remove_files": [],

				"add_serviceworker": true,

				"add_icons": true,
				"manifest_icons_merge_mode": "override",
				"index_icons_merge_mode": "override",
				
			},
			...JSON.parse(fs.readFileSync(config_file_path)),
		};
		/*
		const css = '@import "missing.css";';

		const ccss = require("clean-css");

		const test = new ccss().minify(css);

		console.log(test);
		*/

		for(const name of rule_options){
			for(const rule in config[name]){
				if(typeof config[name][rule] === "string") config[name][rule] = {"file": config[name][rule], "recursive": true};
			}
		}

		const cache_directory = path.join(site_root, "/.epwa_cache");

		fs.ensureFileSync(path.join(cache_directory, "cache_hash.json"));
		const cache_hash = fs.readJsonSync(path.join(cache_directory, "cache_hash.json"), {throws: false});

		if(
			config.use_cache === false ||
			(await hashElement(cache_directory, {"files": {"exclude": ["*_hash.*"]}})).hash !== cache_hash?.hash ||
			"TODO - 1.1.0" !== cache_hash?.version
		){
			fs.removeSync(cache_directory);
			fs.copySync(path.join(site_root, "/build-scripts/injectables/cache"), cache_directory);
		}

		
		if(config.verbose) console.log(`Copying '${path.join(config.source)}' to '${path.join(config.output)}'`);
		//if(!fs.existsSync(path.join(site_root, config.source))) fs.mkdirSync(path.join(site_root, config.source));
		fs.removeSync(path.join(site_root, config.output));
		fs.copySync(path.join(site_root, config.source), path.join(site_root, config.output));
		fs.mkdirSync(path.join(site_root, config.output, "epwa"));

		/*
		if(config.verbose) console.log("Inserting serviceworker cache id");
		let file = path.join(__dirname, "../public/serviceWorker.js");
		hashElement(path.join(__dirname, "../public"), {files: {exclude: ["wishes.json"]}}, (error, hash) => {
			if(error) return console.error("Unable to hash file for id");
			fs.writeFileSync(file, fs.readFileSync(file, "utf-8").replace("!BUILD_INSERT_ID!", "pwa-" + hash.hash + "-cache"));
		})
		*/

		const index_path = path.join(site_root, config.output, config.index);

		const index_dom = new jsdom.JSDOM(fs.readFileSync(index_path));

		if(!index_dom.window.document.head){
			const head = index_dom.window.document.createElement("head");
			index_dom.window.document.appendChild(head);
		}

		config.app_icon_source =
			config.app_icon_source ||
			index_dom.window.document.head.querySelector("link[rel=icon")?.href ||
			"../build-scripts/injectables/generic/images/logo.svg";

		//console.log(config.app_icon_source);

		for(const link of index_dom.window.document.head.querySelectorAll("link[rel*=icon")){
			if(link.href) config.app_icons.push(path.join(config.output, link.href));
		}

		clearInterval(warmup_gauge_pulse); warmup_gauge.hide(); console.log(`Easy-PWA: Compiling PWA from '${config.source}' to '${config.output}':`);
		
		if(config.add_icons){

			const gauge = new Gauge();
			const gauge_pulse = setInterval(() => {gauge.pulse();}, 100);
			gauge.show("Checking if a valid icon cache exists", 0);
			
			const generator_config = {
				type: "png",
				opaque: false,
				scrape: false,
				favicon: Boolean(!index_dom.window.document.head.querySelector("link[rel=icon")),
				pathOverride: "epwa/icons",
				mstile: true,
				log: false,
			};

			const hash = {
				"source_hash": (await hashElement(path.join(site_root, config.output, config.app_icon_source))).hash,
				"config": generator_config,
			};

			fs.ensureFileSync(path.join(cache_directory, "icons_hash.json"));
			const cached_hash = fs.readJsonSync(path.join(cache_directory, "icons_hash.json"), {throws: false});

			if(
				hash.source_hash !== cached_hash?.source_hash ||
				JSON.stringify(hash.config) !== JSON.stringify(cached_hash?.config)
			){

				gauge.show("Generating icons", .05);
				const gauge_generation_pulse = setInterval(() => {
					//Expects pwa-asset-generator to generate 30 files. Not a perfect measure but good enough for a status bar.
					const progress = .05 + ((fs.readdirSync(path.join(cache_directory, "icons")).length / 30) * .8);
					gauge.show("Generating icons", progress < .85 ? progress : .85);
				}, 500);

				fs.removeSync(path.join(cache_directory, "icons")); fs.mkdir(path.join(cache_directory, "icons"));
				fs.removeSync(path.join(cache_directory, "icons_injectables")); fs.mkdir(path.join(cache_directory, "icons_injectables"));

				const output = await icon_generator.generateImages(
					path.join(site_root, config.output, config.app_icon_source),
					path.join(cache_directory, "icons"),
					generator_config,
				);
				
				clearInterval(gauge_generation_pulse);
				gauge.show("Generating icon references", .85);
				

				const htmlString = Object.values(output.htmlMeta).join("");

				fs.writeFileSync(path.join(cache_directory, "icons_injectables/index.html"), htmlString);
				fs.writeJsonSync(path.join(cache_directory, "icons_injectables/manifest.json"), output.manifestJsonContent);
				fs.writeJsonSync(path.join(cache_directory, "icons_hash.json"), hash);	
			
			}

			gauge.show("Adding icons to project", .9);
			
			if(config.manifest_icons_merge_mode === "override"){
				for(const link of index_dom.window.document.head.querySelectorAll("link[rel*=icon")) link.remove();
			}

			fs.copySync(path.join(cache_directory, "icons"), path.join(site_root, config.output, "epwa/icons"));

			config.app_icons = [...config.app_icons, ...t.getDirectoryFiles(path.join(site_root, config.output, "epwa/icons")).map(file => {return path.join(config.output, "epwa/icons", file);})];

			index_dom.window.document.head.innerHTML += fs.readFileSync(path.join(cache_directory, "icons_injectables/index.html"));

			clearInterval(gauge_pulse); gauge.hide(); console.log(`- Added icons`);

		}

		const files_minified = [];
		const file_modifiers = [];

		const gauge = new Gauge();
		const gauge_pulse = setInterval(() => {
			gauge.pulse();
			gauge.show("Minifying items", files_minified.length / file_modifiers.length);
		}, 100);

		await process(config.output, config);

		await Promise.allSettled(file_modifiers);

		clearInterval(gauge_pulse); gauge.hide(); console.log(`- Minified ${files_minified.length} items, saving ${(files_minified.reduce((a, b) => a + b, 0) / 1000000).toFixed(2)} MB`);

		if(config.add_serviceworker){

			const gauge = new Gauge();
			const gauge_pulse = setInterval(() => {gauge.pulse();}, 100);
			gauge.show("Adding serviceworker", 0);

			const workbox_config = {
				"globDirectory": config.output,
				"globPatterns": [
					"**/*.{css,js,svg,html,json}",
				],
				"swDest": path.join(cache_directory, "serviceworker", "epwa-serviceworker.js"),
				"cacheId": "epwa",
				"cleanupOutdatedCaches": true,
				"mode": "production",
				"sourcemap": false,

				"runtimeCaching": [
					{
						"urlPattern": /\.(?:png|jpg|jpeg|webp|avif|jxl)$/u,
						"handler": "CacheFirst",
						"options": {
							"cacheName": "epwa-images",
							"expiration": {
								"maxAgeSeconds": 30 * 24 * 60 * 60,
							},
						},
					},
					{
						"urlPattern": /\.json$/u,
						"handler": "NetworkFirst",
						"options": {
							"cacheName": "epwa-content",
							"networkTimeoutSeconds": 5,
						},
					},
				],

			};

			const hash = {
				"source_hash": (await hashElement(path.join(site_root, config.output))).hash,
				"config": workbox_config,
			};

			fs.ensureFileSync(path.join(cache_directory, "serviceworker_hash.json"));
			const cached_hash = fs.readJsonSync(path.join(cache_directory, "serviceworker_hash.json"), {throws: false});

			if(
				hash.source_hash !== cached_hash?.source_hash ||
				JSON.stringify(hash.config) !== JSON.stringify(cached_hash?.config)
			){
				gauge.show("Generating serviceworker", .05);

				fs.removeSync(path.join(cache_directory, "serviceworker")); fs.mkdir(path.join(cache_directory, "serviceworker"));

				await generateSW(workbox_config);

			}

			gauge.show("Adding serviceworker to project", .9);

			fs.copySync(path.join(site_root, "/build-scripts/injectables/add-serviceworker.js"), path.join(site_root, config.output, "/epwa/add-serviceworker.js"));

			const script = index_dom.window.document.createElement("script"); script.src = "epwa/add-serviceworker.js"; script.async = "true"; //async doesnt work


			index_dom.window.document.head.appendChild(script);

			let index_manifest = index_dom.window.document.head.querySelector("link[rel=manifest]");
			if(index_manifest){
				config.manifest = index_manifest.href;
			}else{
				index_manifest = index_dom.window.document.createElement("link"); index_manifest.href = config.manifest;
				index_dom.window.document.head.appendChild(index_manifest);
			}

			fs.writeFileSync(index_path, index_dom.window.document.documentElement.outerHTML);

			const manifest_path = path.join(site_root, config.output, config.manifest);
			if(!fs.existsSync(manifest_path) || !fs.lstatSync(manifest_path).isFile()){
				fs.copySync(path.join(site_root, "/build-scripts/injectables/generic/manifest.json"), manifest_path);
				console.log("No manifest found, using generic manifest. You have to make your own manifest file, and a good way to start is to generate a generic one in your source folder with the command 'easy-pwa generate manifest'");
			}

			const manifest_json = JSON.parse(fs.readFileSync(manifest_path));

			for(const icon of manifest_json.icons){
				if(icon.src) config.app_icons.push(path.join(config.output, icon.src));
			}


			fs.copySync(path.join(cache_directory, "serviceworker"), path.join(site_root, config.output));

			fs.writeJsonSync(path.join(cache_directory, "serviceworker_hash.json"), hash);	

			clearInterval(gauge_pulse); gauge.hide(); console.log(`- Added serviceworker`);

		}

		const cooldown_gauge = new Gauge();
		const cooldown_gauge_pulse = setInterval(() => {cooldown_gauge.pulse();}, 100);
		cooldown_gauge.show("Cooling down", 0);

		await t.cleanUnusedCacheFiles(path.join(site_root, config.source), cache_directory);

		await fs.writeJson(
			path.join(cache_directory, "cache_hash.json"),
			{
				"hash": (await hashElement(cache_directory, {"files": {"exclude": ["*_hash.*"]}})).hash,
				"version": "TODO - 1.1.0",
			},
		);

		clearInterval(cooldown_gauge_pulse); cooldown_gauge.hide(); console.log("Done!"); console.log("");

		async function process(folder_relative_mount, input_config){

			const folder_mount = path.join(site_root, folder_relative_mount);

			let local_config = input_config;
			
			
			for(const name of rule_options){
				local_config[name] = local_config[name].filter(rule => {
					return Boolean(rule.recursive);
				});
			}

			const local_config_file_path = path.join(folder_mount, "/.epwaconfig.json");
			const directory_config = fs.existsSync(local_config_file_path) ? JSON.parse(fs.readFileSync(local_config_file_path)) : {};

			for(const name of rule_options){
				if(directory_config[name]){
					if(typeof directory_config[name] === "string") directory_config[name] = [directory_config[name]];
					local_config[name] = local_config[name].concat(directory_config[name]);
				}
				delete directory_config[name];
			}
			
			local_config = {...local_config, ...directory_config};


			for(const name of rule_options){
				for(const rule in local_config[name]){
					if(typeof local_config[name][rule] === "string") local_config[name][rule] = {"file": local_config[name][rule]};
				}
			}

			//console.log(local_config);

			const directory_files = t.getDirectoryFiles(folder_mount);

			const minify_files = new Set(local_config.auto_minify_files ?
				
				directory_files.filter(mount => {

					const ext = path.extname(mount).toLowerCase();

					if(![".html", ".css", ".js", ".json", ".svg"].includes(ext)) return false;

					if(
						(".html"	=== ext	&& !local_config.auto_minify_HTML) ||
						(".css"		=== ext && !local_config.auto_minify_CSS) ||
						(".js"		=== ext && !local_config.auto_minify_JS) ||
						(".json"	=== ext && !local_config.auto_minify_JSON) ||
						(".svg"		=== ext && !local_config.auto_minify_SVG)
					) return false;

					
					const dont_minify_files_strings = []; //t.getRuleStringArray(local_config.dont_minify_files);
					if(matcher.isMatch(path.join(folder_mount, mount), dont_minify_files_strings)) return false;


					if(mount.startsWith(".")) return false;

					return true;
				})
				: []);

			//console.log(minify_files);

			const minify_images = [];

			const dont_convert_images_strings = t.getRuleStringArray(local_config.dont_convert_images);
			const dont_minify_images_strings = t.getRuleStringArray(local_config.dont_minify_images);
			const convert_images_strings = t.getRuleStringArray(local_config.convert_images);
			const minify_images_strings = t.getRuleStringArray(local_config.minify_images);

			//console.log(config.app_icons);

			for(const mount of directory_files){

				const ext = path.extname(mount).toLowerCase();

				const tempMatch = (_mount, rules) => {return Boolean(matcher.isMatch(path.join(folder_relative_mount, _mount), rules));};

				const dont_convert_image = tempMatch(mount, dont_convert_images_strings);
				const dont_minify_image = tempMatch(mount, dont_minify_images_strings);
				const convert_image = tempMatch(mount, convert_images_strings);
				const minify_image = tempMatch(mount, minify_images_strings);

				if(dont_minify_image || ![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) continue;

				if(config.app_icons.includes(path.join(folder_relative_mount, mount))){

					minify_images.push({"mount": mount, "ext": ext});

				}else if(
					!dont_convert_image &&
					(
						convert_image ||
						(
							local_config.auto_convert_images &&
							ext !== local_config.convert_image_target &&
							(
								(".png"	=== ext					&& local_config.auto_convert_PNG) ||
								([".jpg", ".jpeg"].includes(ext) && local_config.auto_convert_JPG) ||
								(".webp"	=== ext					&& local_config.auto_convert_WEBP)
							)
						)
					)
				){

					minify_images.push({"mount": mount, "ext": local_config.convert_image_target});

				}else if(
					minify_image ||
					(
						local_config.auto_minify_images &&
						(
							(".png"	=== ext					&& local_config.auto_minify_PNG) ||
							([".jpg", ".jpeg"].includes(ext) && local_config.auto_minify_JPG) ||
							(".webp"	=== ext					&& local_config.auto_minify_WEBP)
						)
					)
				){

					minify_images.push({"mount": mount, "ext": ext});

				}

			}

			const remove_files = expandWildcardRules(new Set(t.getRuleStringArray(local_config.remove_files)));

			if(fs.existsSync(local_config_file_path)) remove_files.add("/.epwaconfig.json");
			
			for(const mount of minify_files){
				if(fs.existsSync(path.join(folder_mount, mount)) && fs.lstatSync(path.join(folder_mount, mount)).isFile()){
					file_modifiers.push(
						minify_file(path.join(folder_mount, mount), path.join(cache_directory, "/files")).then(result => {
							return files_minified.push(result);
						}),
					);
				}
			}

			for(const file of minify_images){
				if(fs.existsSync(path.join(folder_mount, file.mount)) && fs.lstatSync(path.join(folder_mount, file.mount)).isFile()){
					file_modifiers.push(
						minify_image(path.join(folder_mount, file.mount), path.join(cache_directory, "/files"), [file.ext]).then(result => {
							return files_minified.push(result);
						}),
					);
				}
			}

			for(const mount of remove_files){

				const item_path = path.join(folder_mount, mount);

				if(fs.existsSync(item_path)){

					file_modifiers.push(
						remove_item(item_path).then(result => {
							return files_minified.push(result);
						}),
					);

				}


			}

			for(const directory of t.getDirectories(folder_mount)) await process(path.join(folder_relative_mount, directory), local_config);


			function expandWildcardRules(list){

				for(const rule of list){
					if(rule.includes("*")){
						list = new Set([...list, ...matcher(directory_files, [rule])]);
						list.delete(rule);
					}
				}

				return list;

			}

		}

	},
	
};
