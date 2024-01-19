import { blake3 } from "@noble/hashes/blake3"
import { bytesToHex as hex } from "@noble/hashes/utils"

import type { Metadata, Key, Node, KeyValueStore, Target, Bound, Source } from "./interface.js"

import { NodeStore } from "./store.js"
import { Builder } from "./builder.js"
import { debug } from "./format.js"
import { DEFAULT_K, DEFAULT_Q, MAXIMUM_HEIGHT } from "./constants.js"
import { assert, equalKeys, lessThan } from "./utils.js"

export class Tree extends NodeStore implements KeyValueStore, Source, Target {
	private static leafEntryLowerBound = { key: NodeStore.createEntryKey(0, null), inclusive: false }
	private static leafEntryUpperBound = { key: NodeStore.createEntryKey(1, null), inclusive: false }

	private readonly log = debug("okra:tree")

	protected constructor(public readonly store: KeyValueStore, options: Partial<Metadata> = {}) {
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

		const hash = this.hashEntry(key, value)
		const newLeaf: Node = { level: 0, key, hash, value }

		const oldLeaf = await this.getNode(0, key)
		if (oldLeaf !== null) {
			assert(oldLeaf.value !== undefined)
			if (this.isBoundary(oldLeaf.hash)) {
				if (this.isBoundary(newLeaf.hash)) {
					await this.setNode(newLeaf)
					await this.updateNode(1, key)
				} else {
					await this.setNode(newLeaf)
					await this.deleteStack(1, key)

					const newParent = await this.getParent(0, key)
					await this.updateNode(1, newParent)
				}
			} else {
				await this.dispatch(newLeaf)
			}
		} else {
			await this.dispatch(newLeaf)
		}
	}

	public async delete(key: Uint8Array): Promise<void> {
		this.log(`delete(%h)`, key)

		const node = await this.getNode(0, key)
		if (node === null) {
			return
		}

		await this.deleteStack(0, key)

		const newParent = await this.getParent(0, key)
		await this.updateNode(1, newParent)
	}

	private async dispatch(node: Node) {
		const oldParent = await this.getParent(node.level, node.key)
		await this.setNode(node)
		if (this.isBoundary(node.hash)) {
			await this.createStack(node.level + 1, node.key)
		}

		await this.updateNode(node.level + 1, oldParent)
	}

	private async updateNode(level: number, key: Key) {
		const hash = await this.getHash(level, key)

		const newNode: Node = { level, key, hash }
		if (key === null) {
			await this.setNode(newNode)
			for await (const node of this.nodes(level, { key, inclusive: false }, null)) {
				await this.updateNode(level + 1, null)
				return
			}

			await this.deleteStack(level + 1, null)
			return
		}

		const oldNode = await this.getNode(level, key)
		assert(oldNode !== null)
		if (this.isBoundary(oldNode.hash)) {
			if (this.isBoundary(newNode.hash)) {
				await this.setNode(newNode)
				await this.updateNode(level + 1, key)
			} else {
				await this.deleteStack(level + 1, key)
				await this.setNode(newNode)

				const newParent = await this.getParent(level, key)
				await this.updateNode(level + 1, newParent)
			}
		} else {
			await this.dispatch(newNode)
		}
	}

	private async deleteStack(level: number, key: Key) {
		const node = await this.getNode(level, key)
		if (node !== null) {
			await this.deleteNode(level, key)
			await this.deleteStack(level + 1, key)
		}
	}

	private async createStack(level: number, key: Key) {
		assert(level > 0)
		const hash = await this.getHash(level, key)
		await this.setNode({ level, key, hash })
		if (this.isBoundary(hash)) {
			await this.createStack(level + 1, key)
		}
	}

	private async getParent(level: number, key: Key): Promise<Key> {
		assert(key !== null)

		for await (const node of this.nodes(level, null, { key, inclusive: true }, { reverse: true })) {
			if (node.key === null || this.isBoundary(node.hash)) {
				return node.key
			}
		}

		throw new Error("Internal error")
	}

	private async getHash(level: number, key: Key): Promise<Uint8Array> {
		this.log("hashing %d %k", level, key)

		const hash = blake3.create({ dkLen: this.metadata.K })
		for await (const node of this.nodes(level - 1, { key, inclusive: true })) {
			if (lessThan(key, node.key) && this.isBoundary(node.hash)) {
				break
			}

			this.log("------- %h (%k)", node.hash, node.key)
			hash.update(node.hash)
		}

		return hash.digest()
	}

	/**
	 * Get the root node of the merkle tree. Returns the leaf anchor node if the tree is empty.
	 */
	public async getRoot(): Promise<Node> {
		const upperBound = { key: new Uint8Array([MAXIMUM_HEIGHT]), inclusive: false }
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
			if (this.isBoundary(node.hash) && !equalKeys(node.key, key)) {
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
