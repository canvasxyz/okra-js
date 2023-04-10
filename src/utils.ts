import { blake3 } from "@noble/hashes/blake3"
import { bytesToHex as hex } from "@noble/hashes/utils"

import { Key, Node } from "./types.js"
import { K, Q } from "./constants.js"

export type Entry = [key: Uint8Array, value: Uint8Array]

export const encodingOptions = { keyEncoding: "view", valueEncoding: "view" }

export const getLeafAnchorHash = (options: { K?: number }) => blake3(new Uint8Array([]), { dkLen: options.K ?? K })

const C = 1n << 32n

export function isSplit(hash: Uint8Array, options: { Q?: number } = {}): boolean {
	const q = options.Q ?? Q
	const limit = Number(C / BigInt(q))
	const view = new DataView(hash.buffer, hash.byteOffset, 4)
	return view.getUint32(0) < limit
}

export function entryToNode([entryKey, entryValue]: Entry, options: { K?: number } = {}): Node {
	const k = options.K ?? K
	if (entryKey.length === 0 || entryValue.length < k) {
		console.error([hex(entryKey), hex(entryValue)])
		throw new Error("invalid entry")
	}

	const level = entryKey[0]
	const key = parseNodeKey(entryKey)
	const hash = entryValue.slice(0, k)

	if (level > 0 || key === null) {
		return { level, key, hash }
	} else {
		return { level, key, hash, value: parseNodeValue(entryValue) }
	}
}

export const parseNodeKey = (entryKey: Uint8Array) => (entryKey.length > 1 ? entryKey.slice(1) : null)

export const parseNodeValue = (entryValue: Uint8Array, options: { K?: number } = {}) => entryValue.slice(options.K ?? K)

export function nodeToEntry(node: Node, options: { K?: number } = {}): Entry {
	const k = options.K ?? K

	const entryKey = createEntryKey(node.level, node.key)

	if (node.level === 0 && node.key !== null) {
		if (node.value === undefined) {
			throw new Error("invalid node (missing value)")
		}

		const entryValue = new Uint8Array(new ArrayBuffer(k + node.value.length))
		entryValue.set(node.hash)
		entryValue.set(node.value, k)

		return [entryKey, entryValue]
	} else if (node.value !== undefined) {
		throw new Error("invalid node (unexpected value)")
	}

	return [entryKey, node.hash]
}

export function createEntryKey(level: number, key: Key): Uint8Array {
	if (key === null) {
		return new Uint8Array([level])
	} else {
		const entryKey = new Uint8Array(new ArrayBuffer(1 + key.length))
		entryKey[0] = level
		entryKey.set(key, 1)
		return entryKey
	}
}

export function assert(condition: unknown, message?: string): asserts condition {
	if (!condition) {
		throw new Error(message ?? "Internal error")
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

export async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
	const values: T[] = []
	for await (const value of iter) {
		values.push(value)
	}
	return values
}
