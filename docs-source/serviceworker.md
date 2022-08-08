# ServiceWorker setup
You can enable/disable the serviceworker module here:
insert[describeConfig serviceworker add]
..but there is a bit of manual setup to ensure that the serviceworker runs properly:

## Resource types
All resources are given a resource type, which defines how they are updated on the client side.

insert[describeConfig fileExceptions 0 serviceworker type]

EWAB is able to automatically identify and handle most files correctly, but it is not able to identify files which contain data that should update more frequently than the app itself. For example, if you have a baking recipe app, you can design it to always download new recipes when the user opens it. If you define all recipes in a `json` file, EWAB will identify it as a `core` file, which means any update to it will be bundled as a full app update. The user will not receive the new recipes before they update their app. You can manually label your file as a "dynamic" or "online" file, allowing it to update much more often than the rest of the app.

### `core`
These are the core parts of your site. Every time you update one of these, a new "version" of your app is released, and all old apps will download the new complete set of core files and start using them at the same time.

By default, files with the extensions insert[getValue coreFileExtensions] are given this label.

### `static`
These resources aren't strictly necessary for a functioning app, but when they are downloaded, they might as well get saved for a little while in case they are accessed again.

By default, all images are given this label.

### `dynamic`
These resources update fairly often, so while it is okay to use a cached version of them, it should be updated for the next load.

By default, nothing is given this label.

### `online`
These resources are so time sensitive, that it is better to wait for a fresh copy from the server, than to use something from the cache.

By default, nothing is given this label.



insert[fullAPI serviceworker]
