import { bytesToHex as hex } from "@noble/hashes/utils"

import { Node } from "./nodes.js"
import { Tree } from "./tree.js"

const hashSize = 4
const slot = "  ".repeat(hashSize)
const hash = ({ hash }: Node) => hex(hash.subarray(0, hashSize))

export async function* print<TFormat, KDefault, VDefault>(
	tree: Tree<TFormat, KDefault, VDefault>
): AsyncIterableIterator<Uint8Array> {
	const encoder = new TextEncoder()
	async function* printTree(prefix: string, bullet: string, node: Node): AsyncIterableIterator<Uint8Array> {
		yield encoder.encode(bullet)
		yield encoder.encode(` ${hash(node)} `)
		if (node.level === 0) {
			if (node.key === null) {
				yield encoder.encode(`|\n`)
			} else {
				yield encoder.encode(`| ${hex(node.key)}\n`)
			}
		} else {
			const children = await tree.getChildren(node.level, node.key)
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

	const root = await tree.getRoot()
	yield* printTree("    " + slot, "──", root)
}
