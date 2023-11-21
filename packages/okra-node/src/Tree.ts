import { Bound, Entry, Key, Node, assert } from "@canvas-js/okra"

import type { DatabaseID, Awaitable, DatabaseName } from "./types.js"
import * as okra from "./okra.js"
import { Transaction } from "./Transaction.js"

export class Tree extends okra.Tree {
	public static async open<T>(
		txn: Transaction,
		dbi: DatabaseID | DatabaseName,
		callback: (tree: Tree) => Awaitable<T>
	) {
		const tree = new Tree(txn, typeof dbi === "number" ? dbi : txn.openDatabase(dbi))
		try {
			return await callback(tree)
		} finally {
			tree.close()
		}
	}

	#open = true

	private constructor(public readonly txn: Transaction, public readonly dbi: DatabaseID) {
		super(txn, dbi)
	}

	public close() {
		if (this.#open) {
			super.close()
			this.#open = false
		} else {
			throw new Error("Tree closed")
		}
	}

	public async *entries(
		lowerBound: Bound<Uint8Array> | null = null,
		upperBound: Bound<Uint8Array> | null = null,
		options: { reverse?: boolean } = {}
	): AsyncIterableIterator<Entry> {
		for await (const node of this.nodes(0, lowerBound ?? { key: null, inclusive: false }, upperBound, options)) {
			assert(node.key !== null, "expected node.key !== null")
			assert(node.value !== undefined, "expected node.value !== undefined")
			yield [node.key, node.value]
		}
	}

	public async *nodes(
		level: number,
		lowerBound: Bound<Key> | null = null,
		upperBound: Bound<Key> | null = null,
		options: { reverse?: boolean } = {}
	): AsyncIterableIterator<Node> {
		const reverse = options.reverse ?? false
		const iter = new okra.Iterator(this.txn, this.dbi, level, lowerBound, upperBound, reverse)
		try {
			for (let node = iter.next(); node !== null; node = iter.next()) {
				yield node
			}
		} finally {
			iter.close()
		}
	}
}
