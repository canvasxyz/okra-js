import { blake3 } from "@noble/hashes/blake3"

import type { Key, Node, KeyValueStore, Entry, Metadata, Bound } from "./interface.js"
import { OKRA_VERSION } from "./constants.js"

/**
 * NodeStore is an internal class that Tree and Builder both extend.
 * Its only purpose is to encapsulate the node-to-entry and
 * entry-to-node conversion methods.
 */
export class NodeStore {
	protected static metadataKey = new Uint8Array([0xff])
	protected static anchorLeafKey = new Uint8Array([0])

	private readonly limit: number
	constructor(readonly store: KeyValueStore, readonly metadata: Metadata) {
		this.limit = Number((1n << 32n) / BigInt(metadata.Q))
	}

	protected async initialize() {
		const metadata = await this.getMetadata()
		if (metadata === null) {
			await this.setMetadata(this.metadata)
			await this.setNode({ level: 0, key: null, hash: this.getLeafAnchorHash() })
		} else if (metadata.K !== this.metadata.K) {
			throw new Error("metadata.K conflict")
		} else if (metadata.Q !== this.metadata.Q) {
			throw new Error("metadata.Q conflict")
		}
	}

	protected async setMetadata(metadata: Metadata) {
		const valueBuffer = new ArrayBuffer(10)
		const valueView = new DataView(valueBuffer, 0, 10)
		const value = new Uint8Array(valueBuffer, 0, 10)
		new TextEncoder().encodeInto("okra", value)
		value[4] = OKRA_VERSION
		value[5] = metadata.K
		valueView.setUint32(6, metadata.Q)
		await this.store.set(NodeStore.metadataKey, value)
	}

	protected async getMetadata(): Promise<Metadata | null> {
		const value = await this.store.get(NodeStore.metadataKey)
		if (value === null) {
			return null
		} else if (value.length === 10) {
			const view = new DataView(value.buffer, value.byteOffset, value.byteLength)
			return { K: value[5], Q: view.getUint32(6) }
		} else {
			throw new Error("Invalid metadata entry")
		}
	}

	public async getNode(level: number, key: Key): Promise<Node | null> {
		const entryKey = NodeStore.createEntryKey(level, key)
		const entryValue = await this.store.get(entryKey)
		return entryValue && this.parseEntry([entryKey, entryValue])
	}

	protected async setNode(node: Node): Promise<void> {
		if (node.hash.byteLength !== this.metadata.K) {
			throw new Error("Internal error: node hash is not K bytes")
		}

		const entryKey = NodeStore.createEntryKey(node.level, node.key)

		if (node.level === 0 && node.key !== null) {
			if (node.value === undefined) {
				throw new Error("Internal error: expected leaf node to have a value")
			}

			const entryValue = new Uint8Array(new ArrayBuffer(this.metadata.K + node.value.byteLength))
			entryValue.set(node.hash)
			entryValue.set(node.value, this.metadata.K)
			await this.store.set(entryKey, entryValue)
		} else {
			await this.store.set(entryKey, node.hash)
		}
	}

	protected async deleteNode(level: number, key: Key): Promise<void> {
		const entryKey = NodeStore.createEntryKey(level, key)
		await this.store.delete(entryKey)
	}

	public async *nodes(
		level: number,
		lowerBound: Bound<Key> | null = null,
		upperBound: Bound<Key> | null = null,
		{ reverse = false }: { reverse?: boolean } = {}
	): AsyncIterableIterator<Node> {
		const lowerKeyBound = lowerBound
			? { key: NodeStore.createEntryKey(level, lowerBound.key), inclusive: lowerBound.inclusive }
			: { key: NodeStore.createEntryKey(level, null), inclusive: true }

		const upperKeyBound = upperBound
			? { key: NodeStore.createEntryKey(level, upperBound.key), inclusive: upperBound.inclusive }
			: { key: NodeStore.createEntryKey(level + 1, null), inclusive: false }

		for await (const entry of this.store.entries(lowerKeyBound, upperKeyBound, { reverse })) {
			yield this.parseEntry(entry)
		}
	}

	protected parseEntry([entryKey, entryValue]: Entry): Node {
		const [level, key] = NodeStore.parseEntryKey(entryKey)

		if (entryValue.byteLength < this.metadata.K) {
			throw new Error("Internal error: entry value is less than K bytes")
		}

		const hash = entryValue.subarray(0, this.metadata.K)
		if (level === 0 && key !== null) {
			return { level, key, hash, value: entryValue.subarray(this.metadata.K) }
		} else {
			return { level, key, hash }
		}
	}

	protected static parseEntryKey(entryKey: Uint8Array): [level: number, key: Key] {
		if (entryKey.byteLength === 0) {
			throw new Error("Internal error: empty entry key")
		} else if (entryKey.byteLength === 1) {
			return [entryKey[0], null]
		} else {
			return [entryKey[0], entryKey.subarray(1)]
		}
	}

	protected static createEntryKey(level: number, key: Key): Uint8Array {
		if (key === null) {
			return new Uint8Array([level])
		} else {
			const entryKey = new Uint8Array(new ArrayBuffer(1 + key.length))
			entryKey[0] = level
			entryKey.set(key, 1)
			return entryKey
		}
	}

	private static size = new ArrayBuffer(4)
	private static view = new DataView(NodeStore.size)

	public hashEntry(key: Uint8Array, value: Uint8Array): Uint8Array {
		const hash = blake3.create({ dkLen: this.metadata.K })
		NodeStore.view.setUint32(0, key.length)
		hash.update(new Uint8Array(NodeStore.size))
		hash.update(key)
		NodeStore.view.setUint32(0, value.length)
		hash.update(new Uint8Array(NodeStore.size))
		hash.update(value)
		return hash.digest()
	}

	protected isBoundary(hash: Uint8Array): boolean {
		const view = new DataView(hash.buffer, hash.byteOffset, 4)
		return view.getUint32(0) < this.limit
	}

	protected getLeafAnchorHash = () => blake3(new Uint8Array([]), { dkLen: this.metadata.K })
}
