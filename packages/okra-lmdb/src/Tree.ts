import PQueue from "p-queue"

import { Awaitable } from "@canvas-js/utils"
import {
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
import { logger } from "@canvas-js/okra/logger"

import * as lmdb from "@canvas-js/okra-lmdb/lmdb"

import { NodeStore } from "./NodeStore.js"

/**
 * a Leaf can either be a full value (Uint8Array) or just
 * the hash of a leaf node ({ hash: Uint8Array })
 */
export type Leaf = Uint8Array | { hash: Uint8Array }

export interface TreeOptions extends lmdb.EnvironmentOptions {
	K?: number
	Q?: number
	mode?: Mode
}

const defaultEnvironmentOptions = {
	mapSize: 10 * 1024 * 1024,
	maxDbs: 0,
	maxReaders: 126,
	readOnly: false,
	writeMap: false,
}

export class Tree implements ITree {
	public static async fromEntries(
		path: string,
		init: TreeOptions,
		entries: AsyncIterable<[Uint8Array, Leaf]>,
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
			throw err
		}

		return tree
	}

	public readonly metadata: Metadata
	public readonly env: lmdb.Environment

	private readonly log = logger("okra:tree")

	#open = true
	#writes: PQueue
	#reads: PQueue

	constructor(
		public readonly path: string,
		init: TreeOptions = {},
	) {
		const {
			K = DEFAULT_K,
			Q = DEFAULT_Q,
			mode = Mode.Store,
			...options
		} = Object.assign({ ...defaultEnvironmentOptions }, init)
		this.metadata = { K, Q, mode }

		this.#reads = new PQueue({ concurrency: options.maxReaders })
		this.#writes = new PQueue({ concurrency: 1 })

		this.env = new lmdb.Environment(path, options)

		const txn = new lmdb.Transaction(this.env, false, null)
		const store = new NodeStore(this.metadata, txn, null)
		try {
			store.initialize()
			txn.commit()
		} catch (err) {
			txn.abort()
			throw err
		}
	}

	public async close() {
		this.#writes.clear()
		await this.#writes.onIdle()
		if (this.#open) {
			this.env.close()
			this.#open = false
		}
	}

	public async clear() {
		await this.#writes.add(async () => {
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
		await this.#writes.add(() => this.env.resize(mapSize))
	}

	public async read<T>(callback: (txn: ReadOnlyTransaction) => Awaitable<T>): Promise<T> {
		let success = false
		let result: T | null = null

		await this.#reads.add(async () => {
			const txn = new lmdb.Transaction(this.env, true, null)
			const store = new NodeStore(this.metadata, txn, null)

			try {
				result = await callback(new ReadOnlyTransactionImpl(store))
				success = true
			} finally {
				txn.abort()
			}
		})

		if (!success) {
			throw new Error("internal transaction error")
		}

		return result!
	}

	public async write<T>(callback: (txn: ReadWriteTransaction) => Awaitable<T>): Promise<T> {
		let success = false
		let result: T | null = null

		await this.#writes.add(async () => {
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
			throw new Error("internal transaction error")
		}

		return result!
	}
}
