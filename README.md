# Easy-WebApp
Easy-WebApp (EWA) takes all the boring parts of making a website/webapp, and automates them for you. You can feed EWA your website code, and it will:
- Generate icons in all necessary sizes and formats, and link to them in your index and manifest files.
- Generate a serviceworker, allowing your site to run as a standalone app.
- Minify all HTML, CSS and JS files.
- Compress all images.

..and it will do all of this after just a few minutes of setup. If you want, you can spend hours customizing exactly how EWA should operate, but it is designed to automatically adapt to your website and use best practices wherever possible - out of the box!

## How to install and use
EWA is a Node module. If you don't know what that means, you should start by checking out one of the great tutorials online, such as [nodejs.dev](https://nodejs.dev/learn/introduction-to-nodejs).

When you have Node installed, you can install EWA in your project with the following command:
```
npm install --save-dev easy-webapp
```

Now make sure your website files are all in a folder, at the root of your project, called "source".

Build the website by running the following command:
```
easy-webapp
```

EWA will now start up and spend a minute working on your website. When it is done, it will create a folder called "public" and copy the completed website to that folder.
While running, EWA will tell you what it is doing, and will sometimes warn you if it has trouble understanding your website. Please read these messages carefully to make sure everything is working smoothly.

## Customizing the process
It is possible to customize much of the work EWA makes by adding a file called ".ewaconfig.js" to the root of your project. An ewaconfig file could look something like this:
```js
export default {

	output: "build/ewa",

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
By default, EWA expects the website to be in the `source` folder, and when it is done working, it will output the website to the `public` folder. These folders can be overridden like so:
```js
{
  source: "path/to/source/folder/",
  output: "path/to/output/folder/",
}
```

## `index` and `manifest`
By default, EWA expects the main HTML file and the manifest file to be at the root of the `source` folder, and to be called `index.html` and `manifest.json`. If this is not the case, they can be renamed by defining:
```js
{
  index: "path/to/indexName.html",
  manifest: "newManifestName.json",
}
```

## Icons
By default, EWA will find your website's favicon, generate it in different sizes, and then add the new copies to the website. If you don't want EWA to mess with your icons, you can define:
```js
{
  icons: {
    add: false,
  }
}
```

If EWA is using the wrong image as favicon, you can tell it exactly which icon it should use by defining:
```js
{
  icons: {
    source: "path/to/your/favicon.svg",
  }
}
```

## Images

## Files
By default, EWA will locate all HTML, CSS, JS, JSON and SVG files and minify them. It will not preserve comments.

If you don't want EWA to minify your files, you can define:
```js
{
  files: {
    minify: false,
  }
}
```

EWA will also create source files and add them to your project. If you don't like that, you can defined:
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
By default, EWA won't add a serviceworker because it might break your app. You can enable serviceworker create
