import { bytesToHex } from "@noble/hashes/utils"

import { K } from "./utils.js"

export type Key = Uint8Array | null

export type Node = {
	level: number
	key: Key
	hash: Uint8Array
	value?: Uint8Array
}

export type Entry = [key: Uint8Array, value: Uint8Array]

export function entryToNode([entryKey, entryValue]: Entry): Node {
	if (entryKey.length === 0 || entryValue.length < K) {
		console.error([bytesToHex(entryKey), bytesToHex(entryValue)])
		throw new Error("invalid entry")
	}

	const level = entryKey[0]
	const key = parseNodeKey(entryKey)
	const hash = parseNodeHash(entryValue)

	if (level > 0 || key === null) {
		return { level, key, hash }
	} else {
		return { level, key, hash, value: parseNodeValue(entryValue) }
	}
}

export const parseNodeKey = (entryKey: Uint8Array) => (entryKey.length > 1 ? entryKey.slice(1) : null)

export const parseNodeHash = (entryValue: Uint8Array) => entryValue.slice(0, K)

export const parseNodeValue = (entryValue: Uint8Array) => entryValue.slice(K)

export function nodeToEntry(node: Node): Entry {
	const entryKey = createEntryKey(node.level, node.key)

	if (node.level === 0 && node.key !== null) {
		if (node.value === undefined) {
			throw new Error("invalid node")
		}

		const entryValue = new Uint8Array(new ArrayBuffer(K + node.value.length))
		entryValue.set(node.hash)
		entryValue.set(node.value, K)
		return [entryKey, entryValue]
	} else {
		return [entryKey, node.hash]
	}
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
