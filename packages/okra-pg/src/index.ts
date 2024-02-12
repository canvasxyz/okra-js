import pg from "pg"

import { sha256 } from "@noble/hashes/sha256"
import { blake3 } from "@noble/hashes/blake3"
import { bytesToHex as hex } from "@noble/hashes/utils"
import { Key, Node, assert } from "@canvas-js/okra"

type NodeRecord = { level: number; key: Uint8Array | null; hash: Uint8Array; value: Uint8Array | null }

const H = 16

abstract class Hasher {
	protected readonly size: ArrayBuffer
	protected readonly K: number
	protected readonly view: DataView

	constructor({ size, K }: { size: ArrayBuffer; K: number }) {
		this.size = size
		this.K = K
		this.view = new DataView(size)
	}

	abstract hashEntry(key: Uint8Array, value: Uint8Array): Uint8Array
	abstract hashChildren(children: Array<{ hash: Uint8Array }>): Uint8Array
}

export class Blake3Hasher extends Hasher {
	constructor({ size, K }: { size: ArrayBuffer; K: number }) {
		super({ size, K })
	}

	hashEntry(key: Uint8Array, value: Uint8Array): Uint8Array {
		const hash = blake3.create({ dkLen: this.K })
		this.view.setUint32(0, key.length)
		hash.update(new Uint8Array(this.size))
		hash.update(key)
		this.view.setUint32(0, value.length)
		hash.update(new Uint8Array(this.size))
		hash.update(value)
		return hash.digest()
	}

	hashChildren(children: Array<{ hash: Uint8Array }>): Uint8Array {
		const hash = blake3.create({ dkLen: this.K })
		for (const child of children) {
			hash.update(child.hash)
		}
		return hash.digest()
	}
}

export class Sha256Hasher extends Hasher {
	constructor({ size, K }: { size: ArrayBuffer; K: number }) {
		super({ size, K })
	}

	hashEntry(key: Uint8Array, value: Uint8Array): Uint8Array {
		const hash = sha256.create()
		this.view.setUint32(0, key.length)
		hash.update(new Uint8Array(this.size))
		hash.update(key)
		this.view.setUint32(0, value.length)
		hash.update(new Uint8Array(this.size))
		hash.update(value)
		return hash.digest()
	}

