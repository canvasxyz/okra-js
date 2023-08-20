import { blake3 } from "@noble/hashes/blake3"
import { bytesToHex as hex } from "@noble/hashes/utils"

import type { Metadata, Key, Node, KeyValueStore, Target, Bound } from "./interface.js"

import { NodeStore } from "./store.js"
import { Builder } from "./builder.js"
import { debug } from "./format.js"
import { DEFAULT_K, DEFAULT_Q, MAXIMUM_HEIGHT } from "./constants.js"
import { assert, equalKeys, lessThan } from "./utils.js"

type Operation = { type: "set"; key: Uint8Array; value: Uint8Array } | { type: "delete"; key: Uint8Array }

// we have enums at home
const Result = { Update: 0, Delete: 1 } as const
type Result = (typeof Result)[keyof typeof Result]

export class Tree extends NodeStore implements Target, KeyValueStore {
	private static leafEntryLowerBound = { key: NodeStore.createEntryKey(0, null), inclusive: false }
	private static leafEntryUpperBound = { key: NodeStore.createEntryKey(1, null), inclusive: false }

	private static indent = "  "

	private depth = 0
	private newSiblings: Key[] = []
	private readonly format = debug("okra:tree")

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
		await this.apply({ type: "set", key, value })
	}

	public async delete(key: Uint8Array): Promise<void> {
		this.log(`delete(%h)`, key)
		await this.apply({ type: "delete", key })
	}

	private async apply(operation: Operation): Promise<void> {
		if (this.newSiblings.length !== 0) {
			throw new Error("internal error")
		}

		this.log("- apply")
		const root = await this.getRoot()
		this.log("- got root %d %k %h", root.level, root.key, root.hash)

		const result =
			root.level === 0 ? await this.applyLeaf(null, operation) : await this.applyNode(root.level - 1, null, operation)

		if (result === Result.Delete) {
			throw new Error("internal error")
		}

		let rootLevel = root.level || 1

		await this.hashNode(rootLevel, null)

		while (this.newSiblings.length > 0) {
			await this.promote(rootLevel)
			rootLevel += 1
			await this.hashNode(rootLevel, null)
		}

		while (rootLevel > 0) {
			const { key: last, hash } = await this.getLastNode(rootLevel - 1)
			this.log("got last: %k %h", last, hash)
			if (last !== null) {
				break
			}

			await this.deleteNode(rootLevel, null)

			rootLevel--
		}
	}

	private async applyLeaf(firstChild: Key, operation: Operation): Promise<Result> {
		this.log("applyLeaf(%k, { %s %h })", firstChild, operation.type, operation.key)
		if (operation.type === "set") {
			const { key, value } = operation
			const hash = this.hashEntry(key, value)
			await this.setNode({ level: 0, key, hash, value })

			if (lessThan(firstChild, key)) {
				if (this.isSplit(hash)) {
					this.newSiblings.push(key)
				}

				return Result.Update
			} else if (equalKeys(firstChild, key)) {
				if (firstChild === null || this.isSplit(hash)) {
					return Result.Update
				} else {
					return Result.Delete
				}
			} else {
				throw new Error("invalid database")
			}
		} else if (operation.type === "delete") {
			await this.deleteNode(0, operation.key)
			if (equalKeys(operation.key, firstChild)) {
				return Result.Delete
			} else {
				return Result.Update
			}
		} else {
			throw new Error("invalid operation type")
		}
	}

	private async applyNode(level: number, firstChild: Key, operation: Operation): Promise<Result> {
		try {
			this.depth += 1
			if (level === 0) {
				return this.applyLeaf(firstChild, operation)
			}

			const target = await this.findTarget(level, firstChild, operation.key)

			const isLeftEdge = firstChild === null
			const isFirstChild = equalKeys(target, firstChild)

			const result = await this.applyNode(level - 1, target, operation)
			if (result === Result.Delete) {
				assert(!isLeftEdge || !isFirstChild)

				const previousChild = await this.moveToPreviousChild(level, target)

				await this.promote(level)

				const isPreviousChildSplit = await this.hashNode(level, previousChild)

				if (isFirstChild || lessThan(previousChild, firstChild)) {
					if (isPreviousChildSplit) {
						this.newSiblings.push(previousChild)
					}

					return Result.Delete
				} else if (equalKeys(previousChild, firstChild)) {
					if (isLeftEdge || isPreviousChildSplit) {
						return Result.Update
					} else {
						return Result.Delete
					}
				} else {
					if (isPreviousChildSplit) {
						this.newSiblings.push(previousChild)
					}

					return Result.Update
				}
			} else {
				const isTargetSplit = await this.hashNode(level, target)

				await this.promote(level)

				if (isFirstChild) {
					if (isTargetSplit || isLeftEdge) {
						return Result.Update
					} else {
						return Result.Delete
					}
				} else {
					if (isTargetSplit) {
						this.newSiblings.push(target)
					}

					return Result.Update
				}
			}
		} finally {
			this.depth -= 1
		}
	}

	private async promote(level: number): Promise<void> {
		const newSiblings: Key[] = []
		for (const newChild of this.newSiblings) {
			const isSplit = await this.hashNode(level, newChild)
			if (isSplit) {
				newSiblings.push(newChild)
			}
		}

		this.newSiblings = newSiblings
	}

	private async findTarget(level: number, firstChild: Key, key: Uint8Array): Promise<Key> {
		let target: Node | null = null
		for await (const node of this.nodes(level, { key: firstChild, inclusive: true })) {
			if (lessThan(key, node.key)) {
				break
			} else {
				target = node
			}
		}

		assert(target !== null)
		return target.key
	}

	// deletes the target key and moves backwards until it finds a new one.
	private async moveToPreviousChild(level: number, target: Key): Promise<Key> {
		this.log("moveToPreviousChild(%d, %k)", level, target)

		assert(level > 0)

		await this.deleteNode(level, target)

		const lowerBound = { key: null, inclusive: true }
		const upperBound = { key: target, inclusive: false }
		for await (const previousChild of this.nodes(level, lowerBound, upperBound, { reverse: true })) {
			this.log("previousChild: %n", previousChild)
			if (previousChild.key === null) {
				return null
			}

			const previousGrandChild = await this.getNode(level - 1, previousChild.key)
			if (previousGrandChild !== null && this.isSplit(previousGrandChild.hash)) {
				return previousChild.key
			}

			await this.deleteNode(level, previousChild.key)
		}

		throw new Error("Internal error: unexpected end of range")
	}

	// Computes and sets the hash of the given node.
	// Doesn't assume anything about the current cursor position.
	// Returns isSplit for the updated hash.
	private async hashNode(level: number, key: Key): Promise<boolean> {
		this.log("hashing %d %k", level, key)

		const hash = blake3.create({ dkLen: this.metadata.K })
		for await (const node of this.nodes(level - 1, { key, inclusive: true })) {
			if (this.isSplit(node.hash) && !equalKeys(node.key, key)) {
				break
			}

			this.log("------- %h (%k)", node.hash, node.key)
			hash.update(node.hash)
		}

		const node: Node = { level, key, hash: hash.digest() }
		this.log("------- %h", node.hash)
		await this.setNode(node)
		return this.isSplit(node.hash)
	}

	private async getLastNode(level: number): Promise<Node> {
		for await (const node of this.nodes(level, null, null, { reverse: true })) {
			assert(node.level === level)
			return node
		}

		throw new Error("Internal error: empty level")
	}

	private log(format: string, ...args: any[]) {
		this.format("%s" + format, Tree.indent.repeat(this.depth), ...args)
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
			if (this.isSplit(node.hash) && !equalKeys(node.key, key)) {
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
