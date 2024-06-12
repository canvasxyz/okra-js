import { compare } from "uint8arrays"

import createTree, { Tree } from "functional-red-black-tree"

import { Metadata, KeyValueNodeStore, Bound, Entry } from "@canvas-js/okra"

export class NodeStore extends KeyValueNodeStore {
	public snapshot: Tree<Uint8Array, Uint8Array>
	constructor(
		public readonly metadata: Metadata,
		snapshot: Tree<Uint8Array, Uint8Array> = createTree(compare),
	) {
		super()
		this.snapshot = snapshot
	}

	protected get(key: Uint8Array): Uint8Array | null {
		return this.snapshot.get(key) ?? null
	}

	protected set(key: Uint8Array, value: Uint8Array): void {
		if (this.snapshot.get(key) !== undefined) {
			this.snapshot = this.snapshot.remove(key)
		}

		this.snapshot = this.snapshot.insert(key, value)
	}

	protected delete(key: Uint8Array): void {
		this.snapshot = this.snapshot.remove(key)
	}

	protected *keys(
		lowerBound: Bound<Uint8Array> | null = null,
		upperBound: Bound<Uint8Array> | null = null,
		{ reverse = false }: { reverse?: boolean } = {},
	): IterableIterator<Uint8Array> {
		for (const [key] of this.entries(lowerBound, upperBound, { reverse })) {
			yield key
		}
	}

	protected *entries(
		lowerBound: Bound<Uint8Array> | null = null,
		upperBound: Bound<Uint8Array> | null = null,
		{ reverse = false }: { reverse?: boolean } = {},
	): IterableIterator<Entry> {
		if (reverse === false) {
			const iter =
				lowerBound === null
					? this.snapshot.begin
					: lowerBound.inclusive
						? this.snapshot.ge(lowerBound.key)
						: this.snapshot.gt(lowerBound.key)

			while (iter.valid && NodeStore.isBelow(iter.key, upperBound)) {
				yield [iter.key, iter.value]
				iter.next()
			}
		} else {
			const iter =
				upperBound === null
					? this.snapshot.end
					: upperBound.inclusive
						? this.snapshot.le(upperBound.key)
						: this.snapshot.lt(upperBound.key)

			while (iter.valid && NodeStore.isAbove(iter.key, lowerBound)) {
				yield [iter.key, iter.value]
				iter.prev()
			}
		}
	}

	private static isAbove(key: Uint8Array, lowerBound: Bound<Uint8Array> | null) {
		if (lowerBound === null) {
			return true
		} else if (lowerBound.inclusive) {
			return compare(key, lowerBound.key) >= 0
		} else {
			return compare(key, lowerBound.key) === 1
		}
	}

	private static isBelow(key: Uint8Array, upperBound: Bound<Uint8Array> | null) {
		if (upperBound === null) {
			return true
		} else if (upperBound.inclusive) {
			return compare(key, upperBound.key) <= 0
		} else {
			return compare(key, upperBound.key) === -1
		}
	}
}
