import { equals, compare } from "uint8arrays"
import { blake3 } from "@noble/hashes/blake3"
import { assert } from "@canvas-js/utils"

import type { Key, Metadata, Node } from "./interface.js"
import { DEFAULT_METADATA } from "./constants.js"

export function parseEntryKey(entryKey: Uint8Array): [level: number, key: Key] {
	assert(entryKey.byteLength > 0, "empty entry key")

	if (entryKey.byteLength === 1) {
		return [entryKey[0], null]
	} else {
		return [entryKey[0], entryKey.subarray(1)]
	}
}

export function createEntryKey(level: number, key: Key): Uint8Array {
	if (key === null) {
		return new Uint8Array([level])
	}

	const entryKey = new Uint8Array(new ArrayBuffer(1 + key.length))
	entryKey[0] = level
	entryKey.set(key, 1)
	return entryKey
}

export function compareKeys(a: Key, b: Key): number {
	if (a === null) {
		return b === null ? 0 : -1
	} else if (b === null) {
		return 1
	} else {
		return compare(a, b)
	}
}

export function equalKeys(a: Key, b: Key): boolean {
	if (a === null || b === null) {
		return a === null && b === null
	} else {
		return equals(a, b)
	}
}

export const equalNodes = (a: Node, b: Node) => a.level === b.level && equalKeys(a.key, b.key) && equals(a.hash, b.hash)

const sizeBuffer = new ArrayBuffer(4)
const sizeBufferView = new DataView(sizeBuffer)

export function hashEntry(key: Uint8Array, value: Uint8Array, metadata: Metadata = DEFAULT_METADATA): Uint8Array {
	// const hash = sha256.create()
	const hash = blake3.create({ dkLen: metadata.K })

	sizeBufferView.setUint32(0, key.length)
	hash.update(new Uint8Array(sizeBuffer))
	hash.update(key)
	sizeBufferView.setUint32(0, value.length)
	hash.update(new Uint8Array(sizeBuffer))
	hash.update(value)

	// return hash.digest().subarray(0, metadata.K)
	return hash.digest()
}
