```js
{
  alias: String: "ewab"
  configName: String: "ewabconfig"
  interface: String: "modern" ("modern", "minimal", "basic", "debug")
  useCache: Boolean: true
  inputPath: String
  outputPath: String
  manifestPath: String
  icons: {
    add: Boolean: true
    source: String
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
    experience: String ("online", "app")
    debug: Boolean: false
    networkTimeoutSeconds: Number: 4
    displayUpdateButton: Boolean: true
    displayOfflineBanner: Boolean: true
    customRules: [
      Object
    ],
  },
  files: {
    minify: Boolean: true
    addSourceMaps: Boolean: true
    directOptions: Object
  },
  images: {
    minify: Boolean: true
    convert: Boolean: true
    updateReferences: Boolean: true
    keepOriginalFile: Boolean: true
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
  },
  fileExceptions: [
    {
      glob: String
      files: {
        minify: Boolean: true
        addSourceMaps: Boolean: true
        directOptions: Object
      },
      images: {
        minify: Boolean: true
        convert: Boolean: true
        updateReferences: Boolean: true
        keepOriginalFile: Boolean: true
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
      },
    },
  ],
},
```


