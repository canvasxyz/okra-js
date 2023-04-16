import { Node, Key, Source, Delta, NodeRange } from "./interface.js"
import { Tree } from "./tree.js"
import { debug } from "./format.js"
import { assert, equalArrays, equalKeys, equalNodes, lessThan } from "./utils.js"

const next = (iter: AsyncIterableIterator<Node>) => iter.next().then(({ done, value }) => (done ? null : value))

export class Driver {
	private static indent = "| "

	private depth = 0
	private formatter = debug("okra:sync")
	private leafCursor: Key = null

	constructor(readonly source: Source, readonly target: Tree) {}

	private log(format: string, ...args: any[]) {
		this.formatter("%s" + format, Driver.indent.repeat(this.depth), ...args)
	}

	public async *delta(): AsyncGenerator<Delta, void, undefined> {
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
			yield* this.deltaRoot(targetRoot, sourceRoot, null)
			if (this.leafCursor !== null) {
				const range: NodeRange = {
					level: 0,
					lowerBound: { key: this.leafCursor, inclusive: true },
				}

				for await (const targetLeaf of this.target.iterate(range)) {
					assert(targetLeaf.key !== null && targetLeaf.value !== undefined)
					yield { key: targetLeaf.key, source: null, target: targetLeaf.value }
				}
			}
		}
	}

	async *deltaRoot(targetRoot: Node, sourceNode: Node, sourceLimit: Key): AsyncGenerator<Delta, void, undefined> {
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
						yield* this.deltaRoot(targetRoot, sourceChild, sourceChildLimit)
					}
				}
			} else {
				yield* this.deltaNode(sourceNode, sourceLimit)
			}
		} finally {
			this.depth -= 1
		}
	}

	async *deltaNode(sourceNode: Node, sourceLimit: Key): AsyncGenerator<Delta, void, undefined> {
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

				const range: NodeRange = {
					level: 0,
					lowerBound: { key: this.leafCursor, inclusive: true },
					upperBound: { key: sourceNode.key, inclusive: false },
				}

				for await (const targetLeaf of this.target.iterate(range)) {
					if (targetLeaf.key === null) {
						continue
					}

					assert(targetLeaf.level == 0 && targetLeaf.value !== undefined)
					yield { key: targetLeaf.key, source: null, target: targetLeaf.value }
				}

				this.leafCursor = sourceNode.key
				this.log("set leaf cursor to %k", this.leafCursor)
			}

			if (targetNode !== null && equalNodes(sourceNode, targetNode)) {
				this.log("skipping subtree")

				const range: NodeRange = {
					level: targetNode.level,
					lowerBound: { key: targetNode.key, inclusive: false },
				}

				for await (const nextTargetNode of this.target.iterate(range)) {
					this.leafCursor = nextTargetNode.key
					this.log("set leaf cursor to %k", this.leafCursor)
					return
				}

				this.leafCursor = null
				this.log("set leaf cursor to %k", this.leafCursor)
				return
			}

			if (sourceNode.level > 1) {
				const sourceChildren = await this.source.getChildren(sourceNode.level, sourceNode.key)
				for (const [i, sourceChild] of sourceChildren.entries()) {
					const sourceChildLimit = i === sourceChildren.length - 1 ? sourceLimit : sourceChildren[i + 1].key
					yield* this.deltaNode(sourceChild, sourceChildLimit)
				}
			} else {
				yield* this.deltaLeaf(sourceNode, sourceLimit)
			}
		} finally {
			this.depth -= 1
		}
	}

	private async *deltaLeaf(sourceNode: Node, sourceLimit: Key): AsyncGenerator<Delta, void, undefined> {
		assert(sourceNode.level === 1)

		const sourceChildren = await this.source.getChildren(sourceNode.level, sourceNode.key)

		this.log("yielding missing entries via explicit leaf iteration")

		const range: NodeRange = {
			level: 0,
			lowerBound: { key: sourceNode.key, inclusive: true },
		}

		if (sourceLimit !== null) {
			range.upperBound = { key: sourceLimit, inclusive: false }
		}

		const targetNodes = this.target.iterate(range)

		try {
			let targetLeaf = await next(targetNodes)

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

					targetLeaf = await next(targetNodes)
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

					targetLeaf = await next(targetNodes)
				}
			}

			this.log("done yielding leaves")
			this.leafCursor = targetLeaf === null ? sourceLimit : targetLeaf.key
			this.log("set leaf cursor to", this.leafCursor)
		} finally {
			if (targetNodes.return) {
				await targetNodes.return()
			}
		}
	}
}
