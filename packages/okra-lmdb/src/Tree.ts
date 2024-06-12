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
} from "@canvas-js/okra"

import * as lmdb from "@canvas-js/okra-lmdb/lmdb"

import { NodeStore } from "./NodeStore.js"

export interface TreeOptions extends lmdb.EnvironmentOptions {
	K?: number
	Q?: number
	mode?: Mode
}

export class Tree implements ITree {
	public readonly metadata: Metadata
	public readonly env: lmdb.Environment

	#open = true
	#queue = new PQueue({ concurrency: 1 })

	constructor(
		public readonly path: string,
		{ K = DEFAULT_K, Q = DEFAULT_Q, mode = Mode.Store, ...options }: TreeOptions = {},
	) {
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
		} else {
			throw new Error("Environment closed")
		}
	}

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
		let result: T | null = null
		await this.#queue.add(async () => {
			const txn = new lmdb.Transaction(this.env, false, null)
			const store = new NodeStore(this.metadata, txn, null)

			try {
				result = await callback(new ReadWriteTransactionImpl(store))
				txn.commit()
			} catch (err) {
				txn.abort()
				throw err
			}
		})

		return result!
	}
}
