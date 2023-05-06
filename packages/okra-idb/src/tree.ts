import { IDBPDatabase } from "idb"

import { Tree, Metadata, Node, Key, assert, Bound } from "@canvas-js/okra"

import { IDBStore } from "./store.js"

export class IDBTree extends Tree {
	public static async open(db: IDBPDatabase, storeName: string, options: Partial<Metadata> = {}) {
		const store = new IDBStore(db, storeName)
		const tree = new IDBTree(store, options)
		await store.write(() => tree.initialize())
		return tree
	}

	private constructor(public readonly store: IDBStore, options: Partial<Metadata>) {
		super(store, options)
	}

	public async get(key: Uint8Array): Promise<Uint8Array | null> {
		return this.store.read(() => super.get(key))
	}

	public async set(key: Uint8Array, value: Uint8Array): Promise<void> {
		if (this.store.txn === null) {
			await this.store.write(() => super.set(key, value))
		} else {
			await super.set(key, value)
		}
	}

	public async delete(key: Uint8Array): Promise<void> {
		if (this.store.txn === null) {
			await this.store.write(() => super.delete(key))
		} else {
			await super.delete(key)
		}
	}

	public async getRoot(): Promise<Node> {
		if (this.store.txn === null) {
			return this.store.read(() => super.getRoot())
		} else {
			return super.getRoot()
		}
	}

	public getNode(level: number, key: Key): Promise<Node | null> {
		if (this.store.txn === null) {
			return this.store.read(() => super.getNode(level, key))
		} else {
			return super.getNode(level, key)
		}
	}

	public getChildren(level: number, key: Key): Promise<Node[]> {
		if (this.store.txn === null) {
			return this.store.read(() => super.getChildren(level, key))
		} else {
			return super.getChildren(level, key)
		}
	}

	public async *nodes(
		level: number,
		lowerBound: Bound<Key> | null = null,
		upperBound: Bound<Key> | null = null,
		{ reverse = false }: { reverse?: boolean | undefined } = {}
	): AsyncGenerator<Node, void, undefined> {
		if (this.store.txn === null) {
			// TODO: fix this
			throw new Error("can only call nodes() from within a managed transaction")
		} else {
			yield* super.nodes(level, lowerBound, upperBound, { reverse })
		}
	}

	public async *entries(
		lowerBound: Bound<Uint8Array> | null = null,
		upperBound: Bound<Uint8Array> | null = null,
		{ reverse = false }: { reverse?: boolean | undefined } = {}
	): AsyncGenerator<[Uint8Array, Uint8Array]> {
		if (this.store.txn === null) {
			// TODO: fix this
			throw new Error("can only call entries() from within a managed transaction")
		} else {
			for await (const leaf of this.nodes(0, lowerBound ?? { key: null, inclusive: false }, upperBound, { reverse })) {
				assert(leaf.key !== null && leaf.value !== undefined, "invalid leaf entry")
				yield [leaf.key, leaf.value]
			}
		}
	}
}
