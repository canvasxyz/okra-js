import path from "path"
import { fileURLToPath } from "url"
import WasmPackPlugin from "@wasm-tool/wasm-pack-plugin"
import "webpack"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default {
	entry: "./src/index.ts",
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				use: "ts-loader",
				exclude: /node_modules/,
			},
		],
	},
	output: {
		path: path.resolve(__dirname, "lib"),
		filename: "lib/index.js",
	},
	plugins: [
		new WasmPackPlugin({
			crateDirectory: path.resolve(__dirname, "."),
		}),
	],
	mode: "development",
	experiments: {
		asyncWebAssembly: true,
	},
}
