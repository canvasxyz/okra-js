import { equals } from "uint8arrays"
import { assert } from "@canvas-js/utils"

import { Node, Key, SyncSource, ReadOnlyTransaction, Delta, Bound } from "../interface.js"
import { logger } from "../logger.js"
import { equalKeys, equalNodes, compareKeys } from "../utils.js"

export class Driver {
	private static indent = "│ "

	private depth = 0
	private formatter = logger("okra:sync")

	/**
	 * Syncing progresses from left to right and is tracked by a `cursor: Bound<Key>`
	 * in the target tree range, which starts at `{ key: null, inclusive: false }`.
	 * The cursor is advanced in three ways:
	 * 1. identifying and skipping a common subtree, which sets the cursor to an
	 *    inclusive bound at the first target key after the end of the subtree range,
	 *    or `null` if there are no more nodes at that level.
	 * 2. the `advance` method, which is called at the end of every `syncNodes` and
	 *    yields deltas for any remaining target entries between the current cursor
	 *    and the start of the next source node (`sourceUpperBound`). `advance` sets
	 *    the cursor to `sourceUpperBound` or `null` if there are no more leaf nodes.
	 * 3. `syncLeaves`, which
	 */
	private cursor: Bound<Key> | null = null

	constructor(
		private readonly source: SyncSource,
		private readonly target: ReadOnlyTransaction,
	) {}

	private log(format: string, ...args: any[]) {
		this.formatter("%s" + format, Driver.indent.repeat(this.depth), ...args)
	}

	public async *sync(): AsyncGenerator<Delta, void, undefined> {
		const [sourceRoot, targetRoot] = await Promise.all([this.source.getRoot(), this.target.getRoot()])

		this.log("DELTA")
		this.depth += 1
		this.log("source root: %n", sourceRoot)
		this.log("target root: %n", targetRoot)
		if (equalNodes(sourceRoot, targetRoot)) {
			return
		}

		this.cursor = { key: null, inclusive: false }
		if (sourceRoot.level > 0) {
			yield* this.syncRoots(sourceRoot, null, targetRoot)
		}

		yield* this.advance(null)
	}

	/**
	 * The purpose of `syncRoots` is to align the entrypoints of the two trees.
	 * If the target tree's root level is less than the source tree's root level,
	 * we treat all of the nodes the source tree at the target root level as
	 * separate roots and call this.syncNodes with them all one by one.
	 */
	async *syncRoots(
		sourceNode: Node,
		sourceUpperBound: Bound<Key> | null,
		targetRoot: Node,
	): AsyncGenerator<Delta, void, undefined> {
		this.log("syncRoot")
		this.depth += 1

		this.log("source node: %n", sourceNode)
		this.log("target root: %n", targetRoot)
		assert(targetRoot.key === null)

		if (sourceNode.level === 1 && targetRoot.level === 0) {
			const sourceChildren = await this.source.getChildren(sourceNode.level, sourceNode.key)
			for (const { key, value: sourceValue } of sourceChildren) {
				if (key === null) {
					continue
				}

				assert(sourceValue !== undefined, "invalid leaf node")
				yield { key, source: sourceValue, target: null }
			}
		} else if (sourceNode.level > targetRoot.level) {
			const sourceChildren = await this.source.getChildren(sourceNode.level, sourceNode.key)
			for (const [sourceChild, sourceChildUpperBound] of withUpperBounds(sourceChildren, sourceUpperBound)) {
				yield* this.syncRoots(sourceChild, sourceChildUpperBound, targetRoot)
			}
		} else {
			yield* this.syncNodes(sourceNode, sourceUpperBound)
		}

		this.depth -= 1
	}

	async *syncNodes(sourceNode: Node, sourceUpperBound: Bound<Key> | null): AsyncGenerator<Delta, void, undefined> {
		this.log("syncNode")
		this.depth += 1

		const targetNode = await this.target.getNode(sourceNode.level, sourceNode.key)
		this.log("source node: %n", sourceNode)
		this.log("target node: %n", targetNode)

		if (targetNode !== null && equals(targetNode.hash, sourceNode.hash)) {
			this.log("skipping subtree")

			const nextSibling = await this.getNextSibling(targetNode.level, targetNode.key)
			if (nextSibling === null) {
				this.cursor = null
			} else {
				this.cursor = { key: nextSibling.key, inclusive: true }
			}
		} else if (sourceNode.level === 1) {
			yield* this.syncLeaves(sourceNode, sourceUpperBound)
		} else {
			const sourceChildren = await this.source.getChildren(sourceNode.level, sourceNode.key)
			for (const [sourceChild, sourceChildUpperBound] of withUpperBounds(sourceChildren, sourceUpperBound)) {
				yield* this.syncNodes(sourceChild, sourceChildUpperBound)
			}
		}

		yield* this.advance(sourceUpperBound)
		this.depth -= 1
	}

