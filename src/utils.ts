import { blake3 } from "@noble/hashes/blake3"

import { Key, Node } from "./nodes.js"

export const encodingOptions = { keyEncoding: "view", valueEncoding: "view" }

export const K = 16
export const Q = 32

export const getLeafAnchorHash = (options: { K?: number }) => blake3(new Uint8Array([]), { dkLen: options.K ?? K })

const C = 1n << 32n

export function isSplit(hash: Uint8Array, options: { Q?: number } = {}): boolean {
	const q = options.Q ?? Q
	const limit = Number(C / BigInt(q))
	const view = new DataView(hash.buffer, hash.byteOffset, 4)
	return view.getUint32(0) < limit
}

export function assert(condition: unknown): asserts condition {
	if (!condition) {
		throw new Error("invalid database")
	}
}

export function lessThan(a: Key, b: Key): boolean {
	if (a === null || b === null) {
		return b !== null
	}

	let x = a.length
	let y = b.length

	for (let i = 0, len = Math.min(x, y); i < len; ++i) {
		if (a[i] !== b[i]) {
			x = a[i]
			y = b[i]
			break
		}
	}

	return x < y
}

export const equalArrays = (a: Uint8Array, b: Uint8Array) =>
	a.length === b.length && a.every((byte, i) => byte === b[i])

export function equalKeys(a: Key, b: Key): boolean {
	if (a === null || b === null) {
		return a === null && b === null
	} else {
		return equalArrays(a, b)
	}
}

export const equalNodes = (a: Node, b: Node) =>
	a.level === b.level && equalKeys(a.key, b.key) && equalArrays(a.hash, b.hash)

const size = new ArrayBuffer(4)
const view = new DataView(size)

export function hashEntry(key: Uint8Array, value: Uint8Array, options: { K?: number } = {}): Uint8Array {
	const k = options.K ?? K
	const hash = blake3.create({ dkLen: k })
	view.setUint32(0, key.length)
	hash.update(new Uint8Array(size))
	hash.update(key)
	view.setUint32(0, value.length)
	hash.update(new Uint8Array(size))
	hash.update(value)
	return hash.digest()
}
