# Easy-Web-App-Builder
Easy-Web-App-Builder (EWAB) automates all the boring stuff you need to do when publishing a webapp. It will:

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
npm install --save-dev easy-web-app-builder
```

Now make sure your website files are all in a folder, at the root of your project, called "source".

Build the website by running the following command:
```
easy-web-app-builder
```

EWAB will now start up and spend a minute working on your website. When it is done, it will create a folder called "public" and copy the completed website to that folder.
While running, EWAB will tell you what it is doing, and will sometimes warn you if it has trouble understanding your website. Please read these messages carefully to make sure everything is working smoothly.

## Customizing the process
It is possible to customize much of the work EWAB makes by adding a file called ".ewabconfig.js" to the root of your project. An ewabconfig file could look something like this:
```js
export default {

	output: "build/ewab",

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

In the next few chapters, we'll go through all the possible settings you can set, starting with the basics and slowly getting more and more advanced.

## Basic settings

### `Source` and  `Output`
By default, EWAB expects the website to be in the `source` folder, and when it is done working, it will output the website to the `public` folder. These folders can be overridden like so:
```js
{
  source: "path/to/source/folder/",
  output: "path/to/output/folder/",
}
```

## `index` and `manifest`
By default, EWAB expects the main HTML file and the manifest file to be at the root of the `source` folder, and to be called `index.html` and `manifest.json`. If this is not the case, they can be renamed by defining:
```js
{
  index: "path/to/indexName.html",
  manifest: "newManifestName.json",
}
```

## Icons
By default, EWAB will find your website's favicon, generate it in different sizes, and then add the new copies to the website. If you don't want EWAB to mess with your icons, you can define:
```js
{
  icons: {
    add: false,
  }
}
```

If EWAB is using the wrong image as favicon, you can tell it exactly which icon it should use by defining:
```js
{
  icons: {
    source: "path/to/your/favicon.svg",
  }
}
```

## Images

## Files
By default, EWAB will locate all HTML, CSS, JS, JSON and SVG files and minify them. It will not preserve comments.

If you don't want EWAB to minify your files, you can define:
```js
{
  files: {
    minify: false,
  }
}
```

EWAB will also create source files and add them to your project. If you don't like that, you can defined:
```js
{
  files: {
    addSourceMaps: false,
  }
}
```

## Customizing settings for specific files
Sometimes, turning a feature on or off for 

## Somewhat advanced settings

### Serviceworker
By default, EWAB won't add a serviceworker because it might break your app. You can enable serviceworker create
