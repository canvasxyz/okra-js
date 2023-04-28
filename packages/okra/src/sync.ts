import { Node, Key, Source, Target, Delta } from "./interface.js"

import { assert, equalArrays, equalKeys, equalNodes, lessThan } from "./utils.js"

/**
 * Unwrap an `IteratorResult<T>` into `T | null`
 */
const next = <T>(iter: AsyncIterator<T, void, undefined>) =>
	iter.next().then(({ done, value }) => (done ? null : value))

/**
 * Return the key of the next node in `nodes` after `index`,
 * or `null` of the node is the last node.
 */
const getLimit = (nodes: Node[], index: number): Uint8Array | null =>
	index === nodes.length - 1 ? null : nodes[index + 1].key

class Driver {
	private leafCursor: Key = null

	constructor(readonly source: Source, readonly target: Target) {}

	public async *sync(): AsyncGenerator<Delta, void, undefined> {
		const sourceRoot = await this.source.getRoot()
		const targetRoot = await this.target.getRoot()

		if (equalNodes(sourceRoot, targetRoot)) {
			return
		} else if (sourceRoot.level === 0) {
			// If the source tree is empty, yield all of the target's leaf entries
			for await (const node of this.target.nodes(0, { key: null, inclusive: false })) {
				assert(node.key !== null && node.value !== undefined)
				yield { key: node.key, source: null, target: node.value }
			}
		} else {
			yield* this.syncRoots(targetRoot, sourceRoot, null)
			if (this.leafCursor !== null) {
				for await (const targetLeaf of this.target.nodes(0, { key: this.leafCursor, inclusive: true })) {
					assert(targetLeaf.key !== null && targetLeaf.value !== undefined)
					yield { key: targetLeaf.key, source: null, target: targetLeaf.value }
				}
			}
		}
	}

	/**
	 * The purpose of `syncRoots` is to align the entrypoints of the two trees.
	 * If the target tree's root level is less than the source tree's root level,
	 * we treat all of the nodes the source tree at the target root level as separete
	 * roots and sync them all individually.
	 */
	async *syncRoots(targetRoot: Node, sourceNode: Node, sourceLimit: Key): AsyncGenerator<Delta, void, undefined> {
		assert(targetRoot.key === null)

		if (sourceNode.level > targetRoot.level) {
			const sourceChildren = await this.source.getChildren(sourceNode.level, sourceNode.key)
			if (targetRoot.level === 0 && sourceNode.level === 1) {
				for (const { level, key, value } of sourceChildren) {
					if (key !== null) {
						assert(level === 0 && value !== undefined)
						yield { key, source: value, target: null }
					}
				}
			} else {
				for (const [i, sourceChild] of sourceChildren.entries()) {
					yield* this.syncRoots(targetRoot, sourceChild, getLimit(sourceChildren, i))
				}
			}
		} else {
			yield* this.syncNodes(sourceNode, sourceLimit)
		}
	}

	/**
	 * `syncNodes` is the central recursive method.
	 * It takes a source node and its limit, yields all of the deltas within that range,
	 * and returns
	 * @param sourceNode
	 * @param sourceLimit
	 * @returns
	 */
	async *syncNodes(sourceNode: Node, sourceLimit: Key): AsyncGenerator<Delta, void, undefined> {
		const targetNode = await this.target.getNode(sourceNode.level, sourceNode.key)

		// yield the missing entries
		if (lessThan(this.leafCursor, sourceNode.key)) {
			const lowerBound = { key: this.leafCursor, inclusive: true }
			const upperBound = { key: sourceNode.key, inclusive: false }
			for await (const targetLeaf of this.target.nodes(0, lowerBound, upperBound)) {
				if (targetLeaf.key === null) {
					continue
				}

				assert(targetLeaf.level == 0 && targetLeaf.value !== undefined)
				yield { key: targetLeaf.key, source: null, target: targetLeaf.value }
			}

			this.leafCursor = sourceNode.key
		}

		if (targetNode !== null && equalNodes(sourceNode, targetNode)) {
			const lowerBound = { key: targetNode.key, inclusive: false }
			for await (const nextTargetNode of this.target.nodes(targetNode.level, lowerBound)) {
				this.leafCursor = nextTargetNode.key
				return
			}

			this.leafCursor = null
			return
		}

		if (sourceNode.level > 1) {
			const sourceChildren = await this.source.getChildren(sourceNode.level, sourceNode.key)
			for (const [i, sourceChild] of sourceChildren.entries()) {
				yield* this.syncNodes(sourceChild, getLimit(sourceChildren, i))
			}
		} else {
			yield* this.syncLeaves(sourceNode, sourceLimit)
		}
	}

	private async *syncLeaves(sourceNode: Node, sourceLimit: Key): AsyncGenerator<Delta, void, undefined> {
		assert(sourceNode.level === 1)

		const sourceChildren = await this.source.getChildren(sourceNode.level, sourceNode.key)

		const lowerBound = { key: sourceNode.key, inclusive: true }
		const upperBound = sourceLimit && { key: sourceLimit, inclusive: false }
		const targetNodes = this.target.nodes(0, lowerBound, upperBound)

		try {
			let targetLeaf = await next(targetNodes)

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

					targetLeaf = await next(targetNodes)
				}

				if (targetLeaf === null || lessThan(sourceLeaf.key, targetLeaf.key)) {
					yield { key: sourceLeaf.key, source: sourceLeaf.value, target: null }
				} else {
					assert(equalKeys(sourceLeaf.key, targetLeaf.key))
					if (!equalArrays(sourceLeaf.hash, targetLeaf.hash)) {
						assert(targetLeaf.value !== undefined)
						yield { key: sourceLeaf.key, source: sourceLeaf.value, target: targetLeaf.value }
					}

					targetLeaf = await next(targetNodes)
				}
			}

			this.leafCursor = targetLeaf === null ? sourceLimit : targetLeaf.key
		} finally {
			// If our node iterator has cleanup work to do, trigger it
			await targetNodes.return?.()
		}
	}
}
