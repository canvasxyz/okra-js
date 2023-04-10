import { Tree } from "./tree.js"
import { Node, Key, Source, Delta } from "./types.js"
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

import { AbstractIterator } from "abstract-level"

export class Driver<TFormat, KDefault, VDefault> {
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
			yield* this.syncRoot(targetRoot, sourceRoot, null)
			if (this.leafCursor !== null) {
				const targetIter = this.target.db.iterator<Uint8Array, Uint8Array>({
					gte: createEntryKey(0, this.leafCursor),
					lt: createEntryKey(1, null),
					...encodingOptions,
				})

				for await (const entry of targetIter) {
					const targetLeaf = entryToNode(entry, { K: this.target.K })
					assert(targetLeaf.key !== null && targetLeaf.value !== undefined)
					yield { key: targetLeaf.key, source: null, target: targetLeaf.value }
				}
			}
		}
	}

	async *syncRoot(targetRoot: Node, sourceNode: Node, sourceLimit: Key): AsyncGenerator<Delta, void, undefined> {
		this.log("syncRoot")
		this.depth += 1

		this.log("target root: %n", targetRoot)
		this.log("source node: %n", sourceNode)
		assert(targetRoot.key === null)

		try {
			if (sourceNode.level > targetRoot.level) {
				const sourceChildren = await this.source.getChildren(sourceNode.level, sourceNode.key)
				if (targetRoot.level === 0 && sourceNode.level === 1) {
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
						yield* this.syncRoot(targetRoot, sourceChild, sourceChildLimit)
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
			const targetNode = await this.target.getNode(sourceNode.level, sourceNode.key)
			if (targetNode !== null) {
				this.log("target node: %n", targetNode)
			} else {
				this.log("target node: null", targetNode)
			}

			// yield the missing entries
			if (lessThan(this.leafCursor, sourceNode.key)) {
				this.log("target leaf cursor %k is behind source node key", this.leafCursor)
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
				this.log("set leaf cursor to %k", this.leafCursor)
			}

			if (targetNode !== null && equalNodes(sourceNode, targetNode)) {
				this.log("skipping subtree")

				const targetIter = this.target.db.iterator<Uint8Array, Uint8Array>({
					gt: createEntryKey(targetNode.level, targetNode.key),
					lt: createEntryKey(targetNode.level + 1, null),
					...encodingOptions,
				})

				try {
					const nextTargetNode = await this.next(targetIter)
					this.leafCursor = nextTargetNode && nextTargetNode.key
					this.log("set leaf cursor to %k", this.leafCursor)
					return
				} finally {
					await targetIter.close()
				}
			}

			if (sourceNode.level > 1) {
				const sourceChildren = await this.source.getChildren(sourceNode.level, sourceNode.key)
				for (const [i, sourceChild] of sourceChildren.entries()) {
					const sourceChildLimit = i === sourceChildren.length - 1 ? sourceLimit : sourceChildren[i + 1].key
					yield* this.syncNode(sourceChild, sourceChildLimit)
				}
				// } else if (targetNode === null) {
				// 	const sourceChildren = await this.source.getChildren(sourceNode.level, sourceNode.key)
				// 	for (const sourceLeaf of sourceChildren) {
				// 		if (sourceLeaf.key === null) {
				// 			continue
				// 		}

				// 		assert(sourceLeaf.level === 0 && sourceLeaf.value !== undefined)
				// 		yield { key: sourceLeaf.key, source: sourceLeaf.value, target: null }
				// 	}
			} else {
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
			lt: sourceLimit === null ? createEntryKey(1, null) : createEntryKey(0, sourceLimit),
			...encodingOptions,
		})

		try {
			let targetLeaf = await this.next(targetIter)

			for (const sourceLeaf of sourceChildren) {
				this.log("- got source leaf: %n", sourceLeaf)
				if (targetLeaf === null) {
					this.log("- got target leaf: null")
				} else {
					this.log("- got target leaf: %n", targetLeaf)
				}

				if (sourceLeaf.key === null) {
					continue
				}

				assert(sourceLeaf.level === 0 && sourceLeaf.value !== undefined)

				// advance if necessary
				while (targetLeaf !== null && lessThan(targetLeaf.key, sourceLeaf.key)) {
					if (targetLeaf.key !== null) {
						assert(targetLeaf.value !== undefined)
						this.log("YIELDING %k: source = null, target = %h", targetLeaf.key, targetLeaf.value)
						yield { key: targetLeaf.key, source: null, target: targetLeaf.value }
					}

					targetLeaf = await this.next(targetIter)
					if (targetLeaf === null) {
						this.log("- new target leaf: null")
					} else {
						this.log("- new target leaf: %n", targetLeaf)
					}
				}

				if (targetLeaf === null || lessThan(sourceLeaf.key, targetLeaf.key)) {
					this.log("YIELDING %k: source = %h, target = null", sourceLeaf.key, sourceLeaf.value)
					yield { key: sourceLeaf.key, source: sourceLeaf.value, target: null }
				} else {
					assert(equalKeys(sourceLeaf.key, targetLeaf.key))
					if (!equalArrays(sourceLeaf.hash, targetLeaf.hash)) {
						assert(targetLeaf.value !== undefined)
						this.log("YIELDING %k: source = %h, target = %h", sourceLeaf.key, sourceLeaf.value, targetLeaf.value)
						yield { key: sourceLeaf.key, source: sourceLeaf.value, target: targetLeaf.value }
					}

					targetLeaf = await this.next(targetIter)
				}
			}

			this.log("done yielding leaves")
			// this.log("setting leaf cursor to", sourceLimit)
			// this.leafCursor = sourceLimit
			this.leafCursor = targetLeaf === null ? sourceLimit : targetLeaf.key
			this.log("set leaf cursor to", this.leafCursor)
		} finally {
			await targetIter.close()
		}
	}
}
