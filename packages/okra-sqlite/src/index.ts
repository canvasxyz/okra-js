import type * as sqlite from "better-sqlite3"
import Database from "better-sqlite3"

import { blake3 } from "@noble/hashes/blake3"
import { bytesToHex as hex } from "@noble/hashes/utils"
import { Key, Node, assert } from "@canvas-js/okra"

type NodeRecord = { level: number; key: Uint8Array | null; hash: Uint8Array; value: Uint8Array | null }

abstract class Hasher {
	protected readonly size: ArrayBuffer
	protected readonly K: number
	protected readonly view: DataView

	constructor({ size, K }: { size: ArrayBuffer; K: number }) {
		this.size = size
		this.K = K
		this.view = new DataView(size)
	}

	abstract hash(key: Uint8Array, value: Uint8Array): Uint8Array
}

export class Blake3Hasher extends Hasher {
	constructor({ size, K }: { size: ArrayBuffer; K: number }) {
		super({ size, K })
	}

	hash(key: Uint8Array, value: Uint8Array): Uint8Array {
		const hash = blake3.create({ dkLen: this.K })
		this.view.setUint32(0, key.length)
		hash.update(new Uint8Array(this.size))
		hash.update(key)
		this.view.setUint32(0, value.length)
		hash.update(new Uint8Array(this.size))
		hash.update(value)
		return hash.digest()
	}
}

export class Tree {
	private readonly K: number
	private readonly Q: number
	private readonly LIMIT: number
	private readonly LIMIT_KEY: Uint8Array
	private readonly LEAF_ANCHOR_HASH: Uint8Array
	private readonly hasher?: Hasher

	private readonly db: sqlite.Database
	private readonly statements: {
		insert: sqlite.Statement<{ level: number; key: Uint8Array | null; hash: Uint8Array; value: Uint8Array | null }>
		update: sqlite.Statement<{ level: number; key: Uint8Array | null; hash: Uint8Array; value: Uint8Array | null }>
		delete: sqlite.Statement<{ level: number; key: Uint8Array | null }>
		select: sqlite.Statement<{ level: number; key: Uint8Array | null }>
		selectRoot: sqlite.Statement<{}>
		selectFirstSibling: sqlite.Statement<{ level: number; key: Uint8Array | null; limit: Uint8Array }>
		selectChildren: sqlite.Statement<{ level: number; key: Uint8Array | null; limit: Uint8Array }>
		selectAnchorSibling: sqlite.Statement<{ level: number }>
	}

