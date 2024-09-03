import PQueue from "p-queue"

import {
	Awaitable,
	ReadOnlyTransaction,
	ReadWriteTransaction,
	ReadOnlyTransactionImpl,
	ReadWriteTransactionImpl,
	Tree as ITree,
	Mode,
	Metadata,
	DEFAULT_K,
	DEFAULT_Q,
	KeyValueNodeStore,
	Builder,
} from "@canvas-js/okra"

import * as lmdb from "@canvas-js/okra-lmdb/lmdb"

import { NodeStore } from "./NodeStore.js"

export interface TreeOptions extends lmdb.EnvironmentOptions {
	K?: number
	Q?: number
	mode?: Mode
}

export class Tree implements ITree {
	public static async fromEntries(
		path: string,
		init: TreeOptions,
		entries: AsyncIterable<[Uint8Array, Uint8Array | { hash: Uint8Array }]>,
	): Promise<Tree> {
		const tree = new Tree(path, init)

		const txn = new lmdb.Transaction(tree.env, false, null)
		const store = new NodeStore(tree.metadata, txn, null)
		try {
			store.initialize()

			for (const key of store.keys(
				{ key: KeyValueNodeStore.anchorLeafKey, inclusive: false },
				{ key: KeyValueNodeStore.metadataKey, inclusive: false },
			)) {
				store.delete(key)
			}

			await Builder.fromEntriesAsync(store, entries)

			txn.commit()
		} catch (err) {
			txn.abort()
		}

		return tree
	}

	public readonly metadata: Metadata
	public readonly env: lmdb.Environment

	#open = true
	#queue = new PQueue({ concurrency: 1 })

	constructor(
		public readonly path: string,
		init: TreeOptions = {},
	) {
		const { K = DEFAULT_K, Q = DEFAULT_Q, mode = Mode.Store, ...options } = init
		this.metadata = { K, Q, mode }
		this.env = new lmdb.Environment(path, options)

		const txn = new lmdb.Transaction(this.env, false, null)
		const store = new NodeStore(this.metadata, txn, null)
		try {
			store.initialize()
			txn.commit()
		} catch (err) {
			txn.abort()
		}
	}

	public async close() {
		this.#queue.clear()
		await this.#queue.onIdle()
		if (this.#open) {
			this.env.close()
			this.#open = false
		}
	}

	public async clear() {
		await this.#queue.add(async () => {
			const txn = new lmdb.Transaction(this.env, false, null)
			const store = new NodeStore(this.metadata, txn, null)

			try {
				for (const key of store.keys(
					{ key: KeyValueNodeStore.anchorLeafKey, inclusive: false },
					{ key: KeyValueNodeStore.metadataKey, inclusive: false },
				)) {
					store.delete(key)
				}

				txn.commit()
			} catch (err) {
				txn.abort()
				throw err
			}
		})
	}

	public async build() {}

	public async resize(mapSize: number) {
		await this.#queue.add(() => this.env.resize(mapSize))
	}

	public async read<T>(callback: (txn: ReadOnlyTransaction) => Awaitable<T>): Promise<T> {
		const txn = new lmdb.Transaction(this.env, true, null)
		const store = new NodeStore(this.metadata, txn, null)

		try {
			return await callback(new ReadOnlyTransactionImpl(store))
		} finally {
			txn.abort()
		}
	}

	public async write<T>(callback: (txn: ReadWriteTransaction) => Awaitable<T>): Promise<T> {
	  let success = false
		let result: T | null = null
		await this.#queue.add(async () => {
			const txn = new lmdb.Transaction(this.env, false, null)
			const store = new NodeStore(this.metadata, txn, null)

			try {
				result = await callback(new ReadWriteTransactionImpl(store))
				txn.commit()
				success = true
			} catch (err) {
				txn.abort()
				throw err
			}
		})

		if (!success) {
		  throw new Error("failed to commit transaction")
		}

		return result!
	}
}
