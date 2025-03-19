export default {
	files: ["./src/*.test.ts"],
	concurrency: 1,
	typescript: {
		compile: false,
		rewritePaths: {
			"src/": "lib/",
		},
	},
}
