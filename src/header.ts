import { Entry, equalArrays } from "./utils.js"
import { K, Q, OKRA_VERSION, HEADER_KEY } from "./constants.js"

export const isHeaderEntry = ([key]: Entry) => equalArrays(key, HEADER_KEY)

export function getHeader(options: { K?: number; Q?: number } = {}): Uint8Array {
	const k = options.K ?? K
	const q = options.Q ?? Q
	const headerBuffer = new ArrayBuffer(4 + 1 + 1 + 4)
	const header = new Uint8Array(headerBuffer)
	new TextEncoder().encodeInto("okra", header)

	const headerView = new DataView(headerBuffer)
	headerView.setUint8(4, OKRA_VERSION)
	headerView.setUint8(5, k)
	headerView.setUint32(6, q)

	return header
}
