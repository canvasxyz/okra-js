import { equals } from "uint8arrays"

import type { Bound } from "@canvas-js/okra"

import type { DatabaseID } from "./types.js"
import * as okra from "./okra.js"

export class Cursor extends okra.Cursor {
	#open = true

	constructor(public readonly txn: okra.Transaction, public readonly dbi: DatabaseID) {
		super(txn, dbi)
	}

	public close() {
		if (this.#open) {
			super.close()
			this.#open = false
		} else {
			throw new Error("Cursor closed")
		}
	}

	public goToStart(lowerBound: Bound<Uint8Array> | null): Uint8Array | null {
		if (lowerBound === null) {
			return this.goToFirst()
		}

		const start = this.seek(lowerBound.key)
		if (lowerBound.inclusive === false) {
			if (start !== null && equals(start, lowerBound.key)) {
				return this.goToNext()
			}
		}

		return start
	}

	public goToEnd(upperBound: Bound<Uint8Array> | null): Uint8Array | null {
		if (upperBound === null) {
			return this.goToLast()
		}

		const end = this.seek(upperBound.key)
		if (upperBound.inclusive) {
			if (end !== null && equals(end, upperBound.key)) {
				return end
			} else {
				return this.goToPrevious()
			}
		} else {
			return this.goToPrevious()
		}
	}
}
