import type { Entry } from "./schema.js"
import { K, Q, equalArrays } from "./utils.js"

export const HEADER_KEY = new Uint8Array([0xff])

export const OKRA_VERSION = 1

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
