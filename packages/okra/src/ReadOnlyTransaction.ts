import { Node, Mode, ReadOnlyTransaction, Key, Bound, Entry } from "./interface.js"
import { NodeStore } from "./NodeStore.js"
import { debug } from "./format.js"
import { assert, equalKeys } from "./utils.js"

export class ReadOnlyTransactionImpl implements ReadOnlyTransaction {
	protected readonly log = debug("okra:tree")
	protected readonly limit: number

	public readonly K: number
	public readonly Q: number

	constructor(protected readonly store: NodeStore) {
		this.K = store.metadata.K
		this.Q = store.metadata.Q
		this.limit = Number((1n << 32n) / BigInt(this.Q))
	}

	public has(key: Uint8Array): boolean {
		const leaf = this.getNode(0, key)
		return leaf !== null
	}

	public get(key: Uint8Array): Uint8Array | null {
		assert(this.store.metadata.mode === Mode.Store, "get() can only be called on Store mode databases")

		const leaf = this.getNode(0, key)
		if (leaf === null) {
			return null
		}

		assert(leaf.value !== undefined, `expected leaf.value !== undefined`)
		return leaf.value
	}

	public getRoot(): Node {
		return this.store.getRoot()
	}

	public getNode(level: number, key: Key): Node | null {
		return this.store.getNode(level, key)
	}

	/**
	 * Get the children of a node in the merkle tree, identified by level and key.
	 */
	public getChildren(level: number, key: Key): Node[] {
		if (level === 0) {
			throw new RangeError("Cannot get children of a leaf node")
		}

		const children: Node[] = []
		for (const node of this.store.nodes(level - 1, { key, inclusive: true })) {
			if (this.isBoundary(node) && !equalKeys(node.key, key)) {
				break
			} else {
				children.push(node)
			}
		}

		return children
	}

	public *nodes(
		level: number,
		lowerBound?: Bound<Key> | null,
		upperBound?: Bound<Key> | null,
		options?: { reverse?: boolean },
	): IterableIterator<Node> {
		yield* this.store.nodes(level, lowerBound, upperBound, options)
	}

	public *keys(
		lowerBound: Bound<Uint8Array> | null = null,
		upperBound: Bound<Uint8Array> | null = null,
		options: { reverse?: boolean } = {},
	): IterableIterator<Uint8Array> {
		for (const node of this.nodes(0, lowerBound ?? { key: null, inclusive: false }, upperBound, options)) {
			assert(node.key !== null)
			yield node.key
		}
	}

	public *entries(
		lowerBound: Bound<Uint8Array> | null = null,
		upperBound: Bound<Uint8Array> | null = null,
		options: { reverse?: boolean } = {},
	): IterableIterator<Entry> {
		assert(this.store.metadata.mode === Mode.Store, ".entries() requires Mode.Store")
		for (const node of this.nodes(0, lowerBound ?? { key: null, inclusive: false }, upperBound, options)) {
			assert(node.key !== null)
			assert(node.value !== undefined)
			yield [node.key, node.value]
		}
	}

	protected isBoundary(node: Node): boolean {
		const view = new DataView(node.hash.buffer, node.hash.byteOffset, 4)
		return view.getUint32(0) < this.limit
	}

	// /**
	//  * Pretty-print the tree structure to a utf-8 stream.
	//  * Consume with a TextDecoderStream or iterable sink.
	//  */
	// public *print(options: { hashSize?: number } = {}): IterableIterator<Uint8Array> {
	// 	const hashSize = options.hashSize ?? 4
	// 	const slot = "  ".repeat(hashSize)
	// 	const hash = ({ hash }: Node) => toString(hash.subarray(0, hashSize), "hex")
	// 	const encoder = new TextEncoder()

	// 	const tree = this
	// 	function* printTree(prefix: string, bullet: string, node: Node): IterableIterator<Uint8Array> {
	// 		yield encoder.encode(bullet)
	// 		yield encoder.encode(` ${hash(node)} `)
	// 		if (node.level === 0) {
	// 			if (node.key === null) {
	// 				yield encoder.encode(`│\n`)
	// 			} else {
	// 				yield encoder.encode(`│ ${toString(node.key, "hex")}\n`)
	// 			}
	// 		} else {
	// 			const children = tree.getChildren(node.level, node.key)
	// 			for (const [i, child] of children.entries()) {
	// 				if (i > 0) {
	// 					yield encoder.encode(prefix)
	// 				}

	// 				if (i < children.length - 1) {
	// 					yield* printTree(prefix + "│   " + slot, i === 0 ? "┬─" : "├─", child)
	// 				} else {
	// 					yield* printTree(prefix + "    " + slot, i === 0 ? "──" : "└─", child)
	// 				}
	// 			}
	// 		}
	// 	}

	// 	const root = this.store.getRoot()
	// 	yield* printTree("    " + slot, "──", root)
	// }
}
