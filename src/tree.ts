import { blake3 } from "@noble/hashes/blake3"
import { bytesToHex } from "@noble/hashes/utils"

import { AbstractLevel, AbstractBatchOperation } from "abstract-level"
// import ModuleError from "module-error"

import debug from "debug"
debug.formatters.h = bytesToHex
debug.formatters.k = (key: Key) => (key ? bytesToHex(key) : "null")

import { Key, Node, entryToNode, nodeToEntry, createEntryKey, parseNodeValue, parseNodeKey } from "./schema.js"
import { assert, equalArrays, equalKeys, hashEntry, isSplit, lessThan, K, Q, getLeafAnchorHash } from "./utils.js"
import { HEADER_KEY, getHeader, isHeaderEntry } from "./header.js"

type Operation = AbstractBatchOperation<any, Uint8Array, Uint8Array>

// we have enums at home
const Result = { Update: 0, Delete: 1 } as const
type Result = typeof Result[keyof typeof Result]

async function get(db: AbstractLevel<any, Uint8Array, Uint8Array>, key: Uint8Array): Promise<Uint8Array | null> {
	try {
		return await db.get(key)
	} catch (err: any) {
		// TODO: switch to `err instanceof ModuleError` when memory-level fixes their shit
		if (err.code === "LEVEL_NOT_FOUND") {
			return null
		} else {
			throw err
		}
	}
}

export class Tree {
	private static indent = "  "
	private depth = 0
	private newSiblings: Key[] = []

	public static async open(
		db: AbstractLevel<any, Uint8Array, Uint8Array>,
		options: { K?: number; Q?: number; log?: (format: string, ...args: any[]) => void } = {}
	): Promise<Tree> {
		const k = options.K ?? K
		const q = options.Q ?? Q

		const header = await get(db, HEADER_KEY)
		if (header === null) {
			await db.put(HEADER_KEY, getHeader({ K: K, Q: q }))
			await db.put(createEntryKey(0, null), getLeafAnchorHash({ K: k }))
		} else if (!equalArrays(header, getHeader({ K: K, Q: q }))) {
			throw new Error("Invalid header")
		}

		return new Tree(db, k, q, options.log ?? debug("okra:tree"))
	}

	constructor(
		private readonly db: AbstractLevel<any, Uint8Array, Uint8Array>,
		private readonly K: number,
		private readonly Q: number,
		private readonly print: (format: string, ...args: any[]) => void
	) {}

	public async close() {
		await this.db.close()
	}

	private log(format: string, ...args: any[]) {
		this.print("%s" + format, Tree.indent.repeat(this.depth), ...args)
	}

	public async get(key: Uint8Array): Promise<Uint8Array | null> {
		const entryKey = createEntryKey(0, key)
		const entryValue = await get(this.db, entryKey)
		return entryValue && parseNodeValue(entryValue, { K: this.K })
	}

	public async getRoot(): Promise<Node> {
		const iter = this.db.iterator({ lte: HEADER_KEY, reverse: true })

		const headerEntry = await iter.next()
		assert(headerEntry !== undefined && isHeaderEntry(headerEntry))

		const rootEntry = await iter.next()
		assert(rootEntry !== undefined)

		const root = entryToNode(rootEntry, { K: this.K })
		assert(root.key === null)

		return root
	}

	public async getNode(level: number, key: Key): Promise<Node | null> {
		const entryKey = createEntryKey(level, key)
		const entryValue = await get(this.db, entryKey)
		if (entryValue === null) {
			return null
		}

		return entryToNode([entryKey, entryValue], { K: this.K })
	}

	public async set(key: Uint8Array, value: Uint8Array): Promise<void> {
		this.log(`set(%h, %h)`, key, value)
		await this.apply({ type: "put", key, value })
	}

	public async delete(key: Uint8Array): Promise<void> {
		this.log(`delete(%h)`, key)
		await this.apply({ type: "del", key })
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
			await this.db.del(rootEntryKey)

			rootLevel--
		}
	}

	private async applyLeaf(firstChild: Key, operation: Operation): Promise<Result> {
		this.log("applyLeaf(%k, { %s %h })", firstChild, operation.type, operation.key)
		if (operation.type === "put") {
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
		} else if (operation.type === "del") {
			const { key } = operation
			await this.db.del(createEntryKey(0, key))
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
		const iter = await this.db.iterator({ gte: createEntryKey(level, key) })
		try {
			let entry = await iter.next()
			assert(entry !== undefined)

			let node = entryToNode(entry, { K: this.K })
			assert(node.level === level && equalKeys(key, node.key))

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
		await this.db.del(targetEntryKey)

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
			await this.db.del(previousChildEntryKey)
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
		await this.db.put(key, value)
	}

	private async getLastNode(level: number): Promise<Node> {
		const iter = this.db.iterator({ lt: createEntryKey(level + 1, null), reverse: true })
		const last = await iter.next()
		assert(last)

		const node = entryToNode(last, { K: this.K })
		assert(node.level === level)

		return node
	}
}
