import { toString } from "uint8arrays"

import { Node } from "./interface.js"
import { ReadOnlyTransactionImpl } from "./ReadOnlyTransaction.js"

/**
 * Pretty-print the tree structure to a utf-8 stream.
 * Consume with a TextDecoderStream or iterable sink.
 */
export async function* printTree(
	txn: ReadOnlyTransactionImpl,
	options: { hashSize?: number } = {}
): AsyncIterableIterator<Uint8Array> {
	const hashSize = options.hashSize ?? 4
	const slot = "  ".repeat(hashSize)
	const hash = ({ hash }: Node) => toString(hash.subarray(0, hashSize), "hex")
	const encoder = new TextEncoder()

	function* printTree(prefix: string, bullet: string, node: Node): IterableIterator<Uint8Array> {
		yield encoder.encode(bullet)
		yield encoder.encode(` ${hash(node)} `)
		if (node.level === 0) {
			if (node.key === null) {
				yield encoder.encode(`│\n`)
			} else {
				yield encoder.encode(`│ ${toString(node.key, "hex")}\n`)
			}
		} else {
			const children = txn.getChildren(node.level, node.key)
			for (const [i, child] of children.entries()) {
				if (i > 0) {
					yield encoder.encode(prefix)
				}

				if (i < children.length - 1) {
					yield* printTree(prefix + "│   " + slot, i === 0 ? "┬─" : "├─", child)
				} else {
					yield* printTree(prefix + "    " + slot, i === 0 ? "──" : "└─", child)
				}
			}
		}
	}

	const root = txn.getRoot()
	yield* printTree("    " + slot, "──", root)
}
