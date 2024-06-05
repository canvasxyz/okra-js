import { ReadOnlyTransaction, ReadWriteTransaction, Store } from "@canvas-js/bptree-wasm"
import { Awaitable, Metadata, Tree, KeyValueStore } from "@canvas-js/okra"

// The purpose of `wrapXTransaction` is to prevent the developer from calling `commit`
// or `drop` on the transaction directly. This is because the transaction should only
// be de-allocated once. It also wraps the result of `entries_range` so that it conforms
// to the Iterable protocol.

function wrapReadOnlyTransaction(txn: ReadOnlyTransaction) {
	return {
		get: txn.get,
		entries_range: (start: Uint8Array, end: Uint8Array) => {
			return {
				[Symbol.iterator]: txn.entries_range(start, end),
			}
		},
	}
}

function wrapReadWriteTransaction(txn: ReadWriteTransaction) {
	return {
		get: txn.get,
		entries_range: (start: Uint8Array, end: Uint8Array) => {
			return {
				[Symbol.iterator]: txn.entries_range(start, end),
			}
		},
		set: txn.set,
		delete: txn.delete,
	}
}

export class WasmStore extends KeyValueStore {
	public readonly db = new Store()

	async read(callback: (txn: ReturnType<typeof wrapReadOnlyTransaction>) => Awaitable<void>) {
		const txn = this.db.read()
		try {
			await callback(wrapReadOnlyTransaction(txn))
		} finally {
			// always drop the transaction
			txn.drop()
		}
	}

	async write(callback: (txn: ReturnType<typeof wrapReadWriteTransaction>) => Awaitable<void>) {
		const txn = this.db.write()
		try {
			await callback(wrapReadWriteTransaction(txn))
			// commit the transaction if it succeeds
			txn.commit()
		} catch (e) {
			// drop the transaction if it fails
			txn.drop()
		}
	}
}

export class WasmTree extends Tree {
	public static async open(options: Partial<Metadata> = {}) {
		return new WasmTree(new WasmStore(), options)
	}

	public constructor(public readonly store: WasmStore = new WasmStore(), options: Partial<Metadata> = {}) {
		super(store, options)
	}
}
