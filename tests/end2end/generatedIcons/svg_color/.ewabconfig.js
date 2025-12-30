export default {
	interface: "debug",
	files: {
		minify: false,
	},
	icons: {
		add: true,
		source: {
			main: "icon.svg",
		},
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
