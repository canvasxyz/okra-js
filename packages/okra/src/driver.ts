import { Node, Key, Source, Target, Delta, Bound } from "./interface.js"

import { debug } from "./format.js"
import { assert, equalArrays, equalKeys, equalNodes, isInRange, lessThan } from "./utils.js"

/**
 * Unwrap an `IteratorResult<T>` into `T | null`
 */
const next = <T>(iter: AsyncIterator<T, void, undefined>) =>
	iter.next().then(({ done, value }) => (done ? null : value))

/**
 * Return an exclusive upper bound for the next node in `nodes` after `index`,
 * or the given `upperBound` if `nodes[index]` is the last element.
 */
function getUpperBound(nodes: Node[], index: number, upperBound: Bound<Uint8Array> | null): Bound<Uint8Array> | null {
	if (index === nodes.length - 1) {
		return upperBound
	} else {
		const node = nodes[index + 1]
		assert(node !== undefined, "next node not found")
		assert(node.key !== null, "next node key was not null")
		return { key: node.key, inclusive: false }
	}
}

export class Driver {
	private static indent = "│ "

	private depth = 0
	private formatter = debug("okra:sync")

	/**
	 * Syncing progresses from left to right, starting at the `null` anchor key.
	 * `cursor` is a pointer in the target tree range that is advanced in two ways:
	 * 1. identifying and skipping a common subtree, which sets cursor to an
	 *    inclusive bound at the first target key after the end of the subtree range.
	 * 2.
	 */
	private cursor: Bound<Key> | null = null

	constructor(readonly source: Source, readonly target: Target) {}

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
		if (equalNodes(sourceRoot, targetRoot)) {
			return
		}

		this.cursor = { key: null, inclusive: false }
		if (sourceRoot.level > 0) {
			yield* this.syncRoots(targetRoot, sourceRoot, null)
		}

		yield* this.range(null)
	}

	/**
	 * The purpose of `syncRoots` is to align the entrypoints of the two trees.
	 * If the target tree's root level is less than the source tree's root level,
	 * we treat all of the nodes the source tree at the target root level as separete
	 * roots and sync them all individually.
	 */
	async *syncRoots(
		targetRoot: Node,
		sourceNode: Node,
		sourceUpperBound: Bound<Uint8Array> | null
	): AsyncGenerator<Delta, void, undefined> {
		this.log("syncRoot")
		this.depth += 1

		this.log("source node: %n", sourceNode)
		this.log("target root: %n", targetRoot)
		assert(targetRoot.key === null)

		try {
			if (sourceNode.level > targetRoot.level) {
				const sourceChildren = await this.source.getChildren(sourceNode.level, sourceNode.key)
				if (targetRoot.level === 0 && sourceNode.level === 1) {
					for (const { key, value: sourceValue } of sourceChildren) {
						if (key === null) {
							continue
						}

						assert(sourceValue !== undefined, "invalid leaf node")
						yield { key, source: sourceValue, target: null }
					}
				} else {
					for (const [i, sourceChild] of sourceChildren.entries()) {
						const sourceChildUpperBound = getUpperBound(sourceChildren, i, sourceUpperBound)
						yield* this.syncRoots(targetRoot, sourceChild, sourceChildUpperBound)
					}
				}
			} else {
				yield* this.syncNodes(sourceNode, sourceUpperBound)
			}
		} finally {
			this.depth -= 1
		}
	}

	async *syncNodes(
		sourceNode: Node,
		sourceUpperBound: Bound<Uint8Array> | null
	): AsyncGenerator<Delta, void, undefined> {
		this.log("syncNode")
		this.depth += 1

		try {
			const targetNode = await this.target.getNode(sourceNode.level, sourceNode.key)
			this.log("source node: %n", sourceNode)
			this.log("target node: %n", targetNode)

			if (targetNode !== null && equalNodes(sourceNode, targetNode)) {
				this.log("skipping subtree")

				const lowerBound = { key: targetNode.key, inclusive: false }
				for await (const { key } of this.target.nodes(targetNode.level, lowerBound)) {
					this.cursor = { key, inclusive: true }
					this.log("moved cursor to %b", this.cursor)
					return
				}

				this.cursor = null
				this.log("moved cursor to %b", this.cursor)
				return
			}

			if (sourceNode.level > 1) {
				const sourceChildren = await this.source.getChildren(sourceNode.level, sourceNode.key)
				for (const [i, sourceChild] of sourceChildren.entries()) {
					const sourceChildUpperBound = getUpperBound(sourceChildren, i, sourceUpperBound)
					yield* this.syncNodes(sourceChild, sourceChildUpperBound)
				}
			} else {
				yield* this.syncLeaves(sourceNode, sourceUpperBound)
			}
		} finally {
			yield* this.range(sourceUpperBound)
			this.depth -= 1
		}
	}

	private async *syncLeaves(
		sourceNode: Node,
		sourceUpperBound: Bound<Uint8Array> | null
	): AsyncGenerator<Delta, void, undefined> {
		assert(sourceNode.level === 1)

		const sourceChildren = await this.source.getChildren(sourceNode.level, sourceNode.key)

		this.log("yielding missing entries via explicit leaf iteration")

		const lowerBound = { key: sourceNode.key, inclusive: true }
		const targetNodes = this.target.nodes(0, lowerBound, sourceUpperBound)

		try {
			let targetLeaf = await next(targetNodes)

			for (const sourceLeaf of sourceChildren) {
				this.log("- got source leaf: %n", sourceLeaf)
				this.log("- got target leaf: %n", targetLeaf)

				if (sourceLeaf.key === null) {
					continue
				}

				assert(sourceLeaf.level === 0 && sourceLeaf.value !== undefined)

				// advance if necessary
				while (targetLeaf !== null && lessThan(targetLeaf.key, sourceLeaf.key)) {
					if (targetLeaf.key !== null) {
						assert(targetLeaf.value !== undefined)
						// assert(targetLeaf.key !== null && targetLeaf.value !== undefined)
						yield { key: targetLeaf.key, source: null, target: targetLeaf.value }
					}

					targetLeaf = await next(targetNodes)
					this.log("- new target leaf: %n", targetLeaf)
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

			this.log("done yielding leaves")
			this.cursor = targetLeaf ? { key: targetLeaf.key, inclusive: targetLeaf.key !== null } : sourceUpperBound
			this.log("moved cursor to %b", this.cursor)
		} finally {
			// the node iterator might have cleanup work to do
			await targetNodes.return?.()
		}
	}

	private async *range(sourceUpperBound: Bound<Uint8Array> | null): AsyncGenerator<Delta, void, undefined> {
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
