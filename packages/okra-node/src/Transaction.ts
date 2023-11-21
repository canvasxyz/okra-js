import { equals } from "uint8arrays"

import { Bound, Entry, lessThan } from "@canvas-js/okra"

import type { DatabaseID, DatabaseName } from "./types.js"
import { Cursor } from "./Cursor.js"
import * as okra from "./okra.js"

export interface TransactionOptions {
	readOnly?: boolean
	parent?: Transaction
	dbi?: DatabaseName | DatabaseID
}

export class Transaction extends okra.Transaction {
	public readonly readOnly: boolean
	public readonly parent: Transaction | null

	#open = true

	constructor(public readonly env: okra.Environment, options: TransactionOptions = {}) {
		const readOnly = options.readOnly ?? false
		const parent = options.parent ?? null
		super(env, readOnly, parent)

		this.readOnly = readOnly
		this.parent = parent
	}

	public abort() {
		if (this.#open) {
			super.abort()
			this.#open = false
		} else {
			throw new Error("Transaction closed")
		}
	}

	public commit() {
		if (this.#open) {
			super.commit()
			this.#open = false
		} else {
			throw new Error("Transaction closed")
		}
	}

	public *keys(
		dbi: DatabaseID,
		lowerBound: Bound<Uint8Array> | null = null,
		upperBound: Bound<Uint8Array> | null = null,
		options: { reverse?: boolean }
	): IterableIterator<Uint8Array> {
		const { reverse = false } = options
		const cursor = new Cursor(this, dbi)
		if (reverse) {
			for (let key = cursor.goToEnd(upperBound); key !== null; key = cursor.goToPrevious()) {
				if (lowerBound !== null) {
					if (lessThan(key, lowerBound.key)) {
						return
					} else if (lowerBound.inclusive === false && equals(lowerBound.key, key)) {
						return
					}
				}

				yield key
			}
		} else {
			for (let key = cursor.goToStart(lowerBound); key !== null; key = cursor.goToNext()) {
				if (upperBound !== null) {
					if (lessThan(upperBound.key, key)) {
						return
					} else if (upperBound.inclusive === false && equals(upperBound.key, key)) {
						return
					}
				}

				yield key
			}
		}
	}

	public *entries(
		dbi: DatabaseID,
		lowerBound: Bound<Uint8Array> | null = null,
		upperBound: Bound<Uint8Array> | null = null,
		options: { reverse?: boolean } = {}
	): IterableIterator<Entry> {
		const { reverse = false } = options
		const cursor = new Cursor(this, dbi)
		if (reverse) {
			for (let key = cursor.goToEnd(upperBound); key !== null; key = cursor.goToPrevious()) {
				if (lowerBound !== null) {
					if (lessThan(key, lowerBound.key)) {
						return
					} else if (lowerBound.inclusive === false && equals(lowerBound.key, key)) {
						return
					}
				}

				const value = cursor.getCurrentValue()
				yield [key, value]
			}
		} else {
			for (let key = cursor.goToStart(lowerBound); key !== null; key = cursor.goToNext()) {
				if (upperBound !== null) {
					if (lessThan(upperBound.key, key)) {
						return
					} else if (upperBound.inclusive === false && equals(upperBound.key, key)) {
						return
					}
				}

				const value = cursor.getCurrentValue()
				yield [key, value]
			}
		}
	}
}
