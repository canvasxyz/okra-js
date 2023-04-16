import { IDBPDatabase, IDBPTransaction, IDBPObjectStore } from "idb"

import type { KeyValueStore, KeyRange } from "@canvas-js/okra"

export class IDBNodeStore<Mode extends IDBTransactionMode> implements KeyValueStore {
	private txn: IDBPTransaction<unknown, [string], Mode> | null = null

	constructor(public readonly db: IDBPDatabase, public readonly storeName: string, public readonly mode: Mode) {}

	private handleTxnComplete = () => {
		console.log("transaction completed. setting thix.txn to null again")
		this.txn = null
	}

	private handleTxnAbort = () => {
		console.log("transaction aborted. setting thix.txn to null again")
		this.txn = null
	}

	private openStore(): IDBPObjectStore<unknown, [string], string, Mode> {
		if (this.txn === null) {
			console.log("creating new transaction")
			this.txn = this.db.transaction([this.storeName], this.mode)
			this.txn.addEventListener("complete", this.handleTxnComplete, { once: true })
			this.txn.addEventListener("abort", this.handleTxnAbort, { once: true })
		} else {
			console.log("re-using existing transaction")
		}

		return this.txn.objectStore(this.storeName)
	}

	async get(key: Uint8Array): Promise<Uint8Array | null> {
		const store = this.openStore()
		const value = await store.get(key)
		if (value === undefined) {
			return null
		} else if (value instanceof Uint8Array) {
			return value
		} else {
			throw new Error("Unexpected value type")
		}
	}

	async set(key: Uint8Array, value: Uint8Array): Promise<void> {
		if (this.mode === "readonly") {
			throw new Error("Cannot set in a read-only transaction")
		}

		const store = this.openStore()
		await store.put!(value, key)
	}

	async delete(key: Uint8Array): Promise<void> {
		if (this.mode === "readonly") {
			throw new Error("Cannot delete in a read-only transaction")
		}

		const store = this.openStore()
		await store.delete!(key)
	}

	async *entries({ reverse, upperBound, lowerBound }: KeyRange = {}): AsyncIterableIterator<[Uint8Array, Uint8Array]> {
		let query: IDBKeyRange | null = null
		if (lowerBound && upperBound) {
			query = IDBKeyRange.bound(lowerBound.key, upperBound.key, !lowerBound.inclusive, !upperBound.inclusive)
		} else if (lowerBound) {
			query = IDBKeyRange.lowerBound(lowerBound.key, !lowerBound.inclusive)
		} else if (upperBound) {
			query = IDBKeyRange.lowerBound(upperBound.key, !upperBound.inclusive)
		}

		const store = this.openStore()
		let cursor = await store.openCursor(query, reverse ? "prevunique" : "nextunique")
		while (cursor !== null) {
			if (cursor.key instanceof ArrayBuffer && cursor.value instanceof Uint8Array) {
				yield [new Uint8Array(cursor.key), cursor.value]
			} else {
				console.error(cursor.key, cursor.value)
				throw new Error("Unexpected cursor value")
			}

			cursor = await cursor.continue()
		}
	}
}
