export default {
	interface: "debug",
	files: {
		minify: false,
	},
	images: {
		compress: {
			enable: true,
		},
		convert: {
			enable: true,
			targetExtension: "jpg",
			targetExtensions: ["webp", "jpg"],
			size: 400,
			sizes: [700, 200],
		},
	},
};
