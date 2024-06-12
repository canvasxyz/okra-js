import PQueue from "p-queue"
import { compare } from "uint8arrays"

import createTree from "functional-red-black-tree"

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

import { NodeStore } from "./NodeStore.js"

export class Tree implements ITree {
	public readonly metadata: Metadata

	#queue = new PQueue({ concurrency: 1 })
	#tree = createTree<Uint8Array, Uint8Array>(compare)

	constructor({ K = DEFAULT_K, Q = DEFAULT_Q, mode = Mode.Store }: Partial<Metadata> = {}) {
		this.metadata = { K, Q, mode }

		const store = new NodeStore(this.metadata, this.#tree)
		store.initialize()
		this.#tree = store.snapshot
	}

	public async read<T>(callback: (txn: ReadOnlyTransaction) => Awaitable<T>): Promise<T> {
		const store = new NodeStore(this.metadata, this.#tree)
		return await callback(new ReadOnlyTransactionImpl(store))
	}

	public async write<T>(callback: (txn: ReadWriteTransaction) => Awaitable<T>): Promise<T> {
		let result: T | undefined = undefined

		await this.#queue.add(async () => {
			const store = new NodeStore(this.metadata, this.#tree)
			result = await callback(new ReadWriteTransactionImpl(store))
			this.#tree = store.snapshot
		})

		return result!
	}
}
