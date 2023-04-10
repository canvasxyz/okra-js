import type { AbstractLevel } from "abstract-level"

import { blake3 } from "@noble/hashes/blake3"

import { getHeader } from "./header.js"
import { Key, Node } from "./nodes.js"
import { K, Q, HEADER_KEY } from "./constants.js"
import {
	assert,
	hashEntry,
	isSplit,
	getLeafAnchorHash,
	encodingOptions,
	entryToNode,
	createEntryKey,
	nodeToEntry,
} from "./utils.js"

export class Builder<TFormat, KDefault, VDefault> {
	public static async open<TFormat, KDefault, VDefault>(
		db: AbstractLevel<TFormat, KDefault, VDefault>,
		options: { K?: number; Q?: number } = {}
	): Promise<Builder<TFormat, KDefault, VDefault>> {
		const k = options.K ?? K
		const q = options.Q ?? Q

		await db.put(HEADER_KEY, getHeader({ K: K, Q: q }), encodingOptions)
		await db.put(createEntryKey(0, null), getLeafAnchorHash({ K: k }), encodingOptions)

		return new Builder(db, k, q)
	}

	private nodeCount = 1
	private constructor(
		public readonly db: AbstractLevel<TFormat, KDefault, VDefault>,
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
		const rootEntryValue = await this.db.get<Uint8Array, Uint8Array>(rootEntryKey, encodingOptions)
		return entryToNode([rootEntryKey, rootEntryValue], { K: this.K })
	}

	private async setNode(node: Node) {
		const [key, value] = nodeToEntry(node, { K: this.K })
		await this.db.put<Uint8Array, Uint8Array>(key, value, encodingOptions)
	}

	private async buildLevel(level: number): Promise<number> {
		const iter = this.db.iterator<Uint8Array, Uint8Array>({
			gte: createEntryKey(level, null),
			lt: createEntryKey(level + 1, null),
			...encodingOptions,
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
