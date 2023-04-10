import { Tree } from "./tree.js"
import { Node, Key } from "./nodes.js"
import { debug } from "./format.js"
import {
	assert,
	createEntryKey,
	encodingOptions,
	entryToNode,
	equalArrays,
	equalKeys,
	equalNodes,
	lessThan,
} from "./utils.js"
import { LEAF_LIMIT } from "./constants.js"
import { AbstractIterator } from "abstract-level"

export interface Source {
	getRoot(): Promise<Node>
	getNode(level: number, key: Key): Promise<Node | null>
	getChildren(level: number, key: Key): Promise<Node[]>
	seek(level: number, key: Key): Promise<Node | null>
}

export type Delta = { key: Uint8Array; source: Uint8Array | null; target: Uint8Array | null }

export async function* sync<TFormat, KDefault, VDefault>(
	source: Source,
	target: Tree<TFormat, KDefault, VDefault>
): AsyncGenerator<Delta, void, undefined> {
	const driver = new Driver(source, target)
	yield* driver.sync()
}

class Driver<TFormat, KDefault, VDefault> {
	private static indent = "| "

	private depth = 0
	private formatter = debug("okra:sync")
	private leafCursor: Key = null

	constructor(readonly source: Source, readonly target: Tree<TFormat, KDefault, VDefault>) {}

	private log(format: string, ...args: any[]) {
		this.formatter("%s" + format, Driver.indent.repeat(this.depth), ...args)
	}

	public async *sync(): AsyncGenerator<Delta, void, undefined> {
		const sourceRoot = await this.source.getRoot()
		const targetRoot = await this.target.getRoot()

		this.log("DELTA")
		this.depth += 1
		this.log("source root: %n", sourceRoot)
		this.log("target root: %n", targetRoot)
		if (sourceRoot.level === 0) {
			this.log("skipping sync because source is emtpy")
			return
		} else if (equalNodes(sourceRoot, targetRoot)) {
			this.log("source and target roots are equal")
			return
		} else {
			yield* this.syncRoot(targetRoot.level, sourceRoot, null)
		}
	}

	async *syncRoot(targetLevel: number, sourceNode: Node, sourceLimit: Key): AsyncGenerator<Delta, void, undefined> {
		this.log("syncRoot")
		this.depth += 1

		this.log("target level: %d", targetLevel)
		this.log("source node: %n", sourceNode)

		try {
			if (sourceNode.level > targetLevel) {
				const sourceChildren = await this.source.getChildren(sourceNode.level, sourceNode.key)
				if (targetLevel === 0 && sourceNode.level === 1) {
					for (const { level, key, value } of sourceChildren) {
						if (key !== null) {
							assert(level === 0 && value !== undefined)
							this.log("YIELDING %k: source = %h, target = null", key, value)
							yield { key, source: value, target: null }
						}
					}
				} else {
					for (const [i, sourceChild] of sourceChildren.entries()) {
						const sourceChildLimit = i === sourceChildren.length - 1 ? sourceLimit : sourceChildren[i + 1].key
						yield* this.syncRoot(targetLevel, sourceChild, sourceChildLimit)
					}
				}
			} else {
				yield* this.syncNode(sourceNode, sourceLimit)
			}
		} finally {
			this.depth -= 1
		}
	}

