import { Node, Key, Source, Target, Delta, Bound } from "./interface.js"

import { debug } from "./format.js"
import { assert, equalArrays, equalKeys, equalNodes, isInRange, lessThan } from "./utils.js"

const next = (iter: AsyncIterableIterator<Node>) => iter.next().then(({ done, value }) => (done ? null : value))

function getLimit(nodes: Node[], index: number, limit: Bound<Uint8Array> | null): Bound<Uint8Array> | null {
	if (index === nodes.length - 1) {
		return limit
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
	 * `targetCursor` is a pointer in the target tree range that is advanced in two ways:
	 * 1. identifying and skipping a common subtree, which sets targetCursor to an
	 *    inclusive bound at the first target key after the end of the subtree range.
	 * 2.
	 */
	private targetCursor: Bound<Key> | null = { key: null, inclusive: false }

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
			this.log("source and target roots are equal")
			return
		} else if (sourceRoot.level === 0) {
			this.log("skipping sync because source is emtpy")
			for await (const { key, value } of this.target.nodes(0, { key: null, inclusive: false })) {
				assert(key !== null && value !== undefined, "invalid leaf node")
				yield { key, source: null, target: value }
			}
		} else {
			yield* this.syncRoots(targetRoot, sourceRoot, null)
			if (this.targetCursor !== null) {
				for await (const { key, value } of this.target.nodes(0, this.targetCursor)) {
					assert(key !== null && value !== undefined, "invalid leaf node")
					yield { key, source: null, target: value }
				}
			}
		}
	}

	async *syncRoots(
		targetRoot: Node,
		sourceNode: Node,
		sourceLimit: Bound<Uint8Array> | null
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
						this.log("YIELDING %k: source = %h, target = null", key, sourceValue)
						yield { key, source: sourceValue, target: null }
					}
				} else {
					for (const [i, sourceChild] of sourceChildren.entries()) {
						yield* this.syncRoots(targetRoot, sourceChild, getLimit(sourceChildren, i, sourceLimit))
					}
				}
			} else {
				yield* this.syncNodes(sourceNode, sourceLimit)
			}
		} finally {
			this.depth -= 1
		}
	}

	async *syncNodes(sourceNode: Node, sourceLimit: Bound<Uint8Array> | null): AsyncGenerator<Delta, void, undefined> {
		this.log("syncNode")
		this.depth += 1

		try {
			const targetNode = await this.target.getNode(sourceNode.level, sourceNode.key)
			this.log("source node: %n", sourceNode)
			this.log("target node: %n", targetNode)

			// yield the missing entries
			if (this.targetCursor !== null && isInRange(sourceNode.key, this.targetCursor)) {
				this.log("source node key is in the target range")
				this.log("yielding missing entries...")

				const upperBound = { key: sourceNode.key, inclusive: false }
				for await (const { key, value: targetValue } of this.target.nodes(0, this.targetCursor, upperBound)) {
					assert(key !== null && targetValue !== undefined, "invalid leaf node")
					yield { key, source: null, target: targetValue }
				}

				this.targetCursor = { key: sourceNode.key, inclusive: true }
				this.log("set target bound to %b", this.targetCursor)
			}

			if (targetNode !== null && equalNodes(sourceNode, targetNode)) {
				this.log("skipping subtree")

				const lowerBound = { key: targetNode.key, inclusive: false }
				for await (const { key } of this.target.nodes(targetNode.level, lowerBound)) {
					this.targetCursor = { key, inclusive: true }
					this.log("set target bound to %b", this.targetCursor)
					return
				}

				this.targetCursor = null
				this.log("set target bound to null")
				return
			}

			if (sourceNode.level > 1) {
				const sourceChildren = await this.source.getChildren(sourceNode.level, sourceNode.key)
				for (const [i, sourceChild] of sourceChildren.entries()) {
					yield* this.syncNodes(sourceChild, getLimit(sourceChildren, i, sourceLimit))
				}
			} else {
				yield* this.syncLeaves(sourceNode, sourceLimit)
			}
		} finally {
			this.depth -= 1
		}
	}

	private async *syncLeaves(
		sourceNode: Node,
		sourceLimit: Bound<Uint8Array> | null
	): AsyncGenerator<Delta, void, undefined> {
		assert(sourceNode.level === 1)

		const sourceChildren = await this.source.getChildren(sourceNode.level, sourceNode.key)

		this.log("yielding missing entries via explicit leaf iteration")

		const lowerBound = { key: sourceNode.key, inclusive: true }
		const targetNodes = this.target.nodes(0, lowerBound, sourceLimit)

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
						this.log("YIELDING %k: source = null, target = %h", targetLeaf.key, targetLeaf.value)
						yield { key: targetLeaf.key, source: null, target: targetLeaf.value }
					}

					targetLeaf = await next(targetNodes)
					this.log("- new target leaf: %n", targetLeaf)
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

					targetLeaf = await next(targetNodes)
				}
			}

			this.log("done yielding leaves")
			this.targetCursor = targetLeaf ? { key: targetLeaf.key, inclusive: targetLeaf.key !== null } : sourceLimit
			this.log("set target bound to %b", this.targetCursor)
		} finally {
			await targetNodes.return?.()
		}
	}
}
