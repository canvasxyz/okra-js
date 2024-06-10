// import { sha256 } from "@noble/hashes/sha256"
import { blake3 } from "@noble/hashes/blake3"
import { equals } from "uint8arrays"

import { Key, Node, Mode, ReadWriteTransaction, ReadWriteTransactionOptions } from "./interface.js"
import { ReadOnlyTransactionImpl } from "./ReadOnlyTransaction.js"
import { hashEntry, compareKeys } from "./utils.js"
import { NodeStore } from "./NodeStore.js"

export class ReadWriteTransactionImpl extends ReadOnlyTransactionImpl implements ReadWriteTransaction {
	constructor(store: NodeStore, private readonly options: ReadWriteTransactionOptions = {}) {
		super(store)
	}

	public set(key: Uint8Array, value: Uint8Array): void {
		this.log(`set(%h, %h)`, key, value)

		const hash = hashEntry(key, value, this.store.metadata)

		const oldLeaf = this.getNode(0, key)

		if (oldLeaf !== null && equals(oldLeaf.hash, hash)) {
			return
		}

		const { mode } = this.store.metadata
		if (mode === Mode.Index) {
			this.replace(oldLeaf, { level: 0, key, hash })
		} else if (mode === Mode.Store) {
			this.replace(oldLeaf, { level: 0, key, hash, value })
		} else {
			throw new Error("invalid mode")
		}
	}

	public delete(key: Uint8Array): void {
		this.log(`delete(%h)`, key)

		const node = this.getNode(0, key)
		if (node === null) {
			return
		}

		if (node.key !== null && this.isBoundary(node)) {
			this.deleteParents(0, key)
		}

		this.deleteNode(0, key)

		const firstSibling = this.getFirstSibling(node)
		if (firstSibling.key === null) {
			this.updateAnchor(1)
		} else {
			this.update(1, firstSibling.key)
		}
	}

	private update(level: number, key: Key) {
		this.log("update(%d, %h)", level, key)

		const oldNode = this.getNode(level, key)
		const hash = this.getHash(level, key)
		const newNode: Node = { level, key, hash }
		this.replace(oldNode, newNode)
	}

	private replace(oldNode: Node | null, newNode: Node) {
		this.log("replace(%n, %n)", oldNode, newNode)

		if (oldNode !== null && this.isBoundary(oldNode)) {
			this.replaceBoundary(newNode)
		} else {
			const firstSibling = this.getFirstSibling(newNode)
			this.setNode(newNode)

			if (this.isBoundary(newNode)) {
				this.createParents(newNode.level, newNode.key)
			}

			if (firstSibling.key == null) {
				this.updateAnchor(newNode.level + 1)
			} else {
				this.update(newNode.level + 1, firstSibling.key)
			}
		}
	}

	private replaceBoundary(node: Node) {
		this.setNode(node)

		if (this.isBoundary(node)) {
			this.update(node.level + 1, node.key)
		} else {
			this.deleteParents(node.level, node.key)

			const firstSibling = this.getFirstSibling(node)
			if (firstSibling.key === null) {
				this.updateAnchor(node.level + 1)
			} else {
				this.update(node.level + 1, firstSibling.key)
			}
		}
	}

	private updateAnchor(level: number) {
		this.log("updateAnchor(%d)", level)
		const hash = this.getHash(level, null)

		const anchor = { level, key: null, hash }
		this.setNode(anchor)

		for (const node of this.store.nodes(level, { key: null, inclusive: false }, null)) {
			this.updateAnchor(level + 1)
			return
		}

		this.deleteParents(level, null)
	}

	private deleteParents(level: number, key: Key) {
		const node = this.getNode(level + 1, key)
		if (node !== null) {
			this.deleteNode(level + 1, key)

			this.deleteParents(level + 1, key)
		}
	}

	private createParents(level: number, key: Key) {
		const hash = this.getHash(level + 1, key)
		const node: Node = { level: level + 1, key, hash }
		this.setNode(node)

		if (this.isBoundary(node)) {
			this.createParents(level + 1, key)
		}
	}

	private getFirstSibling(node: Node): Node {
		if (node.key === null) {
			return node
		}

		const upperBound = { key: node.key, inclusive: true }
		for (const prev of this.store.nodes(node.level, null, upperBound, { reverse: true })) {
			if (prev.key === null || this.isBoundary(prev)) {
				return prev
			}
		}

		throw new Error("Internal error")
	}

	private getHash(level: number, key: Key): Uint8Array {
		this.log("getHash(%d, %k)", level, key)

		// const hash = sha256.create()
		const hash = blake3.create({ dkLen: this.K })

		for (const node of this.store.nodes(level - 1, { key, inclusive: true })) {
			if (compareKeys(key, node.key) === -1 && this.isBoundary(node)) {
				break
			}

			this.log("------- %h (%k)", node.hash, node.key)
			hash.update(node.hash)
		}

		// const result = hash.digest().subarray(0, this.K)
		const result = hash.digest()
		this.log("        %h", result)
		return result
	}

	private deleteNode(level: number, key: Key) {
		this.store.deleteNode(level, key)
		this.options.onDeleteNode?.(level, key)
	}

	private setNode(node: Node) {
		this.store.setNode(node)
		this.options.onSetNode?.(node)
	}

	// /**
	//  * Raze and rebuild the merkle tree from the leaves.
	//  * @returns the new root node
	//  */
	// public  rebuild(): Promise<Node> {
	// 	const lowerBound = { key: createEntryKey(1, null), inclusive: true }
	// 	for  (const [entryKey] of this.store.entries(lowerBound)) {
	// 		 this.store.delete(entryKey)
	// 	}

	// 	const builder =  Builder.open(this.store, this.metadata)
	// 	const root =  builder.finalize()
	// 	return root
	// }
}
