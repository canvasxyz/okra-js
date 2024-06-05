import { equals, compare } from "uint8arrays"

import type { Key, Node } from "./interface.js"

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

export function assert(condition: unknown, message?: string, ...args: any[]): asserts condition {
	if (!condition) {
		if (args && args.length > 0) {
			console.error(...args)
		}

		throw new Error(message ?? "Internal error")
	}
}

export function lessThan(a: Key, b: Key): boolean {
	if (a === null || b === null) {
		return b !== null
	} else {
		return compare(a, b) === -1
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

export async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
	const values: T[] = []
	for await (const value of iter) {
		values.push(value)
	}
	return values
}
