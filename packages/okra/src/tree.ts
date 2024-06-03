import { sha256 } from "@noble/hashes/sha256"
import { bytesToHex as hex } from "@noble/hashes/utils"

import type { Metadata, Key, Node, KeyValueStore, SyncTarget, Bound, SyncSource } from "./interface.js"

import { NodeStore } from "./store.js"
import { Builder } from "./builder.js"
import { debug } from "./format.js"
import { DEFAULT_K, DEFAULT_Q } from "./constants.js"
import { assert, equalKeys, lessThan } from "./utils.js"

interface TreeOptions extends Partial<Metadata> {
	indexOnly?: boolean
}

export class Tree extends NodeStore implements KeyValueStore, SyncSource, SyncTarget {
	private static leafEntryLowerBound = { key: NodeStore.createEntryKey(0, null), inclusive: false }
	private static leafEntryUpperBound = { key: NodeStore.createEntryKey(1, null), inclusive: false }

	private readonly log = debug("okra:tree")

	protected constructor(public readonly store: KeyValueStore, options: TreeOptions = {}) {
		const metadata = { K: options.K ?? DEFAULT_K, Q: options.Q ?? DEFAULT_Q }
		super(store, metadata)
	}

	public async *entries(
		lowerBound: Bound<Uint8Array> | null = null,
		upperBound: Bound<Uint8Array> | null = null,
		{ reverse = false }: { reverse?: boolean } = {}
	): AsyncIterableIterator<[Uint8Array, Uint8Array]> {
		const lowerKeyBound = lowerBound
			? { key: NodeStore.createEntryKey(0, lowerBound.key), inclusive: lowerBound.inclusive }
			: Tree.leafEntryLowerBound

		const upperKeyBound = upperBound
			? { key: NodeStore.createEntryKey(0, upperBound.key), inclusive: upperBound.inclusive }
			: Tree.leafEntryUpperBound

		for await (const entry of this.store.entries(lowerKeyBound, upperKeyBound, { reverse })) {
			const node = this.parseEntry(entry)
			if (node.key === null || node.value === undefined) {
				throw new Error("Internal error - unexpected leaf entry")
			}

			yield [node.key, node.value]
		}
	}

	public async get(key: Uint8Array): Promise<Uint8Array | null> {
		const node = await this.getNode(0, key)
		if (node === null) {
			return null
		} else if (node.value !== undefined) {
			return node.value
		} else {
			throw new Error("Internal error - missing leaf value")
		}
	}

	public async set(key: Uint8Array, value: Uint8Array): Promise<void> {
		this.log(`set(%h, %h)`, key, value)

		const oldLeaf = await this.getNode(0, key)

		const hash = this.hashEntry(key, value)
		const newLeaf: Node = { level: 0, key, hash, value }

		await this.replace(oldLeaf, newLeaf)
	}

	public async delete(key: Uint8Array): Promise<void> {
		this.log(`delete(%h)`, key)

		const node = await this.getNode(0, key)
		if (node === null) {
			return
		}

		if (node.key !== null && this.isBoundary(node)) {
			await this.deleteParents(0, key)
		}

		await this.deleteNode(0, key)

		const firstSibling = await this.getFirstSibling(node)
		if (firstSibling.key === null) {
			await this.updateAnchor(1)
		} else {
			await this.update(1, firstSibling.key)
		}
	}

	private async update(level: number, key: Key) {
		const oldNode = await this.getNode(level, key)
		const hash = await this.getHash(level, key)
		const newNode: Node = { level, key, hash }
		await this.replace(oldNode, newNode)
	}

	private async replace(oldNode: Node | null, newNode: Node) {
		if (oldNode !== null && this.isBoundary(oldNode)) {
			await this.replaceBoundary(newNode)
		} else {
			const firstSibling = await this.getFirstSibling(newNode)

			await this.setNode(newNode)
			if (this.isBoundary(newNode)) {
				await this.createParents(newNode.level, newNode.key)
			}

			if (firstSibling.key == null) {
				await this.updateAnchor(newNode.level + 1)
			} else {
				await this.update(newNode.level + 1, firstSibling.key)
			}
		}
	}

	private async replaceBoundary(node: Node) {
		if (this.isBoundary(node)) {
			await this.setNode(node)
			await this.update(node.level + 1, node.key)
		} else {
			await this.setNode(node)
			await this.deleteParents(node.level, node.key)

			const firstSibling = await this.getFirstSibling(node)
			if (firstSibling.key === null) {
				await this.updateAnchor(node.level + 1)
			} else {
				await this.update(node.level + 1, firstSibling.key)
			}
		}
	}