	private async *syncLeaves(
		sourceNode: Node,
		sourceUpperBound: Bound<Key> | null,
	): AsyncGenerator<Delta, void, undefined> {
		assert(sourceNode.level === 1)
		this.log("yielding missing entries via explicit leaf iteration")

		const sourceChildren = await this.source.getChildren(sourceNode.level, sourceNode.key)
		const iter = this.target.nodes(0, { key: sourceNode.key, inclusive: true }, sourceUpperBound)
		let targetLeaf: Node | null = null
		try {
			targetLeaf = next(iter)
			for (const sourceLeaf of sourceChildren) {
				this.log("- got source leaf: %n", sourceLeaf)
				this.log("- got target leaf: %n", targetLeaf)

				if (sourceLeaf.key === null) {
					continue
				}

				assert(sourceLeaf.level === 0 && sourceLeaf.value !== undefined)

				// advance the target leaf if necessary
				while (targetLeaf !== null && compareKeys(targetLeaf.key, sourceLeaf.key) === -1) {
					if (targetLeaf.key !== null) {
						assert(targetLeaf.value !== undefined)
						yield { key: targetLeaf.key, source: null, target: targetLeaf.value }
					}

					targetLeaf = next(iter)
					this.log("- new target leaf: %n", targetLeaf)
				}

				if (targetLeaf === null || compareKeys(sourceLeaf.key, targetLeaf.key) === -1) {
					yield { key: sourceLeaf.key, source: sourceLeaf.value, target: null }
				} else {
					assert(equalKeys(sourceLeaf.key, targetLeaf.key), "expected sourceLeaf.key = targetLeaf.key")
					if (!equals(sourceLeaf.hash, targetLeaf.hash)) {
						assert(targetLeaf.value !== undefined)
						yield { key: sourceLeaf.key, source: sourceLeaf.value, target: targetLeaf.value }
					}

					targetLeaf = next(iter)
				}
			}
		} finally {
			if (targetLeaf !== null && iter.return !== undefined) {
				await iter.return()
			}
		}

		this.log("done yielding leaves")
		if (targetLeaf === null) {
			this.cursor = sourceUpperBound
		} else {
			this.cursor = { key: targetLeaf.key, inclusive: targetLeaf.key !== null }
		}

		this.log("moved cursor to %b", this.cursor)
	}

	private async getNextSibling(level: number, key: Key): Promise<Node | null> {
		for await (const node of this.target.nodes(level, { key, inclusive: false })) {
			return node
		}

		return null
	}

	private async *advance(sourceUpperBound: Bound<Key> | null): AsyncGenerator<Delta, void, undefined> {
		if (this.cursor === null) {
			return
		}

		for await (const { key, value: targetValue } of this.target.nodes(0, this.cursor, sourceUpperBound)) {
			assert(key !== null && targetValue !== undefined, "invalid leaf node")
			yield { key, source: null, target: targetValue }
		}

		this.cursor = sourceUpperBound
	}
}

/**
 * Unwrap an `IteratorResult<T>` into `T | null`
 */
const next = <T>(iter: Iterator<T, void, undefined>) => {
	const { done, value } = iter.next()
	return done ? null : value
}

/**
 * Zips each node with an exclusive upper bound for the next node in `nodes`,
 * or the given `upperBound` for the last element.
 */
function* withUpperBounds(nodes: Node[], upperBound: Bound<Key> | null): Generator<[Node, Bound<Key> | null]> {
	for (const [i, node] of nodes.entries()) {
		if (i === nodes.length - 1) {
			yield [node, upperBound]
		} else {
			yield [node, { key: nodes[i + 1].key, inclusive: false }]
		}
	}
}
