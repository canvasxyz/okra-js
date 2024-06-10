// import { sha256 } from "@noble/hashes/sha256"
import { blake3 } from "@noble/hashes/blake3"
import { compare, equals, toString } from "uint8arrays"

import { Key, Node, Entry, Metadata, Bound, Mode } from "./interface.js"
import { OKRA_VERSION } from "./constants.js"
import { debug } from "./format.js"
import { assert, createEntryKey, parseEntryKey } from "./utils.js"

export interface NodeStore {
	metadata: Metadata

	getRoot(): Node
	getNode(level: number, key: Key): Node | null
	setNode(node: Node): void
	deleteNode(level: number, key: Key): void

	nodes(
		level: number,
		lowerBound?: Bound<Key> | null,
		upperBound?: Bound<Key> | null,
		options?: { reverse?: boolean }
	): IterableIterator<Node>
}

/**
 * KeyValueNodeStore is an internal class that Tree and Builder both extend.
 * Its only purpose is to encapsulate the node-to-entry and
 * entry-to-node conversion methods.
 */
export abstract class KeyValueNodeStore implements NodeStore {
	protected static metadataKey = new Uint8Array([0xff])
	protected static anchorLeafKey = new Uint8Array([0])

	public abstract readonly metadata: Metadata

	protected readonly log = debug("okra:node-store")

	protected abstract get(key: Uint8Array): Uint8Array | null
	protected abstract set(key: Uint8Array, value: Uint8Array): void
	protected abstract delete(key: Uint8Array): void
	protected abstract entries(
		lowerBound?: Bound<Uint8Array> | null,
		upperBound?: Bound<Uint8Array> | null,
		options?: { reverse?: boolean }
	): IterableIterator<Entry>

	public initialize() {
		const metadata = this.getMetadata()
		if (metadata === null) {
			this.setMetadata(this.metadata)
			this.setNode({ level: 0, key: null, hash: this.getLeafAnchorHash() })
		} else {
			assert(metadata.K === this.metadata.K, "metadata.K conflict")
			assert(metadata.Q === this.metadata.Q, "metadata.Q conflict")
			assert(metadata.mode === this.metadata.mode, "metadata.mode conflict")
		}
	}

	private setMetadata(metadata: Metadata) {
		const valueBuffer = new ArrayBuffer(10)
		const valueView = new DataView(valueBuffer, 0, 10)
		const value = new Uint8Array(valueBuffer, 0, 10)
		new TextEncoder().encodeInto("okra", value)
		value[4] = OKRA_VERSION
		value[5] = metadata.K
		valueView.setUint32(6, metadata.Q)
		this.set(KeyValueNodeStore.metadataKey, value)
	}

	private getMetadata(): Metadata | null {
		const metadataValue = this.get(KeyValueNodeStore.metadataKey)
		if (metadataValue === null) {
			return null
		}

		assert(metadataValue.length === 10, "invalid metadata entry")

		const view = new DataView(metadataValue.buffer, metadataValue.byteOffset, metadataValue.byteLength)
		const K = metadataValue[5]
		const Q = view.getUint32(6)
		return { K, Q, mode: Mode.Store }
	}

	/**
	 * Get the root node of the merkle tree. Returns the leaf anchor node if the tree is empty.
	 */
	public getRoot(): Node {
		const upperBound = { key: KeyValueNodeStore.metadataKey, inclusive: false }
		for (const entry of this.entries(null, upperBound, { reverse: true })) {
			const node = this.parseEntry(entry)
			assert(node.key === null, "Internal error: unexpected root node key", node)
			return node
		}

		throw new Error("Internal error: empty node store")
	}

	public getNode(level: number, key: Key): Node | null {
		const entryKey = createEntryKey(level, key)
		const entryValue = this.get(entryKey)
		return entryValue && this.parseEntry([entryKey, entryValue])
	}

