import type { Key, Node } from "./interface.js"

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

export async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
	const values: T[] = []
	for await (const value of iter) {
		values.push(value)
	}
	return values
}
