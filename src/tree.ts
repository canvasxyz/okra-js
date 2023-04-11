import { blake3 } from "@noble/hashes/blake3"
import { bytesToHex as hex } from "@noble/hashes/utils"

import { AbstractLevel, AbstractIteratorOptions } from "abstract-level"

import { Delta, Key, Node, Source } from "./types.js"
import { getHeader, isHeaderEntry, HEADER_KEY } from "./header.js"
import { Builder } from "./builder.js"
import { debug } from "./format.js"
import { K, Q } from "./constants.js"
import {
	assert,
	equalArrays,
	equalKeys,
	hashEntry,
	isSplit,
	lessThan,
	getLeafAnchorHash,
	encodingOptions,
	entryToNode,
	nodeToEntry,
	createEntryKey,
	parseNodeValue,
	parseNodeKey,
	Entry,
} from "./utils.js"
import { Driver } from "./driver.js"
import ModuleError from "module-error"

type Operation = { type: "set"; key: Uint8Array; value: Uint8Array } | { type: "delete"; key: Uint8Array }

// we have enums at home
const Result = { Update: 0, Delete: 1 } as const
type Result = typeof Result[keyof typeof Result]

/**
 * You should never have to instantiate the generic type parameters manually.
 * Just pass an abstract-level instance to Tree.open and the TypeScript
 * compiler should be able to infer the rest.
 */
export class Tree<TFormat = any, KDefault = any, VDefault = any> implements Source {
	private static indent = "  "
	private static async get<TFormat, KDefault, VDefault>(
		db: AbstractLevel<TFormat, KDefault, VDefault>,
		key: Uint8Array
	): Promise<Uint8Array | null> {
		try {
			return await db.get(key, encodingOptions)
		} catch (err: any) {
			// TODO: switch to `err instanceof ModuleError` when memory-level fixes their shit
			if (err.code === "LEVEL_NOT_FOUND") {
				return null
			} else {
				throw err
			}
		}
	}

	public static async open<TFormat, KDefault, VDefault>(
		db: AbstractLevel<TFormat, KDefault, VDefault>,
		options: { K?: number; Q?: number; log?: (format: string, ...args: any[]) => void } = {}
	): Promise<Tree<TFormat, KDefault, VDefault>> {
		const k = options.K ?? K
		const q = options.Q ?? Q

		const header = await Tree.get(db, HEADER_KEY)
		if (header === null) {
			await db.put(HEADER_KEY, getHeader({ K: K, Q: q }), encodingOptions)
			await db.put(createEntryKey(0, null), getLeafAnchorHash({ K: k }), encodingOptions)
		} else if (!equalArrays(header, getHeader({ K: K, Q: q }))) {
			throw new Error("Invalid header")
		}

		return new Tree(db, k, q, options.log ?? debug("okra:tree"))
	}

	private depth = 0
	private newSiblings: Key[] = []

	constructor(
		public readonly db: AbstractLevel<TFormat, KDefault, VDefault>,
		public readonly K: number,
		public readonly Q: number,
		private readonly formatter: (format: string, ...args: any[]) => void
	) {}

	public async close(): Promise<void> {
		await this.db.close()
	}

	/**
	 * Iterate over a range of leaf key/value entries. Does not yield the leaf anchor node.
	 * @param lowerBound *inclusive* lower bound (default null/no lower bound)
	 * @param upperBound *exclusive* upper bound (default null/no upper bound)
	 * @param options
	 */
	public async *entries(
		lowerBound: Uint8Array | null = null,
		upperBound: Uint8Array | null = null,
		options: { reverse?: boolean } = {}
	): AsyncIterableIterator<Entry> {
		const reverse = options.reverse ?? false
		const levelIteratorOptions: AbstractIteratorOptions<Uint8Array, Uint8Array> = { reverse, ...encodingOptions }
		if (lowerBound === null) {
			levelIteratorOptions.gt = createEntryKey(0, null)
		} else {
			levelIteratorOptions.gte = createEntryKey(0, lowerBound)
		}

		if (upperBound === null) {
			levelIteratorOptions.lt = createEntryKey(1, null)
		} else {
			levelIteratorOptions.lt = createEntryKey(0, upperBound)
		}

		const iter = this.db.iterator<Uint8Array, Uint8Array>(levelIteratorOptions)
		for await (const entry of iter) {
			const node = entryToNode(entry)
			assert(node.level === 0 && node.key !== null && node.value !== undefined)
			yield [node.key, node.value]
		}
	}

