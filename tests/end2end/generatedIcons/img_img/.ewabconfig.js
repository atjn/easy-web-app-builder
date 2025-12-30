export default {
	interface: "debug",
	files: {
		minify: false,
	},
	icons: {
		add: true,
		source: {
			main: "icon.png",
			backgroundImage: "icon_background.jpg",
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