	async *syncNode(sourceNode: Node, sourceLimit: Key): AsyncGenerator<Delta, void, undefined> {
		this.log("syncNode")
		this.depth += 1

		try {
			this.log("source node: %n", sourceNode)
			const targetNode = await this.target.seek(sourceNode.level, sourceNode.key)
			if (targetNode !== null) {
				this.log("target node: %n", targetNode)
			} else {
				this.log("target node: null", targetNode)
			}

			// yield the missing entries
			if (lessThan(this.leafCursor, sourceNode.key)) {
				this.log("target leaf cursor is behind source node key.")
				this.log("yielding missing entries...")
				const targetIter = this.target.db.iterator<Uint8Array, Uint8Array>({
					gte: createEntryKey(0, this.leafCursor),
					lt: createEntryKey(0, sourceNode.key),
					...encodingOptions,
				})

				for await (const entry of targetIter) {
					const targetLeaf = entryToNode(entry, { K: this.target.K })
					assert(targetLeaf.level == 0 && targetLeaf.key !== null && targetLeaf.value !== undefined)
					yield { key: targetLeaf.key, source: null, target: targetLeaf.value }
				}

				this.leafCursor = sourceNode.key
			}

			assert(equalKeys(this.leafCursor, sourceNode.key))

			if (targetNode !== null && equalNodes(sourceNode, targetNode)) {
				this.log("skipping subtree")
				this.leafCursor = sourceLimit
				return
			}

			if (sourceNode.level > 1) {
				const sourceChildren = await this.source.getChildren(sourceNode.level, sourceNode.key)
				for (const [i, sourceChild] of sourceChildren.entries()) {
					const sourceChildLimit = i === sourceChildren.length - 1 ? sourceLimit : sourceChildren[i + 1].key
					yield* this.syncNode(sourceChild, sourceChildLimit)
				}
			} else if (targetNode === null) {
				const sourceChildren = await this.source.getChildren(sourceNode.level, sourceNode.key)
				for (const sourceLeaf of sourceChildren) {
					if (sourceLeaf.key === null) {
						continue
					}

					assert(sourceLeaf.level === 0 && sourceLeaf.value !== undefined)
					yield { key: sourceLeaf.key, source: sourceLeaf.value, target: null }
				}
			} else if (sourceNode.level === 1) {
				yield* this.syncLeaf(sourceNode, sourceLimit)
			}
		} finally {
			this.depth -= 1
		}
	}

	private async next<T>(iter: AbstractIterator<T, Uint8Array, Uint8Array>): Promise<Node | null> {
		const entry = await iter.next()
		if (entry === undefined) {
			return null
		} else {
			return entryToNode(entry, { K: this.target.K })
		}
	}

	private async *syncLeaf(sourceNode: Node, sourceLimit: Key): AsyncGenerator<Delta, void, undefined> {
		assert(sourceNode.level === 1)

		const sourceChildren = await this.source.getChildren(sourceNode.level, sourceNode.key)

		this.log("yielding missing entries via explicit leaf iteration")

		const targetIter = this.target.db.iterator<Uint8Array, Uint8Array>({
			gte: createEntryKey(0, sourceNode.key),
			lt: sourceLimit === null ? LEAF_LIMIT : createEntryKey(0, sourceLimit),
			...encodingOptions,
		})

		try {
			let targetLeaf = await this.next(targetIter)

			for (const sourceLeaf of sourceChildren) {
				if (sourceLeaf.key === null) {
					continue
				}

				assert(sourceLeaf.level === 0 && sourceLeaf.value !== undefined)

				// advance if necessary
				while (targetLeaf !== null && lessThan(targetLeaf.key, sourceLeaf.key)) {
					if (targetLeaf.key !== null) {
						assert(targetLeaf.value !== undefined)
						yield { key: targetLeaf.key, source: null, target: targetLeaf.value }
					}

					targetLeaf = await this.next(targetIter)
				}

				if (targetLeaf === null || lessThan(sourceLeaf.key, targetLeaf.key)) {
					this.log("YIELDING %k: source = %h, target = null", sourceLeaf.key, sourceLeaf.value)
					yield { key: sourceLeaf.key, source: sourceLeaf.value, target: null }
				} else {
					assert(equalKeys(sourceLeaf.key, targetLeaf.key))
					if (equalArrays(sourceLeaf.hash, targetLeaf.hash)) {
						continue
					} else {
						assert(targetLeaf.value !== undefined)
						this.log("YIELDING %k: source = %h, target = %h", sourceLeaf.key, sourceLeaf.value, targetLeaf.value)
						yield { key: sourceLeaf.key, source: sourceLeaf.value, target: targetLeaf.value }
					}
				}
			}

			this.log("done yielding leaves")
			this.leafCursor = sourceLimit
		} finally {
			await targetIter.close()
		}
	}
}