	public async get(key: Uint8Array): Promise<Uint8Array | null> {
		const entryKey = createEntryKey(0, key)
		const entryValue = await Tree.get(this.db, entryKey)
		return entryValue && parseNodeValue(entryValue, { K: this.K })
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

			const rootEntryKey = createEntryKey(rootLevel, null)
			this.log("deleting %h", rootEntryKey)
			await this.db.del(rootEntryKey, encodingOptions)

			rootLevel--
		}
	}

	private async applyLeaf(firstChild: Key, operation: Operation): Promise<Result> {
		this.log("applyLeaf(%k, { %s %h })", firstChild, operation.type, operation.key)
		if (operation.type === "set") {
			const { key, value } = operation
			const hash = hashEntry(key, value, { K: this.K })
			await this.setNode({ level: 0, key, hash, value })

			if (lessThan(firstChild, key)) {
				if (isSplit(hash, { Q: this.Q })) {
					this.newSiblings.push(key)
				}

				return Result.Update
			} else if (equalKeys(firstChild, key)) {
				if (firstChild === null || isSplit(hash, { Q: this.Q })) {
					return Result.Update
				} else {
					return Result.Delete
				}
			} else {
				throw new Error("invalid database")
			}
		} else if (operation.type === "delete") {
			const { key } = operation
			await this.db.del(createEntryKey(0, key), encodingOptions)
			if (equalKeys(key, firstChild)) {
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

	private async *range(level: number, key: Key): AsyncIterable<Node> {
		const iter = await this.db.iterator<Uint8Array, Uint8Array>({
			gte: createEntryKey(level, key),
			...encodingOptions,
		})

		try {
			let entry = await iter.next()
			if (entry === undefined) {
				throw new Error("Node not found")
			}

			let node = entryToNode(entry, { K: this.K })
			if (node.level !== level || !equalKeys(key, node.key)) {
				throw new Error("Not not found")
			}

			yield node

			while (true) {
				entry = await iter.next()
				assert(entry !== undefined)
				if (isHeaderEntry(entry)) {
					break
				}

				node = entryToNode(entry, { K: this.K })
				if (node.level !== level || isSplit(node.hash, { Q: this.Q })) {
					break
				}

				yield node
			}
		} finally {
			await iter.close()
		}
	}

	private async findTarget(level: number, firstChild: Key, key: Uint8Array): Promise<Key> {
		let target: Node | undefined = undefined

		for await (const node of this.range(level, firstChild)) {
			if (lessThan(key, node.key)) {
				break
			} else {
				target = node
			}
		}

		assert(target !== undefined)
		return target.key
	}

	// deletes the target key and moves backwards until it finds a new one.
	private async moveToPreviousChild(level: number, target: Key): Promise<Key> {
		this.log("moveToPreviousChild(%d, %k)", level, target)

		assert(level > 0)

		const targetEntryKey = createEntryKey(level, target)

		this.log("deleting %h", targetEntryKey)
		await this.db.del(targetEntryKey, encodingOptions)

		for await (const previousChildEntryKey of this.db.keys({ lt: targetEntryKey, reverse: true })) {
			this.log("previousChildEntryKey: %h", previousChildEntryKey)
			const previousChildKey = parseNodeKey(previousChildEntryKey)

			if (previousChildKey === null) {
				return null
			}

			const previousGrandChild = await this.getNode(level - 1, previousChildKey)
			if (previousGrandChild !== null && isSplit(previousGrandChild.hash, { Q: this.Q })) {
				return previousChildKey
			}

			this.log("deleting %h", previousChildEntryKey)
			await this.db.del(previousChildEntryKey, encodingOptions)
		}

		throw new Error("internal error")
	}

	// Computes and sets the hash of the given node.
	// Doesn't assume anything about the current cursor position.
	// Returns isSplit for the updated hash.
	private async hashNode(level: number, key: Key): Promise<boolean> {
		this.log("hashing %d %k", level, key)

		const hash = blake3.create({ dkLen: K })
		for await (const node of this.range(level - 1, key)) {
			this.log("------- %h (%k)", node.hash, node.key)
			hash.update(node.hash)
		}

		const node: Node = { level, key, hash: hash.digest() }
		this.log("------- %h", node.hash)
		await this.setNode(node)
		return isSplit(node.hash, { Q: this.Q })
	}

	private async setNode(node: Node): Promise<void> {
		const [key, value] = nodeToEntry(node, { K: this.K })
		this.log("setting %h -> %h", key, value)
		await this.db.put(key, value, encodingOptions)
	}

	private async getLastNode(level: number): Promise<Node> {
		const iter = this.db.iterator<Uint8Array, Uint8Array>({
			lt: createEntryKey(level + 1, null),
			reverse: true,
			...encodingOptions,
		})

		const last = await iter.next()
		assert(last)

		const node = entryToNode(last, { K: this.K })
		assert(node.level === level)

		return node
	}

	private log(format: string, ...args: any[]) {
		this.formatter("%s" + format, Tree.indent.repeat(this.depth), ...args)
	}

	/**
	 * Get the root node of the merkle tree. Returns the leaf anchor node if the tree is empty.
	 */
	public async getRoot(): Promise<Node> {
		const iter = this.db.iterator<Uint8Array, Uint8Array>({
			lte: HEADER_KEY,
			reverse: true,
			...encodingOptions,
		})

		const headerEntry = await iter.next()
		assert(headerEntry !== undefined && isHeaderEntry(headerEntry))

		const rootEntry = await iter.next()
		assert(rootEntry !== undefined)

		const root = entryToNode(rootEntry, { K: this.K })
		assert(root.key === null)

		return root
	}

	/**
	 * Get the children of a node in the merkle tree, identified by level and key.
	 */
	public async getChildren(level: number, key: Key): Promise<Node[]> {
		if (level === 0) {
			throw new RangeError("Cannot get children of a leaf node")
		}

		const children: Node[] = []

		for await (const node of this.range(level - 1, key)) {
			children.push(node)
		}

		return children
	}

	/**
	 * Get a specific node in the merkle tree, identified by level and key.
	 */
	public async getNode(level: number, key: Key): Promise<Node | null> {
		const entryKey = createEntryKey(level, key)
		const entryValue = await Tree.get(this.db, entryKey)
		if (entryValue === null) {
			return null
		}

		return entryToNode([entryKey, entryValue], { K: this.K })
	}

	/**
	 * Iterate over the differences between the entries in the local tree and a remote source.
	 */
	public async *delta(source: Source): AsyncGenerator<Delta, void, undefined> {
		const driver = new Driver(source, this)
		yield* driver.delta()
	}

	public async copy(source: Source): Promise<void> {
		for await (const delta of this.delta(source)) {
			if (delta.source === null) {
				await this.delete(delta.key)
			} else {
				await this.set(delta.key, delta.source)
			}
		}
	}

	public async pull(source: Source): Promise<void> {
		for await (const delta of this.delta(source)) {
			if (delta.source === null) {
				continue
			} else if (delta.target === null) {
				await this.set(delta.key, delta.source)
			} else {
				throw new ModuleError("Conflict", { code: "OKRA_CONFLICT" })
			}
		}
	}

	public async merge(
		source: Source,
		arbiter: (key: Uint8Array, source: Uint8Array, target: Uint8Array) => Uint8Array | Promise<Uint8Array>
	): Promise<void> {
		for await (const delta of this.delta(source)) {
			if (delta.source === null) {
				continue
			} else if (delta.target === null) {
				await this.set(delta.key, delta.source)
			} else {
				const value = await arbiter(delta.key, delta.source, delta.target)
				await this.set(delta.key, value)
			}
		}
	}

	/**
	 * Raze and rebuild the merkle tree from the leaves.
	 * @returns the new root node
	 */
	public async rebuild(): Promise<Node> {
		const iter = this.db.keys({ gte: createEntryKey(1, null), lt: HEADER_KEY })
		for await (const key of iter) {
			await this.db.del(key, encodingOptions)
		}

		const builder = await Builder.open(this.db, { K: this.K, Q: this.Q })
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
					yield encoder.encode(`|\n`)
				} else {
					yield encoder.encode(`| ${hex(node.key)}\n`)
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