	private async updateAnchor(level: number) {
		const hash = await this.getHash(level, null)

		await this.setNode({ level, key: null, hash })
		for await (const node of this.nodes(level, { key: null, inclusive: false }, null)) {
			await this.updateAnchor(level + 1)
			return
		}

		await this.deleteParents(level, null)
	}

	private async deleteParents(level: number, key: Key) {
		const node = await this.getNode(level + 1, key)
		if (node !== null) {
			await this.deleteNode(level + 1, key)
			await this.deleteParents(level + 1, key)
		}
	}

	private async createParents(level: number, key: Key) {
		const hash = await this.getHash(level + 1, key)
		const node: Node = { level: level + 1, key, hash }
		await this.setNode(node)
		if (this.isBoundary(node)) {
			await this.createParents(level + 1, key)
		}
	}

	private async getFirstSibling(node: Node): Promise<Node> {
		if (node.key === null) {
			return node
		}

		const upperBound = { key: node.key, inclusive: true }
		for await (const prev of this.nodes(node.level, null, upperBound, { reverse: true })) {
			if (prev.key === null || this.isBoundary(prev)) {
				return prev
			}
		}

		throw new Error("Internal error")
	}

	private async getHash(level: number, key: Key): Promise<Uint8Array> {
		this.log("hashing %d %k", level, key)

		const hash = sha256.create()
		for await (const node of this.nodes(level - 1, { key, inclusive: true })) {
			if (lessThan(key, node.key) && this.isBoundary(node)) {
				break
			}

			this.log("------- %h (%k)", node.hash, node.key)
			hash.update(node.hash)
		}

		return hash.digest().subarray(0, this.metadata.K)
	}

	/**
	 * Get the root node of the merkle tree. Returns the leaf anchor node if the tree is empty.
	 */
	public async getRoot(): Promise<Node> {
		const upperBound = { key: NodeStore.metadataKey, inclusive: false }
		for await (const entry of this.store.entries(null, upperBound, { reverse: true })) {
			const node = this.parseEntry(entry)
			assert(node.key === null, "Internal error: unexpected root node key", node)
			return node
		}

		throw new Error("Internal error: empty node store")
	}

	/**
	 * Get the children of a node in the merkle tree, identified by level and key.
	 */
	public async getChildren(level: number, key: Key): Promise<Node[]> {
		if (level === 0) {
			throw new RangeError("Cannot get children of a leaf node")
		}

		const children: Node[] = []
		for await (const node of this.nodes(level - 1, { key, inclusive: true })) {
			if (this.isBoundary(node) && !equalKeys(node.key, key)) {
				break
			} else {
				children.push(node)
			}
		}

		return children
	}

	/**
	 * Raze and rebuild the merkle tree from the leaves.
	 * @returns the new root node
	 */
	public async rebuild(): Promise<Node> {
		const lowerBound = { key: NodeStore.createEntryKey(1, null), inclusive: true }
		for await (const [entryKey] of this.store.entries(lowerBound)) {
			await this.store.delete(entryKey)
		}

		const builder = await Builder.open(this.store, this.metadata)
		const root = await builder.finalize()
		return root
	}

	/**
	 * Pretty-print the tree structure to a utf-8 stream.
	 * Consume with a TextDecoderStream or async iterable sink.
	 */
	public async *print(options: { hashSize?: number } = {}): AsyncIterableIterator<Uint8Array> {
		const hashSize = options.hashSize ?? 4
		const slot = "  ".repeat(hashSize)
		const hash = ({ hash }: Node) => hex(hash.subarray(0, hashSize))
		const encoder = new TextEncoder()

		const tree = this
		async function* printTree(prefix: string, bullet: string, node: Node): AsyncIterableIterator<Uint8Array> {
			yield encoder.encode(bullet)
			yield encoder.encode(` ${hash(node)} `)
			if (node.level === 0) {
				if (node.key === null) {
					yield encoder.encode(`│\n`)
				} else {
					yield encoder.encode(`│ ${hex(node.key)}\n`)
				}
			} else {
				const children = await tree.getChildren(node.level, node.key)
				for (const [i, child] of children.entries()) {
					if (i > 0) {
						yield encoder.encode(prefix)
					}

					if (i < children.length - 1) {
						yield* printTree(prefix + "│   " + slot, i === 0 ? "┬─" : "├─", child)
					} else {
						yield* printTree(prefix + "    " + slot, i === 0 ? "──" : "└─", child)
					}
				}
			}
		}

		const root = await this.getRoot()
		yield* printTree("    " + slot, "──", root)
	}
}
