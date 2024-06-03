import { equals } from "uint8arrays"

import type { Key, Node } from "./interface.js"

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
