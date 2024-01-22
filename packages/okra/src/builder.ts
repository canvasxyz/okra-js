import { blake3 } from "@noble/hashes/blake3"

import { NodeStore } from "./store.js"
import { Metadata, Key, Node, KeyValueStore } from "./interface.js"
import { assert } from "./utils.js"
import { DEFAULT_METADATA } from "./constants.js"

export class Builder extends NodeStore {
	public static async open(store: KeyValueStore, metadata: Metadata = DEFAULT_METADATA): Promise<Builder> {
		const builder = new Builder(store, metadata)
		await builder.initialize()
		await builder.setNode({ level: 0, key: null, hash: builder.getLeafAnchorHash() })
		return builder
	}

	private nodeCount = 1

	public async set(key: Uint8Array, value: Uint8Array): Promise<void> {
		const hash = this.hashEntry(key, value)
		await this.setNode({ level: 0, key, hash, value })
		this.nodeCount += 1
	}

	public async finalize(): Promise<Node> {
		let level = 0
		while (this.nodeCount > 1) {
			this.nodeCount = await this.buildLevel(level++)
		}

		const root = await this.getNode(level, null)
		assert(root !== null, "root not found")
		return root
	}

	private async buildLevel(level: number): Promise<number> {
		const iter = this.nodes(level)

		const next = () => iter.next().then(({ done, value }) => (done ? null : value))

		try {
			let nodeCount = 0

			let node = await next()
			assert(node !== null, "level is empty")
			assert(node.level === level && node.key === null, "first node was not an anchor")

			let key: Key = node.key
			let hash = blake3.create({ dkLen: this.metadata.K })
			hash.update(node.hash)

			while (true) {
				node = await next()

				if (node === null) {
					await this.setNode({ level: level + 1, key, hash: hash.digest() })
					nodeCount++
					break
				}

				assert(node.level === level, "unexpected node level")
				if (this.isBoundary(node)) {
					await this.setNode({ level: level + 1, key, hash: hash.digest() })
					nodeCount++
					key = node.key
					hash = blake3.create({ dkLen: this.metadata.K })
					hash.update(node.hash)
				} else {
					hash.update(node.hash)
				}
			}

			return nodeCount
		} finally {
			if (iter.return !== undefined) {
				const { done, value } = await iter.return()
				assert(done && value === undefined) // ???
			}
		}
	}
}
