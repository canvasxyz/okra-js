import PQueue from "p-queue"
import { compare } from "uint8arrays"

import createTree from "functional-red-black-tree"

import { Awaitable } from "@canvas-js/utils"
import {
	ReadOnlyTransaction,
	ReadWriteTransaction,
	ReadOnlyTransactionImpl,
	ReadWriteTransactionImpl,
	Tree as ITree,
	Leaf,
	Mode,
	Metadata,
	DEFAULT_K,
	DEFAULT_Q,
	Builder,
} from "@canvas-js/okra"
import { logger } from "@canvas-js/okra/logger"

import { NodeStore } from "./NodeStore.js"

export class Tree implements ITree {
	public static async fromEntries(init: Partial<Metadata>, entries: AsyncIterable<[Uint8Array, Leaf]>): Promise<Tree> {
		const tree = new Tree(init)

		let success = false
		await tree.#queue.add(async () => {
			const store = new NodeStore(tree.metadata, tree.#tree)
			await Builder.fromEntriesAsync(store, entries)
			tree.#tree = store.snapshot
			success = true
		})

		if (!success) {
			throw new Error("failed to commit transaction")
		}

		return tree
	}

	public readonly metadata: Metadata
	private readonly log = logger("okra:tree")

	#queue = new PQueue({ concurrency: 1 })
	#open = true
	#tree = createTree<Uint8Array, Uint8Array>(compare)

	public constructor(init: Partial<Metadata> = {}) {
		const { K = DEFAULT_K, Q = DEFAULT_Q, mode = Mode.Store } = init
		this.metadata = { K, Q, mode }

		const store = new NodeStore(this.metadata, this.#tree)
		store.initialize()
		this.#tree = store.snapshot
	}

	public async close(): Promise<void> {
		this.#open = false
		await this.#queue.onIdle()
		this.#tree = createTree(compare)
	}

	public clear(): void {
		if (this.#open === false) {
			throw new Error("tree closed")
		}

		const store = new NodeStore(this.metadata)
		store.initialize()
		this.#tree = store.snapshot
	}

	public async read<T>(callback: (txn: ReadOnlyTransaction) => Awaitable<T>): Promise<T> {
		if (this.#open === false) {
			throw new Error("tree closed")
		}

		const store = new NodeStore(this.metadata, this.#tree)
		return await callback(new ReadOnlyTransactionImpl(store))
	}

	public async write<T>(callback: (txn: ReadWriteTransaction) => Awaitable<T>): Promise<T> {
		if (this.#open === false) {
			throw new Error("tree closed")
		}

		let success = false
		let result: T | undefined

		await this.#queue.add(async () => {
			const store = new NodeStore(this.metadata, this.#tree)
			result = await callback(new ReadWriteTransactionImpl(store))
			success = true
			this.#tree = store.snapshot
		})

		if (!success) {
			throw new Error("failed to commit transaction")
		}

		return result!
	}
}