	public setNode(node: Node): void {
		assert(node.hash.byteLength === this.metadata.K, "node hash is not K bytes")

		const entryKey = createEntryKey(node.level, node.key)

		if (this.metadata.mode === Mode.Store && node.level === 0 && node.key !== null) {
			assert(node.value !== undefined)
			const entryValue = new Uint8Array(new ArrayBuffer(this.metadata.K + node.value.byteLength))
			entryValue.set(node.hash)
			entryValue.set(node.value, this.metadata.K)
			this.set(entryKey, entryValue)
		} else {
			assert(node.value === undefined)
			this.set(entryKey, node.hash)
		}
	}

	public deleteNode(level: number, key: Key): void {
		const entryKey = createEntryKey(level, key)
		this.delete(entryKey)
	}

	public *nodes(
		level: number,
		lowerBound: Bound<Key> | null = null,
		upperBound: Bound<Key> | null = null,
		{ reverse = false }: { reverse?: boolean } = {}
	): IterableIterator<Node> {
		const lowerKeyBound = lowerBound
			? { key: createEntryKey(level, lowerBound.key), inclusive: lowerBound.inclusive }
			: { key: createEntryKey(level, null), inclusive: true }

		const upperKeyBound = upperBound
			? { key: createEntryKey(level, upperBound.key), inclusive: upperBound.inclusive }
			: { key: createEntryKey(level + 1, null), inclusive: false }

		for (const entry of this.entries(lowerKeyBound, upperKeyBound, { reverse })) {
			const node = this.parseEntry(entry)

			yield node
		}
	}

	private parseEntry([entryKey, entryValue]: Entry): Node {
		const { K, mode } = this.metadata

		const [level, key] = parseEntryKey(entryKey)

		assert(entryValue.byteLength >= K, "entry value is less than K bytes")

		const hash = entryValue.subarray(0, K)

		if (mode === Mode.Store && level === 0 && key !== null) {
			return { level, key, hash, value: entryValue.subarray(K) }
		} else {
			return { level, key, hash }
		}
	}

	public getLeafAnchorHash() {
		// return sha256(new Uint8Array([])).subarray(0, this.metadata.K)
		return blake3(new Uint8Array([]), { dkLen: this.metadata.K })
	}

	public equalEntries(store: KeyValueNodeStore): void {
		const iterA = this.entries()
		const iterB = store.entries()

		let entryA = iterA.next()
		let entryB = iterB.next()

		let delta = 0
		while (!entryA.done || !entryB.done) {
			if (entryA.done && !entryB.done) {
				const [keyB, valueB] = entryB.value
				this.log(`[${toString(keyB, "hex")}] a: null, b: ${toString(valueB, "hex")} !`)
				delta += 1
				entryB = iterB.next()
				continue
			}

			if (!entryA.done && entryB.done) {
				const [keyA, valueA] = entryA.value
				this.log(`[${toString(keyA, "hex")}] a: ${toString(valueA, "hex")}, b: null !`)
				delta += 1
				entryA = iterA.next()
				continue
			}

			if (!entryA.done && !entryB.done) {
				const [keyA, valueA] = entryA.value
				const [keyB, valueB] = entryB.value

				switch (compare(keyA, keyB)) {
					case -1: {
						this.log(`[${toString(keyA, "hex")}] a: ${toString(valueA, "hex")}, b: null`)
						entryA = iterA.next()
						delta += 1
						continue
					}
					case 0: {
						if (!equals(valueA, valueB)) {
							this.log(`[${toString(keyA, "hex")}] a: ${toString(valueA, "hex")}, b: ${toString(valueB, "hex")}`)
							throw new Error("")
						}

						entryA = iterA.next()
						entryB = iterB.next()
						continue
					}
					case 1: {
						this.log(`[${toString(keyB, "hex")}] a: null, b: ${toString(valueB, "hex")}`)
						entryB = iterB.next()
						delta += 1
						continue
					}
				}
			}
		}

		assert(delta === 0, "expected delta === 0")
	}
}
