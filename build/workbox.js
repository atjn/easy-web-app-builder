import fs from "fs-extra";
import path from "path";
import { ewabSourcePath } from "../src/tools.js";
import { log, bar } from "../src/log.js";

global.ewabConfig = {interface: "modern"};

bar.begin("Reading Workbox dependencies");

const workboxWindowMeta = await fs.readJson(path.join(ewabSourcePath, "node_modules/workbox-window/package.json"), "utf8");
let workboxWindow = await fs.readFile(path.join(ewabSourcePath, "node_modules/workbox-window/build/workbox-window.prod.mjs"), "utf8");

bar(0.5, "Injecting Workbox dependencies");

workboxWindow = `/* eslint-disable */\n\n/**\n * Methods copied from workbox-window v${workboxWindowMeta.version}\n * https://www.npmjs.com/package/workbox-window\n */\n${workboxWindow}`
	.replace(/^\/\/# sourceMappingURL=.*$/mu, "");

await fs.writeFile(path.join(ewabSourcePath, "lib/workbox-window.js"), workboxWindow);

bar.end("Inject Workbox dependencies");
log("modern-only", "");
