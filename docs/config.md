_[<- Back to the main page](../README.md)_
# Full configuration file

This is an overview of the entire configuration file. 

```js
{
  //the name EWAB uses when adding elements to the web app
  alias: String: "ewab"
  
  //how progress is logged to the console
  interface: String: "modern" ("modern", "minimal", "basic", "none", "debug")
  
  //if a cache should be used to speed up consecutive runs
  useCache: Boolean: true
  
  //path to the input folder
  inputPath: String
  
  //path to the output folder
  outputPath: String
  
  //path to the manifest, relative to the input folder
  manifestPath: String
  
  icons: {
    //if custom icons should be added to the app
    add: Boolean: true
    
    //path to the icon to generate all other icons from
    source: String
    
    //list of all icons currently in the project
    list: [
      String
    ],
    
    blockList: [
      String
    ],
    mergeMode: {
      index: String: "override" ("override", "combine")
      manifest: String: "override" ("override", "combine")
    },
  },
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
  files: {
    minify: Boolean: true
    module: Boolean
    addSourceMaps: Boolean: true
    directOptions: Object
  },
  images: {
    compress: Boolean: true
    quality: Number: 0.999
    convert: Boolean: true
    updateReferences: Boolean: true
    keepOriginal: Boolean: true
    targetExtension: String: "webp" ("webp", "jxl", "avif", "jpg", "png")
    targetExtensions: [
      String ("webp", "jxl", "avif", "jpg", "png")
    ],
    resize: {
      auto: Boolean: true
      fallbackSize: Number
      maxSize: Number: 2560
      sizes: String
      addSizesTagToImg: Boolean: true
      customSizes: [
        {
          width: Number
          height: Number
        },
      ],
    },
    encoderOptions: {
      webp: Object
      jxl: Object
      avif: Object
      jpg: Object
      png: Object
    },
  },
  //alter the settings for certain files
  fileExceptions: [
    {
      remove: Boolean: false
      //glob pattern to match file with
      glob: String
      
      serviceworker: {
        type: String ("static", "online", "core")
      },
      files: {
        minify: Boolean: true
        module: Boolean
        addSourceMaps: Boolean: true
        directOptions: Object
      },
      images: {
        compress: Boolean: true
        quality: Number: 0.999
        convert: Boolean: true
        updateReferences: Boolean: true
        keepOriginal: Boolean: true
        targetExtension: String: "webp" ("webp", "jxl", "avif", "jpg", "png")
        targetExtensions: [
          String ("webp", "jxl", "avif", "jpg", "png")
        ],
        resize: {
          auto: Boolean: true
          fallbackSize: Number
          maxSize: Number: 2560
          sizes: String
          addSizesTagToImg: Boolean: true
          customSizes: [
            {
              width: Number
              height: Number
            },
          ],
        },
        encoderOptions: {
          webp: Object
          jxl: Object
          avif: Object
          jpg: Object
          png: Object
        },
      },
    },
  ],
  
}
```

---
<p style="opacity:.8;font-style:italic;text-align:right">This documentation was generated for <a href="https://github.com/atjn/easy-web-app-builder#readme">Easy Web App Builder</a> 1.0.0-beta1</p>
