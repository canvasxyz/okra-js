import { AbstractLevel } from "abstract-level"

import { blake3 } from "@noble/hashes/blake3"
import { bytesToHex } from "@noble/hashes/utils"

import { HEADER_KEY, getHeader } from "./header.js"
import { Key, Node, createEntryKey, nodeToEntry } from "./schema.js"
import { K, Q, assert, hashEntry, isSplit, leafAnchorHash } from "./utils.js"

import { entryToNode } from "./schema.js"

export async function build(
	db: AbstractLevel<any, Uint8Array, Uint8Array>,
	entries: Iterable<[Uint8Array, Uint8Array]>
): Promise<Node> {
	await db.put(HEADER_KEY, getHeader(K, Q))
	await setNode(db, 0, null, leafAnchorHash)
	let nodeCount = 1

	for (const [key, value] of entries) {
		await setNode(db, 0, key, hashEntry(key, value), value)
		nodeCount += 1
	}

	let level = 0
	while (nodeCount > 1) {
		nodeCount = await buildLevel(db, level++)
	}

	const rootEntryKey = createEntryKey(level, null)
	const rootEntryValue = await db.get(rootEntryKey)
	return entryToNode([rootEntryKey, rootEntryValue])
}

async function setNode(
	db: AbstractLevel<any, Uint8Array, Uint8Array>,
	level: number,
	key: Key,
	hash: Uint8Array,
	value?: Uint8Array
) {
	const [entryKey, entryValue] = nodeToEntry({ level, key, hash, value })
	await db.put(entryKey, entryValue)
}

async function buildLevel(
	db: AbstractLevel<any, Uint8Array, Uint8Array>,
	level: number
): Promise<number> {
	const iter = await db.iterator({
		gte: createEntryKey(level, null),
		lt: createEntryKey(level + 1, null),
	})

	try {
		let nodeCount = 0

		const firstEntry = await iter.next()
		assert(firstEntry !== undefined)

		const firstNode = entryToNode(firstEntry)
		assert(firstNode.level === level && firstNode.key === null)
		assert(firstNode.value === undefined)

		let key: Key = firstNode.key
		let hash = blake3.create({ dkLen: K })
		hash.update(firstNode.hash)

		while (true) {
			const entry = await iter.next()

			if (entry === undefined) {
				await setNode(db, level + 1, key, hash.digest())
				nodeCount++
				break
			}

			const node = entryToNode(entry)

			if (node.level !== level) {
				await setNode(db, level + 1, key, hash.digest())
				nodeCount++
				break
			} else if (isSplit(node.hash)) {
				await setNode(db, level + 1, key, hash.digest())
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
