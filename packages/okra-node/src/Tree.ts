import * as okra from "./okra.js"

export class Tree extends okra.Tree implements KeyValueStore, Source, Target {
	public readonly dbi: number

	#open = true

	public constructor(public readonly txn: Transaction, options: TreeOptions = {}) {
		const dbi = typeof options.dbi === "number" ? options.dbi : txn.openDatabase(options.dbi ?? null)
		super(txn, dbi)
		this.dbi = dbi
	}

	public close() {
		if (this.#open) {
			super.close()
			this.#open = false
		} else {
			throw new Error("tree closed")
		}
	}

	// KeyValueStore methods

	public get(key: Uint8Array): Uint8Array | null {
		return super.get(key)
	}

	public set(key: Uint8Array, value: Uint8Array) {
		super.set(key, value)
	}

	public delete(key: Uint8Array) {
		super.delete(key)
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

	// Source & Target methods

	public getRoot(): Node {
		return super.getRoot()
	}

	public getNode(level: number, key: Key): Node | null {
		return super.getNode(level, key)
	}

	public getChildren(level: number, key: Key): Node[] {
		return super.getChildren(level, key)
	}

	public async *nodes(
		level: number,
		lowerBound: Bound<Key> | null = null,
		upperBound: Bound<Key> | null = null,
		options: { reverse?: boolean } = {}
	): AsyncIterableIterator<Node> {
		const iter = new Iterator(this.txn, this.dbi, level, lowerBound, upperBound, options)
		try {
			for (let node = iter.next(); node !== null; node = iter.next()) {
				yield node
			}
		} finally {
			iter.close()
		}
	}
}
