_[<- Back to the main page](../README.md)_
# ServiceWorker setup
You can enable/disable the serviceworker module here:
```js
{
  serviceworker: {
    add: Boolean: false
  },
}
```
..but there is a bit of manual setup to ensure that the serviceworker runs properly:

## Resource types
All resources are given a resource type, which defines how they are updated on the client side.

```js
{
  //alter the settings for certain files
  fileExceptions: [
    {
      //glob pattern to match file with
      glob: String
      
      serviceworker: {
        type: String ("static", "online", "core")
      },
    },
  ],
  
}
```

EWAB is able to automatically identify and handle most files correctly, but it is not able to identify files which contain data that should update more frequently than the app itself. For example, if you have a baking recipe app, you can design it to always download new recipes when the user opens it. If you define all recipes in a `json` file, EWAB will identify it as a `core` file, which means any update to it will be bundled as a full app update. The user will not receive the new recipes before they update their app. You can manually label your file as a "dynamic" or "online" file, allowing it to update much more often than the rest of the app.

### `core`
These are the core parts of your site. Every time you update one of these, a new "version" of your app is released, and all old apps will download the new complete set of core files and start using them at the same time.

By default, files with the extensions `html`, `htm`, `css`, `js`, `mjs`, `cjs`, `json`, `svg` are given this label.

### `static`
These resources aren't strictly necessary for a functioning app, but when they are downloaded, they might as well get saved for a little while in case they are accessed again.

By default, all images are given this label.

### `dynamic`
These resources update fairly often, so while it is okay to use a cached version of them, it should be updated for the next load.

By default, nothing is given this label.

### `online`
These resources are so time sensitive, that it is better to wait for a fresh copy from the server, than to use something from the cache.

By default, nothing is given this label.



# Full API
The complete global API looks like this:
```js
{
  serviceworker: {
    add: Boolean: false
    clean: Boolean: false
    debug: Boolean: false
    networkTimeoutSeconds: Number: 4
    displayUpdateDialog: Boolean: true
    instantUpdateWindowSeconds: Number: 2
    periodicUpdateCheckHours: Number: 1
    customRules: [
      Object
    ],
  },
}
```
The complete local file API looks like this:
```js
{
  //alter the settings for certain files
  fileExceptions: [
    {
      //glob pattern to match file with
      glob: String
      
      serviceworker: {
        type: String ("static", "online", "core")
      },
    },
  ],
  
}
```

[See API for the entire project](./config.md).


---
<p style="opacity:.8;font-style:italic;text-align:right">This documentation was generated for <a href="https://github.com/atjn/easy-web-app-builder#readme">Easy Web App Builder</a> 1.0.0-beta3</p>
