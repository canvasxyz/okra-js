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

		await tree.client.query(
			`--sql
CREATE TABLE IF NOT EXISTS _okra_nodes(level INTEGER NOT NULL, key BYTEA, hash BYTEA, value BYTEA);
CREATE UNIQUE INDEX IF NOT EXISTS _okra_node_index ON _okra_nodes(level, key);

DROP FUNCTION IF EXISTS _okra_getnode(INTEGER, BYTEA);

CREATE OR REPLACE FUNCTION _okra_getnode(level_ INTEGER, key_ BYTEA) RETURNS TABLE (value bytea, hash bytea, key bytea) AS $$
SELECT value, hash, key FROM _okra_nodes WHERE (level = level_) AND ((key ISNULL AND key_ ISNULL) OR (key = key_))
$$ LANGUAGE SQL;

DROP PROCEDURE IF EXISTS _okra_setnode(INTEGER, BYTEA, BYTEA, BYTEA);

CREATE OR REPLACE PROCEDURE _okra_setnode(level_ INTEGER, key_ BYTEA, hash_ BYTEA, value_ BYTEA DEFAULT NULL) AS $$
BEGIN
		IF (select count(*) = 0 from _okra_getnode(level_, key_)) THEN
			INSERT INTO _okra_nodes VALUES (level_, key_, hash_, value_);
		ELSE
      UPDATE _okra_nodes SET hash = hash_, value = value_ WHERE level = level_ AND ((key ISNULL AND key_ ISNULL) OR (key = key_));
		END IF;
END
$$ LANGUAGE plpgsql;

DROP PROCEDURE IF EXISTS _okra_delete(BYTEA);

CREATE OR REPLACE PROCEDURE _okra_delete(node_key BYTEA) AS $$
DECLARE
  node_hash bytea;
  node_value bytea;
  firstSiblingKey bytea;
  parent_old_key bytea;
  parent_old_hash bytea;
  parent_old_value bytea;
  parent_new_hash bytea;
BEGIN

  SELECT hash, value INTO node_hash, node_value FROM _okra_getnode(0, node_key);

  IF node_hash IS NULL THEN
    RETURN;
  END IF;

  IF node_key IS NOT NULL AND _okra_isboundary(node_hash) THEN
    CALL _okra_deleteparents(0, node_key);
  END IF;
  CALL _okra_deletenode(0, node_key);

  firstSiblingKey := (SELECT key FROM _okra_getfirstsibling(0, node_key));
  IF firstSiblingKey IS NULL THEN
    CALL _okra_updateanchor(1);
  ELSE
    SELECT key, hash, value INTO parent_old_key, parent_old_hash, parent_old_value FROM _okra_getnode(1, firstSiblingKey);
    parent_new_hash := _okra_gethash(1, firstSiblingKey);
    CALL _okra_replace(
      1, parent_old_key, parent_old_hash, parent_old_value,
      1, firstSiblingKey, parent_new_hash
    );
  END IF;
END
$$ LANGUAGE plpgsql;

DROP PROCEDURE IF EXISTS _okra_deletenode(INTEGER, BYTEA);

CREATE OR REPLACE PROCEDURE _okra_deletenode(level_ INTEGER, key_ BYTEA) AS $$
    DELETE FROM _okra_nodes WHERE (level = level_) AND ((key ISNULL AND key_ ISNULL) OR (key = key_))
$$ LANGUAGE SQL;

DROP PROCEDURE IF EXISTS _okra_deleteparents(level_ INTEGER, key_ BYTEA);

CREATE OR REPLACE PROCEDURE _okra_deleteparents(level_ INTEGER, key_ BYTEA) AS $$
BEGIN
		IF (select count(*) = 0 from _okra_getnode(level_ + 1, key_)) THEN
      RETURN;
		ELSE
      CALL _okra_deletenode(level_ + 1, key_);
      CALL _okra_deleteparents(level_ + 1, key_);
    END IF;
END
$$ LANGUAGE plpgsql;

DROP PROCEDURE IF EXISTS _okra_createparents(INTEGER, BYTEA);

CREATE OR REPLACE PROCEDURE _okra_createparents(level_ INTEGER, key_ BYTEA) AS $$
DECLARE
    hash_ bytea := _okra_gethash(level_ + 1, key_);
BEGIN
    CALL _okra_setnode(level_ + 1, key_, hash_, cast(null as bytea));
    IF _okra_isboundary(hash_) THEN
      CALL _okra_createparents(level_ + 1, key_);
    END IF;
END
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS _okra_isboundary(BYTEA);

CREATE OR REPLACE FUNCTION _okra_isboundary(hash BYTEA) RETURNS boolean AS $$
SELECT hash < decode('${hex(tree.LIMIT_KEY)}', 'hex');
$$ LANGUAGE SQL;

DROP FUNCTION IF EXISTS _okra_getchildren(INTEGER, BYTEA);

CREATE OR REPLACE FUNCTION _okra_getchildren(level_ INTEGER, key_ BYTEA) RETURNS TABLE (level integer, key bytea, hash bytea, value bytea) AS $$
    SELECT level, key, hash, value FROM _okra_nodes WHERE level = level_ - 1 AND (cast(key_ as bytea) ISNULL OR (key NOTNULL AND key >= key_)) AND (
				key ISNULL OR key < (
SELECT key FROM _okra_nodes WHERE level = level_ - 1 AND key NOTNULL AND (cast(key_ as bytea) ISNULL OR key > key_) AND hash < decode('${hex(
				tree.LIMIT_KEY,
			)}', 'hex') ORDER BY key ASC NULLS FIRST LIMIT 1
            ) OR NOT EXISTS (SELECT 1 FROM _okra_nodes WHERE level = level_ - 1 AND key NOTNULL AND (cast(key_ as bytea) ISNULL OR key > key_) AND hash < decode('${hex(
							tree.LIMIT_KEY,
						)}', 'hex'))
    ) ORDER BY key ASC NULLS FIRST
$$ LANGUAGE SQL;

DROP FUNCTION IF EXISTS _okra_gethash(INTEGER, BYTEA);

CREATE OR REPLACE FUNCTION _okra_gethash(level_ INTEGER, key_ BYTEA) RETURNS bytea AS $$
SELECT sha256(string_agg(hash, '')) FROM (SELECT hash FROM _okra_getchildren(level_, key_)) children;
$$ LANGUAGE SQL;

DROP FUNCTION IF EXISTS _okra_getfirstsibling(INTEGER, BYTEA);

-- TODO: return self if _okra_getfirstsibling is called on an anchor node
CREATE OR REPLACE FUNCTION _okra_getfirstsibling(level_ INTEGER, key_ BYTEA) RETURNS TABLE(level INTEGER, key BYTEA, hash BYTEA) AS $$
    SELECT level, key, hash FROM _okra_nodes WHERE level = level_ AND (key ISNULL OR (key <= key_ AND hash < decode('${hex(
			tree.LIMIT_KEY,
		)}', 'hex'))) ORDER BY key DESC NULLS LAST LIMIT 1
$$ LANGUAGE SQL;

DROP PROCEDURE IF EXISTS _okra_updateanchor(INTEGER);

CREATE OR REPLACE PROCEDURE _okra_updateanchor(level_ INTEGER) AS $$
DECLARE
hash_ bytea := _okra_gethash(level_, cast(null as bytea));
BEGIN
    CALL _okra_setnode(level_, cast(null as bytea), hash_, cast(null as bytea));
    IF (SELECT COUNT(*) = 0 FROM (SELECT * FROM _okra_nodes WHERE level = level_ AND key NOTNULL ORDER BY key LIMIT 1) sq) THEN
        CALL _okra_deleteparents(level_, null);
    ELSE
        CALL _okra_updateanchor(level_ + 1);
    END IF;
END
$$ LANGUAGE plpgsql;

DROP PROCEDURE IF EXISTS _okra_update(INTEGER, BYTEA);

CREATE OR REPLACE PROCEDURE _okra_update(level_ INTEGER, key_ BYTEA) AS $$
DECLARE
  level_updt integer;
  key_updt bytea;
  hash_updt bytea;
  value_updt bytea;
BEGIN
    SELECT level, key, hash, value INTO level_updt, key_updt, hash_updt, value_updt FROM _okra_nodes WHERE (level = level_) AND ((key ISNULL AND key_ ISNULL) OR (key = key_));
    CALL _okra_replace(level_updt, key_updt, hash_updt, value_updt,
      level_,
      key_,
      _okra_gethash(level_, key_)
    );
END
$$ LANGUAGE plpgsql;

DROP PROCEDURE IF EXISTS _okra_replace(INTEGER, BYTEA, BYTEA, BYTEA, INTEGER, BYTEA, BYTEA, BYTEA);

CREATE OR REPLACE PROCEDURE _okra_replace(
  old_level INTEGER, old_key BYTEA, old_hash BYTEA, old_value BYTEA,
  new_level INTEGER, new_key BYTEA, new_hash BYTEA, new_value BYTEA DEFAULT NULL
) AS $$
DECLARE
  replaceKey bytea;
  firstSiblingKey bytea;
BEGIN
IF old_hash IS NOT NULL AND _okra_isboundary(old_hash) THEN
  IF _okra_isboundary(new_hash) THEN
    -- old node is boundary, new node is boundary
    CALL _okra_setnode(new_level, new_key, new_hash, new_value);
    CALL _okra_update(new_level + 1, new_key);
  ELSE
    -- old node is boundary, new node isn't boundary (merge)
    CALL _okra_setnode(new_level, new_key, new_hash, new_value);
    CALL _okra_deleteparents(new_level, new_key);

    firstSiblingKey := (SELECT key FROM _okra_getfirstsibling(new_level, new_key));
    IF (firstSiblingKey IS NULL) THEN
      CALL _okra_updateanchor(new_level + 1);
    ELSE
      CALL _okra_update(new_level + 1, firstSiblingKey);
    END IF;
  END IF;
ELSE
  firstSiblingKey := (SELECT key FROM _okra_getfirstsibling(new_level, new_key));
  CALL _okra_setnode(new_level, new_key, new_hash, new_value);

  IF _okra_isboundary(new_hash) THEN
    -- old node isn't boundary, new node is boundary (split)
    CALL _okra_createparents(new_level, new_key);
  END IF;

  IF firstSiblingKey ISNULL THEN
    CALL _okra_updateanchor(new_level + 1);
  ELSE
    CALL _okra_update(new_level + 1, firstSiblingKey);
  END IF;
END IF;
END
$$ LANGUAGE plpgsql;

DROP PROCEDURE IF EXISTS _okra_set(BYTEA, BYTEA, BYTEA);

CREATE OR REPLACE PROCEDURE _okra_set(key_ bytea, value_ bytea, new_hash bytea) AS $$
DECLARE
  old_key bytea;
  old_hash bytea;
  old_value bytea;
BEGIN
  SELECT key, hash, value INTO old_key, old_hash, old_value FROM _okra_getnode(0, key_);
  CALL _okra_replace(
    0, old_key, old_hash, old_value,
    0, key_, new_hash, value_
  );
END
$$ LANGUAGE plpgsql;
`,
		)

		if (options.clear) {
			await tree.client.query(`TRUNCATE _okra_nodes`)
		}

		await tree.client.query(`CALL _okra_setnode($1, cast($2 as bytea), $3, $4);`, [
			0,
			null,
			tree.LEAF_ANCHOR_HASH,
			null,
		])

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
		const { rows } = await this.client.query(`SELECT * FROM _okra_nodes ORDER BY level DESC LIMIT 1`)
		const { level, key, hash } = rows[0] as NodeRecord
		return { level, key, hash }
	}

	public async getChildren(level: number, key: Key): Promise<Node[]> {
		if (level === 0) {
			throw new RangeError("Cannot get children of a leaf node")
		}

		const { rows } = await this.client.query(`SELECT * FROM _okra_getchildren($1, $2);`, [level, key])

		return rows.map(({ level, key, hash, value }) => {
			if (value === null || value.length === 0) {
				return { level, key, hash }
			} else {
				return { level, key, hash, value }
			}
		})
	}

	public async set(key: Uint8Array, value: Uint8Array) {
		const hash = this.hashEntry(key, value)
		await this.client.query(`CALL _okra_set($1, $2, $3)`, [key, value, hash])
	}

	public async delete(key: Uint8Array) {
		await this.client.query(`CALL _okra_delete($1)`, [key])
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
