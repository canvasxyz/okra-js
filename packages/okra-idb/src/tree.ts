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
		await this.store.write(() => super.set(key, value))
	}

	public async delete(key: Uint8Array): Promise<void> {
		await this.store.write(() => super.delete(key))
	}

	public async getRoot(): Promise<Node> {
		return this.store.read(() => super.getRoot())
	}

	public getNode(level: number, key: Key): Promise<Node | null> {
		return this.store.read(() => super.getNode(level, key))
	}

	public getChildren(level: number, key: Key): Promise<Node[]> {
		return this.store.read(() => super.getChildren(level, key))
	}

	// This one is tricky :/
	public async *nodes(
		level: number,
		lowerBound: Bound<Key> | null = null,
		upperBound: Bound<Key> | null = null,
		{ reverse = false }: { reverse?: boolean | undefined } = {}
	): AsyncGenerator<Node> {}

	public async *entries(
		lowerBound: Bound<Uint8Array> | null = null,
		upperBound: Bound<Uint8Array> | null = null,
		{ reverse = false }: { reverse?: boolean | undefined } = {}
	): AsyncGenerator<[Uint8Array, Uint8Array]> {
		for await (const leaf of this.nodes(0, lowerBound ?? { key: null, inclusive: false }, upperBound, { reverse })) {
			assert(leaf.key !== null && leaf.value !== undefined)
			yield [leaf.key, leaf.value]
		}
	}
}
