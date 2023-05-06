import { bytesToHex as hex } from "@noble/hashes/utils"

import { IDBPDatabase, IDBPTransaction } from "idb"

import { Bound, KeyValueStore, assert } from "@canvas-js/okra"

import { debug } from "./format.js"

export class IDBStore implements KeyValueStore {
	private readonly log = debug("okra-idb:store")

	public txn: IDBPTransaction<unknown, [string], IDBTransactionMode> | null = null
	public constructor(private readonly db: IDBPDatabase, private readonly storeName: string) {}

	public async write<T>(callback: () => Promise<T>) {
		this.txn = this.db.transaction(this.storeName, "readwrite")

		try {
			const result = await callback()
			this.txn.commit()
			return result
		} catch (err) {
			console.error(err)
			this.txn.abort()
		} finally {
			this.txn = null
		}
	}

	public async read<T>(callback: () => Promise<T>) {
		this.txn = this.db.transaction(this.storeName, "readonly")
		try {
			return await callback()
		} finally {
			this.txn = null
		}
	}

	async get(key: Uint8Array): Promise<Uint8Array | null> {
		this.log(`get(%h})`, key)

		assert(this.txn !== null, "Internal error: this.txn !== null")
		const store = this.txn.objectStore(this.storeName)

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
		this.log(`set(%h, %h)`, key, value)

		assert(this.txn !== null, "Internal error: this.txn !== null")
		const store = this.txn.objectStore(this.storeName)
		if (this.txn.mode === "readonly" || store.put === undefined) {
			throw new Error("Cannot set in a read-only transaction")
		}

		await store.put(value, key)
	}

	async delete(key: Uint8Array): Promise<void> {
		assert(this.txn !== null, "Internal error: this.txn !== null")
		const store = this.txn.objectStore(this.storeName)

		if (this.txn.mode === "readonly" || store.delete === undefined) {
			throw new Error("Cannot delete in a read-only transaction")
		}

		await store.delete(key)
	}

	async *entries(
		lowerBound: Bound<Uint8Array> | null = null,
		upperBound: Bound<Uint8Array> | null = null,
		{ reverse = false }: { reverse?: boolean } = {}
	): AsyncIterableIterator<[Uint8Array, Uint8Array]> {
		let query: IDBKeyRange | null = null
		if (lowerBound && upperBound) {
			query = IDBKeyRange.bound(lowerBound.key, upperBound.key, !lowerBound.inclusive, !upperBound.inclusive)
		} else if (lowerBound) {
			query = IDBKeyRange.lowerBound(lowerBound.key, !lowerBound.inclusive)
		} else if (upperBound) {
			query = IDBKeyRange.upperBound(upperBound.key, !upperBound.inclusive)
		}

		assert(this.txn !== null, "Internal error: this.txn !== null")
		const store = this.txn.objectStore(this.storeName)
		let cursor = await store.openCursor(query, reverse ? "prevunique" : "nextunique")

		while (cursor !== null) {
			let key: Uint8Array | null = null
			if (cursor.key instanceof Uint8Array) {
				key = cursor.key
			} else if (cursor.key instanceof ArrayBuffer) {
				key = new Uint8Array(cursor.key)
			} else {
				throw new Error("Unexpected cursor key type")
			}

			if (cursor.value instanceof Uint8Array) {
				yield [key, cursor.value]
			} else {
				throw new Error("Unexpected cursor value type")
			}

			cursor = await cursor.continue()
		}
	}
}