	constructor(path: string | null = null, options: { K?: number; Q?: number; hasher?: Hasher } = {}) {
		this.K = options.K ?? 16
		this.Q = options.Q ?? 32
		if (options.hasher) this.hasher = options.hasher
		this.LIMIT = Number((1n << 32n) / BigInt(this.Q))
		this.LIMIT_KEY = new Uint8Array(4)
		new DataView(this.LIMIT_KEY.buffer, this.LIMIT_KEY.byteOffset, this.LIMIT_KEY.byteLength).setUint32(0, this.LIMIT)
		this.LEAF_ANCHOR_HASH = blake3(new Uint8Array([]), { dkLen: this.K })

		this.db = new Database(path ?? ":memory:")

		this.db.exec(`CREATE TABLE IF NOT EXISTS nodes (level INTEGER NOT NULL, key BLOB, hash BLOB NOT NULL, value BLOB)`)

		this.db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS node_index ON nodes(level, key)`)

		this.statements = {
			insert: this.db.prepare(`INSERT INTO nodes VALUES (:level, :key, :hash, :value)`),
			update: this.db.prepare(
				`UPDATE nodes SET hash = :hash, value = :value WHERE level = :level AND ((key ISNULL AND :key ISNULL) OR (key = :key))`,
			),
			delete: this.db.prepare(
				`DELETE FROM nodes WHERE level = :level AND ((key ISNULL AND :key ISNULL) OR (key = :key))`,
			),
			select: this.db.prepare(
				`SELECT * FROM nodes WHERE level = :level AND ((key ISNULL AND :key ISNULL) OR (key = :key))`,
			),

			selectRoot: this.db.prepare(`SELECT * FROM nodes ORDER BY level DESC LIMIT 1`),

			selectFirstSibling: this.db.prepare(
				`SELECT * FROM nodes WHERE level = :level AND (key ISNULL OR (key <= :key AND hash < :limit)) ORDER BY key DESC LIMIT 1`,
			),

			selectChildren: this.db.prepare(
				`SELECT * FROM nodes WHERE level = :level - 1 AND (:key ISNULL OR (key NOTNULL AND key >= :key)) AND (
					key ISNULL OR key < (
						SELECT key FROM nodes WHERE level = :level - 1 AND key NOTNULL AND (:key ISNULL OR key > :key) AND hash < :limit ORDER BY key LIMIT 1
					) OR NOT EXISTS (SELECT 1 FROM nodes WHERE level = :level - 1 AND key NOTNULL AND (:key ISNULL OR key > :key) AND hash < :limit)
				) ORDER BY key`,
			),

			selectAnchorSibling: this.db.prepare(
				`SELECT key FROM nodes WHERE level = :level AND key NOTNULL ORDER BY key LIMIT 1`,
			),
		}

		this.setNode({ level: 0, key: null, hash: this.LEAF_ANCHOR_HASH })
	}

	public getRoot(): Node {
		const { level, key, hash } = this.statements.selectRoot.get({}) as NodeRecord
		return { level, key, hash }
	}

	public async getChildren(level: number, key: Key): Promise<Node[]> {
		if (level === 0) {
			throw new RangeError("Cannot get children of a leaf node")
		}
		const children = this.statements.selectChildren.all({ level, key, limit: this.LIMIT_KEY }) as { key: Uint8Array }[]
		return children.map(({ key }) => this.getNode(level - 1, key)).filter((n: Node | null) => n !== null) as Node[]
	}

	public set(key: Uint8Array, value: Uint8Array) {
		const oldLeaf = this.getNode(0, key)
		const hash = this.hashEntry(key, value)
		const newLeaf: Node = { level: 0, key, hash, value }

		this.replace(oldLeaf, newLeaf)
	}

	public delete(key: Uint8Array) {
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
		const oldNode = this.getNode(level, key)
		const hash = this.getHash(level, key)
		const newNode: Node = { level, key, hash }
		this.replace(oldNode, newNode)
	}

	private replace(oldNode: Node | null, newNode: Node) {
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
		if (this.isBoundary(node)) {
			this.setNode(node)
			this.update(node.level + 1, node.key)
		} else {
			this.setNode(node)
			this.deleteParents(node.level, node.key)

			const firstSibling = this.getFirstSibling(node)
			if (firstSibling.key === null) {
				this.updateAnchor(node.level + 1)
			} else {
				this.update(node.level + 1, firstSibling.key)
			}
		}
	}

	private async updateAnchor(level: number) {
		const hash = this.getHash(level, null)
		this.setNode({ level, key: null, hash })

		const next = this.statements.selectAnchorSibling.get({ level }) as { key: Uint8Array } | undefined
		if (next === undefined) {
			this.deleteParents(level, null)
		} else {
			this.updateAnchor(level + 1)
		}
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

		const firstSibling = this.statements.selectFirstSibling.get({
			level: node.level,
			key: node.key,
			limit: this.LIMIT_KEY,
		}) as NodeRecord | undefined

		assert(firstSibling !== undefined, "expected firstSibling !== undefined")
		const { level, key, hash } = firstSibling
		return { level, key, hash }
	}

	private getHash(level: number, key: Key): Uint8Array {
		const hash = blake3.create({ dkLen: this.K })

		const children = this.statements.selectChildren.all({ level, key, limit: this.LIMIT_KEY }) as { hash: Uint8Array }[]

		for (const child of children) {
			hash.update(child.hash)
		}

		return hash.digest()
	}

	private getNode(level: number, key: Key): Node | null {
		const row = this.statements.select.get({ level, key }) as NodeRecord | undefined
		if (row === undefined) {
			return null
		}

		const { hash, value } = row
		if (value === null) {
			return { level, key, hash }
		} else {
			return { level, key, hash, value }
		}
	}

	private setNode({ level, key, hash, value }: Node) {
		if (this.getNode(level, key) === null) {
			this.statements.insert.run({ level, key, hash, value: value ?? null })
		} else {
			this.statements.update.run({ level, key, hash, value: value ?? null })
		}
	}

	private deleteNode(level: number, key: Key) {
		this.statements.delete.run({ level, key })
	}

	private isBoundary({ hash }: Node) {
		const view = new DataView(hash.buffer, hash.byteOffset, hash.byteLength)
		return view.getUint32(0) < this.LIMIT
	}

	private static size = new ArrayBuffer(4)
	private static view = new DataView(Tree.size)

	private hashEntry(key: Uint8Array, value: Uint8Array): Uint8Array {
		if (this.hasher) {
			return this.hasher.hash(key, value)
		}

		const hash = blake3.create({ dkLen: this.K })
		Tree.view.setUint32(0, key.length)
		hash.update(new Uint8Array(Tree.size))
		hash.update(key)
		Tree.view.setUint32(0, value.length)
		hash.update(new Uint8Array(Tree.size))
		hash.update(value)
		return hash.digest()
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
					yield encoder.encode(`│\n`)
				} else {
					yield encoder.encode(`│ ${hex(node.key)}\n`)
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