	hashChildren(children: Array<{ hash: Uint8Array }>): Uint8Array {
		const hash = sha256.create()
		for (const child of children) {
			hash.update(child.hash)
		}
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

	private readonly client: pg.Client

	public static async initialize(
		client: pg.Client,
		options: { K?: number; Q?: number; clear?: boolean; hasher?: Hasher } = {},
	) {
		const tree = new Tree(client, options)

		await tree.client.connect()

		await tree.client.query(`
CREATE TABLE IF NOT EXISTS nodes (level INTEGER NOT NULL, key BYTEA, hash BYTEA NOT NULL, value BYTEA);
CREATE TABLE IF NOT EXISTS oplist (operation INTEGER);
CREATE UNIQUE INDEX IF NOT EXISTS node_index ON nodes(level, key);

DROP FUNCTION IF EXISTS getnode(INTEGER, BYTEA);

CREATE OR REPLACE FUNCTION getnode(level_ INTEGER, key_ BYTEA) RETURNS bytea AS $$
    SELECT
        (CASE WHEN value IS NULL THEN
            (CASE WHEN hash IS NULL THEN ''::bytea ELSE hash END)
        ELSE (CASE WHEN hash IS NULL THEN ''::bytea ELSE hash END) || value END)
    FROM nodes WHERE (level = level_) AND ((key ISNULL AND key_ ISNULL) OR (key = key_))
$$ LANGUAGE SQL;

DROP PROCEDURE IF EXISTS setnode(INTEGER, BYTEA, BYTEA, BYTEA);

CREATE OR REPLACE PROCEDURE setnode(level_ INTEGER, key_ BYTEA, hash_ BYTEA, value_ BYTEA) AS $$
BEGIN
		IF getnode(level_, key_) IS NULL THEN
			INSERT INTO nodes VALUES (level_, key_, hash_, value_);
		ELSE
      UPDATE nodes SET hash = hash_, value = value_ WHERE level = level_ AND ((key ISNULL AND key_ ISNULL) OR (key = key_));
		END IF;
END
$$ LANGUAGE plpgsql;

DROP PROCEDURE IF EXISTS deletenode(INTEGER, BYTEA);

CREATE OR REPLACE PROCEDURE deletenode(level_ INTEGER, key_ BYTEA) AS $$
    DELETE FROM nodes WHERE (level = level_) AND ((key ISNULL AND key_ ISNULL) OR (key = key_))
$$ LANGUAGE SQL;

DROP PROCEDURE IF EXISTS deleteparents(level_ INTEGER, key_ BYTEA);

CREATE OR REPLACE PROCEDURE deleteparents(level_ INTEGER, key_ BYTEA) AS $$
BEGIN
		IF getnode(level_ + 1, key_) IS NULL THEN
      RETURN;
		ELSE
      CALL deletenode(level_ + 1, key_);
      CALL deleteparents(level_ + 1, key_);
    END IF;
END
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS isboundary(BYTEA);

CREATE OR REPLACE FUNCTION isboundary(hash BYTEA) RETURNS boolean AS $$
SELECT hash < decode('${hex(tree.LIMIT_KEY)}', 'hex');
$$ LANGUAGE SQL;

DROP FUNCTION IF EXISTS gethash(INTEGER, BYTEA, BYTEA);

CREATE OR REPLACE FUNCTION gethash(level_ INTEGER, key_ BYTEA, limit_key BYTEA) RETURNS bytea AS $$
SELECT sha256(string_agg(hash, '')) FROM (
    SELECT hash FROM nodes WHERE level = $1 - 1 AND (cast($2 as bytea) ISNULL OR (key NOTNULL AND key >= $2)) AND (
				key ISNULL OR key < (
            SELECT key FROM nodes WHERE level = $1 - 1 AND key NOTNULL AND (cast($2 as bytea) ISNULL OR key > $2) AND hash < $3 ORDER BY key ASC NULLS FIRST LIMIT 1
            ) OR NOT EXISTS (SELECT 1 FROM nodes WHERE level = $1 - 1 AND key NOTNULL AND (cast($2 as bytea) ISNULL OR key > $2) AND hash < $3)
    ) ORDER BY key ASC NULLS FIRST
) children
$$ LANGUAGE SQL;

DROP FUNCTION IF EXISTS getfirstsibling(INTEGER, BYTEA, BYTEA);

-- TODO: return self if getfirstsibling is called on an anchor node
CREATE OR REPLACE FUNCTION getfirstsibling(level_ INTEGER, key_ BYTEA, limit_key BYTEA) RETURNS TABLE(level INTEGER, key BYTEA, hash BYTEA) AS $$
    SELECT level, key, hash FROM nodes WHERE level = level_ AND (key ISNULL OR (key <= key_ AND hash < limit_key)) ORDER BY key DESC NULLS LAST LIMIT 1
$$ LANGUAGE SQL;
`)

		if (options.clear) {
			await tree.client.query(`TRUNCATE nodes`)
		}

		await tree.setNode({ level: 0, key: null, hash: tree.LEAF_ANCHOR_HASH })

		return tree
	}

	constructor(client: pg.Client, options: { K?: number; Q?: number; hasher?: Hasher } = {}) {
		this.client = client
		this.K = options.K ?? 16 // key size
		this.Q = options.Q ?? 32 // target width
		if (options.hasher) this.hasher = options.hasher
		if (!this.hasher) throw new Error("hasher expected!")
		this.LIMIT = Number((1n << 32n) / BigInt(this.Q))
		this.LIMIT_KEY = new Uint8Array(4)
		new DataView(this.LIMIT_KEY.buffer, this.LIMIT_KEY.byteOffset, this.LIMIT_KEY.byteLength).setUint32(0, this.LIMIT)
		this.LEAF_ANCHOR_HASH = this.hasher.hashChildren([])
	}

	public async getRoot(): Promise<Node> {
		const { rows } = await this.client.query(`SELECT * FROM nodes ORDER BY level DESC LIMIT 1`)
		const { level, key, hash } = rows[0] as NodeRecord
		return { level, key, hash }
	}

	public async getChildren(level: number, key: Key): Promise<Node[]> {
		if (level === 0) {
			throw new RangeError("Cannot get children of a leaf node")
		}

		const limit = this.LIMIT_KEY
		const { rows } = await this.client.query(
			`SELECT * FROM nodes WHERE level = $1 - 1 AND (cast($2 as bytea) ISNULL OR (key NOTNULL AND key >= $2)) AND (
					key ISNULL OR key < (
	SELECT key FROM nodes WHERE level = $1 - 1 AND key NOTNULL AND (cast($2 as bytea) ISNULL OR key > $2) AND hash < $3 ORDER BY key ASC NULLS FIRST LIMIT 1
	) OR NOT EXISTS (SELECT 1 FROM nodes WHERE level = $1 - 1 AND key NOTNULL AND (cast($2 as bytea) ISNULL OR key > $2) AND hash < $3)
				) ORDER BY key ASC NULLS FIRST`,
			[level, key, limit],
		)

		return rows.map(({ level, key, hash, value }) => {
			if (value === null || value.length === 0) {
				return { level, key, hash }
			} else {
				return { level, key, hash, value }
			}
		})
	}

	public async set(key: Uint8Array, value: Uint8Array) {
		const oldLeaf = await this.getNode(0, key)
		const hash = this.hashEntry(key, value)
		const newLeaf: Node = { level: 0, key, hash, value }

		await this.replace(oldLeaf, newLeaf)
	}

	public async delete(key: Uint8Array) {
		const node = await this.getNode(0, key)
		if (node === null) {
			return
		}

		if (node.key !== null && (await this.isBoundary(node))) {
			this.deleteParents(0, key)
		}

		this.deleteNode(0, key)

		const firstSibling = await this.getFirstSibling(node)
		if (firstSibling.key === null) {
			await this.updateAnchor(1)
		} else {
			const oldNode = await this.getNode(1, firstSibling.key)
			const hash = await this.getHash(1, firstSibling.key)
			await this.replace(oldNode, { level: 1, key: firstSibling.key, hash })
		}
	}

	private async replace(oldNode: Node | null, newNode: Node) {
		if (oldNode !== null && (await this.isBoundary(oldNode))) {
			if (await this.isBoundary(newNode)) {
				// old node is boundary, new node is boundary
				await this.setNode(newNode)
				const oldNode = await this.getNode(newNode.level + 1, newNode.key)
				const hash = await this.getHash(newNode.level + 1, newNode.key)
				await this.replace(oldNode, { level: newNode.level + 1, key: newNode.key, hash })
			} else {
				// old node is boundary, new node isn't boundary (merge)
				await this.setNode(newNode)
				await this.deleteParents(newNode.level, newNode.key)

				const firstSibling = await this.getFirstSibling(newNode)
				if (firstSibling.key === null) {
					await this.updateAnchor(newNode.level + 1)
				} else {
					const oldNode = await this.getNode(newNode.level + 1, firstSibling.key)
					const hash = await this.getHash(newNode.level + 1, firstSibling.key)
					await this.replace(oldNode, { level: newNode.level + 1, key: firstSibling.key, hash })
				}
			}
		} else {
			const firstSibling = await this.getFirstSibling(newNode)

			await this.setNode(newNode)

			// old node isn't boundary, new node is boundary (split)
			if (await this.isBoundary(newNode)) {
				await this.createParents(newNode.level, newNode.key)
			}

			if (firstSibling.key == null) {
				await this.updateAnchor(newNode.level + 1)
			} else {
				const oldNode = await this.getNode(newNode.level + 1, firstSibling.key)
				const hash = await this.getHash(newNode.level + 1, firstSibling.key)
				await this.replace(oldNode, { level: newNode.level + 1, key: firstSibling.key, hash })
			}
		}
	}

	private async updateAnchor(level: number) {
		const hash = await this.getHash(level, null)
		await this.setNode({ level, key: null, hash })

		const { rows } = await this.client.query(
			`SELECT key FROM nodes WHERE level = $1 AND key NOTNULL ORDER BY key LIMIT 1`,
			[level],
		)
		if (rows.length === 0) {
			await this.deleteParents(level, null)
		} else {
			await this.updateAnchor(level + 1)
		}
	}

	private async deleteParents(level: number, key: Key) {
		await this.client.query(`CALL deleteparents($1, cast($2 as bytea));`, [level, key])
	}

	private async createParents(level: number, key: Key) {
		const hash = await this.getHash(level + 1, key)
		const node: Node = { level: level + 1, key, hash }
		await this.setNode(node)
		if (await this.isBoundary(node)) {
			await this.createParents(level + 1, key)
		}
	}

	private async getFirstSibling(node: Node): Promise<Node> {
		const limit = this.LIMIT_KEY
		const { rows } = await this.client.query(
			`SELECT level, key, hash FROM getfirstsibling($1::integer, $2::bytea, $3::bytea)`,
			[node.level, node.key, limit],
		)
		const firstSibling = rows[0] as NodeRecord | undefined

		assert(firstSibling !== undefined, "expected firstSibling !== undefined")
		const { level, key, hash } = firstSibling
		return { level, key, hash }
	}

	private async getHash(level: number, key: Key): Promise<Uint8Array> {
		const limit = this.LIMIT_KEY
		const { rows } = await this.client.query(`SELECT gethash($1::integer, $2::bytea, $3::bytea)`, [level, key, limit])
		const row = rows[0]
		return row.gethash
	}

	private async getNode(level: number, key: Key): Promise<Node | null> {
		const { rows } = await this.client.query(`SELECT getnode($1::integer, $2::bytea)`, [level, key])
		const row = rows[0]

		if (row.getnode === null) {
			return null
		}

		const hash = row.getnode.subarray(0, H)
		const value = row.getnode.subarray(H)
		if (value.length === 0) {
			return { level, key, hash }
		} else {
			return { level, key, hash, value }
		}
	}

	private async setNode({ level, key, hash, value }: Node) {
		await this.client.query(`CALL setnode($1, cast($2 as bytea), $3, $4);`, [level, key, hash, value])
	}

	private async deleteNode(level: number, key: Key) {
		await this.client.query(`CALL deletenode($1, cast($2 as bytea));`, [level, key])
	}

	private async isBoundary({ hash }: Node) {
		const { rows } = await this.client.query(`SELECT isboundary(cast ($1 as bytea));`, [hash])
		const row = rows[0]
		return row.isboundary
	}

	private static size = new ArrayBuffer(4)
	private static view = new DataView(Tree.size)

	private hashEntry(key: Uint8Array, value: Uint8Array): Uint8Array {
		if (this.hasher) {
			return this.hasher.hashEntry(key, value)
		}
		throw new Error("hasher expected!")
	}

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
