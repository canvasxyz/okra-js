import type { KeyValueStore, KeyRange } from "@canvas-js/okra"
import type { AbstractIteratorOptions } from "abstract-level"

import { MemoryLevel } from "memory-level"

export class MemoryStore implements KeyValueStore {
	public readonly db = new MemoryLevel<Uint8Array, Uint8Array>({ keyEncoding: "view", valueEncoding: "view" })

	public async close() {
		await this.db.close()
	}

	async get(key: Uint8Array): Promise<Uint8Array | null> {
		try {
			return await this.db.get(key)
		} catch (err: any) {
			// TODO: switch to `err instanceof ModuleError` when memory-level fixes their shit
			if (err.code === "LEVEL_NOT_FOUND") {
				return null
			} else {
				throw err
			}
		}
	}

	async set(key: Uint8Array, value: Uint8Array) {
		await this.db.put(key, value)
	}

	async delete(key: Uint8Array) {
		await this.db.del(key)
	}

	async *entries(range: KeyRange = {}): AsyncIterableIterator<[Uint8Array, Uint8Array]> {
		const iterOptions: AbstractIteratorOptions<Uint8Array, Uint8Array> = { reverse: range.reverse ?? false }

		if (range.lowerBound) {
			if (range.lowerBound.inclusive) {
				iterOptions.gte = range.lowerBound.key
			} else {
				iterOptions.gt = range.lowerBound.key
			}
		}

		if (range.upperBound) {
			if (range.upperBound.inclusive) {
				iterOptions.lte = range.upperBound.key
			} else {
				iterOptions.lt = range.upperBound.key
			}
		}

		yield* this.db.iterator<Uint8Array, Uint8Array>(iterOptions)
	}
}
