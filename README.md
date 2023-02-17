# Easy Web App Builder (EWAB)

| :warning: | This software is still under development. Expect bad documentation, weird bugs, missing features, and a constant flood of breaking changes. |
|-----------|---------------------------------------------------------------------------------------------------------------------------------------------|

EWAB automates all the boring stuff you need to do when publishing a webapp. It will:

- Generate icons in all necessary sizes and link to them in your html and manifest files.
- Generate a serviceworker, allowing your site to run as a standalone app.
- Minify your files.
- Compress your images.

..and it will do all this with no configuration!

## Motivation
Doing the same repetitive work for every release of a webapp (or any project) has always been a nuisance for developers, which is why we now have many excellent build systems that can do the work for us. These build systems are often very modular, which means they can do anything you could ever want them to, but that modularity also comes at a cost. It can take forever to find the correct modules, understand how to use them, and set them up just right to get everything working, and because of that long setup time, many developers just don't bother with any of it.

EWAB is designed to solve this problem. It isn't modular, it can't do every single crazy idea you have in mind, but it will do most of the stuff most people need, and it will do it with no setup _at all_. It is very adaptable and will apply best-practices wherever it can without requiring the developer to even know what is going on.
At the same time, EWAB doesn't block the developer from making improvements to the process. Most of the stuff EWAB does is very configurable, and if that isn't enough, certain parts of EWAB can be turned off and handed over to a more complicated build system, while EWAB takes care of all the other stuff the developer doesn't want to touch.

## How to use
EWAB is a Node module. If you don't know what that means, you should start by checking out one of the great tutorials online, such as [nodejs.dev](https://nodejs.dev/learn/introduction-to-nodejs).

When you have Node installed, you can install EWAB in your project with the following command:
```
npm install easy-web-app-builder --save-dev
```
Now make sure your website files are all in a folder, at the root of your project, called something like "source".

Build the website by running the following command:
```
easy-web-app-builder
```

EWAB will now start up and spend a minute working on your website. When it is done, it will copy the completed website to that new folder.
While running, EWAB will tell you what it is doing, and will sometimes warn you if it has trouble understanding your website. Please read these messages carefully to make sure everything is working smoothly.

## Customizing the process
It is possible to customize much of the work EWAB does. The recommended way to do this, is to run the setup wizard:
```
npx easy-web-app-builder setup
```

If you'd rather set things up manually, you can do so by adding a file called ".ewabconfig.js" to the root of your project. An ewabconfig file could look something like this:
```js
export default {

	outputPath: "build/ewab",

	serviceworker: {
		add: true,
	},

	fileExceptions: [
		{
			glob: "**/*.dev.*",
			files: {
				remove: true,
			},
		},
	],
};
```
You can also pass a JSON configuration to EWAB through the CLI:
```
npx easy-web-app-builder --config '{"outputPath": "build/ewab"}'
```
If a configuration is present both in the CLI and as a file, they are merged.


Here are some of the things you can set in the configuration object:

## Basic settings

### `inputPath` and  `outputPath`
The source files for your webapp need to be saved to a folder somewhere. EWAB will try to guess which folder it should use, but you can also set it manually like this:
```js
{
  inputPath: "path/to/input/folder/",
}
```
When EWAB is done, it will output the final website to a new folder. If you want to specify the folder name/path, you can do so like this:
```js
{
  outputPath: "path/to/output/folder/",
}
```

## Icons
By default, EWAB will find your website's favicon, generate it in different sizes, and then add the new copies to the website. If you don't want EWAB to mess with your icons, you can set:
```js
{
  icons: {
    add: false,
  },
}
```

If EWAB is using the wrong image as favicon, you can tell it exactly which icon it should use by setting:
```js
{
  icons: {
    source: {
      any: "path/to/your/favicon.svg",
    },
  },
}
```

## Images

## Files
By default, EWAB will locate all HTML, CSS, JS, JSON and SVG files and minify them. It will not preserve comments.

If you don't want EWAB to minify your files, you can change it here:
```js
{
  files: {
    minify: false,
  },
}
```

EWAB will also create source files and add them to your project. If you don't like that, you can change it here:
```js
{
  files: {
    addSourceMaps: false,
  },
}
```

### Serviceworker
EWAB won't add a serviceworker by default because it requires a bit of manual setup.

Go to the [serviceworker configuration guide](./docs/serviceworker.md).

---
<p style="opacity:.8;font-style:italic;text-align:right">This documentation was generated for <a href="https://github.com/atjn/easy-web-app-builder#readme">Easy Web App Builder</a> 1.0.0-beta5</p>
