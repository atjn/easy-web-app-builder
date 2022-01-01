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
..but before the serviceworker generator will work, you must set a few options:


# Experiences
There are overall two different ways to build the serviceworker, resulting in two different user experiences.

The experience is set here:
```js
{
  serviceworker: {
    experience: String ("online", "app")
  },
}
```

## `online`
This is the lazy method. It is better than having no serviceworker, but please consider spending the extra time to properly set up the serviceworker with the [app experience](#app).

This experience will load everything from the network when the network is available. This means you can expect your website to work exactly as if there was no serviceworker, but it also means that if the network is very slow, the webapp will also load very slowly.

If the user is completely offline, the webapp will load from cache instead of over the internet.

If you choose this behavior, no more setup is needed, although you can still

## `app`
This experience requires some manual setup, but it will make your webapp feel like a true installed app. It will always use cached resources to open instantly, and then has a number of different ways to update the cached resources when they get updated on the server.

### Resource types
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


#### `static`
These resources aren't strictly necessary, but when they are downloaded, they might as well get saved for a little while in case they are accessed again.

By default, all images are given this label.

#### `dynamic`
These resources update fairly often, so while it is okay to use a cached version of them, it should be updated for the next load.

By default, nothing is given this label.

#### `online`
These resources are so time sensitive, that it is better to wait for a fresh copy from the server, than to use something from the cache.

By default, nothing is given this label.

#### `core`
These are the core parts of your site. Every time you update one of these, a new "version" of your app is released, and any existing apps will download the new complete set of core files and start using them at the same time.

By default, files with the extensions `html`, `htm`, `css`, `js`, `mjs`, `cjs`, `json`, `svg` are given this label.

# Full API
The complete global API looks like this:
```js
{
  serviceworker: {
    add: Boolean: false
    clean: Boolean: false
    experience: String ("online", "app")
    debug: Boolean: false
    networkTimeoutSeconds: Number: 4
    displayUpdateButton: Boolean: true
    displayOfflineBanner: Boolean: true
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
<p style="opacity:.8;font-style:italic;text-align:right">This documentation was generated for <a href="https://github.com/atjn/easy-web-app-builder/#readme">Easy Web App Builder</a> 1.0.0-beta1</p>
