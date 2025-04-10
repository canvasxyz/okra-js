import { equals } from "uint8arrays"

import { KeyValueNodeStore, Bound, Entry, Metadata, compareKeys } from "@canvas-js/okra"

import * as lmdb from "@canvas-js/okra-lmdb/lmdb"

export class NodeStore extends KeyValueNodeStore {
	readonly #db: lmdb.Database
	constructor(
		public readonly metadata: Metadata,
		txn: lmdb.Transaction,
		name: string | null,
	) {
		super()
		this.#db = new lmdb.Database(txn, name)
	}

	public get(key: Uint8Array): Uint8Array | null {
		return this.#db.get(key)
	}

	public set(key: Uint8Array, value: Uint8Array): void {
		this.#db.set(key, value)
	}

	public delete(key: Uint8Array): void {
		this.#db.delete(key)
	}

	public *keys(
		lowerBound: Bound<Uint8Array> | null = null,
		upperBound: Bound<Uint8Array> | null = null,
		options: { reverse?: boolean | undefined } = {},
	): IterableIterator<Uint8Array> {
		const { reverse = false } = options

		using cursor = new lmdb.Cursor(this.#db)
		if (reverse) {
			yield* rangeReverse(cursor, lowerBound, upperBound)
		} else {
			yield* range(cursor, lowerBound, upperBound)
		}
	}

	public *entries(
		lowerBound: Bound<Uint8Array> | null = null,
		upperBound: Bound<Uint8Array> | null = null,
		options: { reverse?: boolean | undefined } = {},
	): IterableIterator<Entry> {
		const { reverse = false } = options

		using cursor = new lmdb.Cursor(this.#db)
		if (reverse) {
			for (const key of rangeReverse(cursor, lowerBound, upperBound)) {
				const value = cursor.getCurrentValue()
				yield [key, value]
			}
		} else {
			for (const key of range(cursor, lowerBound, upperBound)) {
				const value = cursor.getCurrentValue()
				yield [key, value]
			}
		}
	}
}

function* rangeReverse(
	cursor: lmdb.Cursor,
	lowerBound: Bound<Uint8Array> | null,
	upperBound: Bound<Uint8Array> | null,
): IterableIterator<Uint8Array> {
	for (let key = goToEnd(cursor, upperBound); key !== null; key = cursor.goToPrevious()) {
		if (lowerBound !== null) {
			const order = compareKeys(key, lowerBound.key)
			if (order === -1) {
				return
			} else if (order === 0 && lowerBound.inclusive === false) {
				return
			}
		}

		yield key
	}
}

function* range(
	cursor: lmdb.Cursor,
	lowerBound: Bound<Uint8Array> | null,
	upperBound: Bound<Uint8Array> | null,
): IterableIterator<Uint8Array> {
	for (let key = goToStart(cursor, lowerBound); key !== null; key = cursor.goToNext()) {
		if (upperBound !== null) {
			const order = compareKeys(upperBound.key, key)
			if (order === -1) {
				return
			} else if (order === 0 && upperBound.inclusive === false) {
				return
			}
		}

		yield key
	}
}

function goToStart(cursor: lmdb.Cursor, lowerBound: Bound<Uint8Array> | null): Uint8Array | null {
	if (lowerBound === null) {
		return cursor.goToFirst()
	}

	const start = cursor.seek(lowerBound.key)
	if (lowerBound.inclusive === false) {
		if (start !== null && equals(start, lowerBound.key)) {
			return cursor.goToNext()
		}
	}

	return start
}

function goToEnd(cursor: lmdb.Cursor, upperBound: Bound<Uint8Array> | null): Uint8Array | null {
	if (upperBound === null) {
		return cursor.goToLast()
	}

	const end = cursor.seek(upperBound.key)
	if (upperBound.inclusive) {
		if (end !== null && equals(end, upperBound.key)) {
			return end
		} else {
			return cursor.goToPrevious()
		}
	} else {
		return cursor.goToPrevious()
	}
}
