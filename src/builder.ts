import { AbstractLevel } from "abstract-level"

import { blake3 } from "@noble/hashes/blake3"

import { HEADER_KEY, getHeader } from "./header.js"
import { Key, Node, createEntryKey, nodeToEntry } from "./schema.js"
import { K, Q, assert, hashEntry, isSplit, getLeafAnchorHash } from "./utils.js"

import { entryToNode } from "./schema.js"

export class Builder {
	public static async open(db: AbstractLevel<any, Uint8Array, Uint8Array>, options: { K?: number; Q?: number } = {}) {
		const k = options.K ?? K
		const q = options.Q ?? Q

		await db.put(HEADER_KEY, getHeader({ K: K, Q: q }))
		await db.put(createEntryKey(0, null), getLeafAnchorHash({ K: k }))

		return new Builder(db, k, q)
	}

	private nodeCount = 1
	private constructor(
		public readonly db: AbstractLevel<any, Uint8Array, Uint8Array>,
		private readonly K: number,
		private readonly Q: number
	) {}

	public async set(key: Uint8Array, value: Uint8Array): Promise<void> {
		const hash = hashEntry(key, value, { K: this.K })
		await this.setNode({ level: 0, key, hash, value })
		this.nodeCount += 1
	}

	public async finalize(): Promise<Node> {
		let level = 0
		while (this.nodeCount > 1) {
			this.nodeCount = await this.buildLevel(level++)
		}

		const rootEntryKey = createEntryKey(level, null)
		const rootEntryValue = await this.db.get(rootEntryKey)
		return entryToNode([rootEntryKey, rootEntryValue], { K: this.K })
	}

	private async setNode(node: Node) {
		const [key, value] = nodeToEntry(node, { K: this.K })
		await this.db.put(key, value)
	}

	private async buildLevel(level: number): Promise<number> {
		const iter = await this.db.iterator({
			gte: createEntryKey(level, null),
			lt: createEntryKey(level + 1, null),
		})

		try {
			let nodeCount = 0

			const firstEntry = await iter.next()
			assert(firstEntry !== undefined)

			const firstNode = entryToNode(firstEntry, { K: this.K })
			assert(firstNode.level === level && firstNode.key === null)
			assert(firstNode.value === undefined)

			let key: Key = firstNode.key
			let hash = blake3.create({ dkLen: this.K })
			hash.update(firstNode.hash)

			while (true) {
				const entry = await iter.next()

				if (entry === undefined) {
					await this.setNode({ level: level + 1, key, hash: hash.digest() })
					nodeCount++
					break
				}

				const node = entryToNode(entry, { K: this.K })

				if (node.level !== level) {
					await this.setNode({ level: level + 1, key, hash: hash.digest() })
					nodeCount++
					break
				} else if (isSplit(node.hash, { Q: this.Q })) {
					await this.setNode({ level: level + 1, key, hash: hash.digest() })
					nodeCount++
					key = node.key
					hash = blake3.create({ dkLen: K })
					hash.update(node.hash)
				} else {
					hash.update(node.hash)
				}
			}

			return nodeCount
		} finally {
			await iter.close()
		}
	}
}
