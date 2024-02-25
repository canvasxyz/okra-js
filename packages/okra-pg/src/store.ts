import pg from "pg"
import Cursor from "pg-cursor"

import { sha256 } from "@noble/hashes/sha256"
import { bytesToHex as hex } from "@noble/hashes/utils"
import { Tree, Key, Node, Bound, Source, Target, KeyValueStore, assert } from "@canvas-js/okra"

type NodeRecord = { level: number; key: Uint8Array | null; hash: Uint8Array; value: Uint8Array | null }

export class PostgresStore implements KeyValueStore {
	private readonly client: pg.Client | pg.PoolClient
	private readonly table: string

	public static async initialize(client: pg.Client | pg.PoolClient, options: { table: string; clear?: boolean }) {
		if (options.table.match(/^[A-Za-z]+$/) === null) {
			throw new Error("table name must be alphabetical")
		}

		await client.query(`CREATE TABLE IF NOT EXISTS ${options.table} (key BYTEA NOT NULL UNIQUE, value BYTEA);`)

		if (options.clear) {
			await client.query(`TRUNCATE ${options.table};`)
		}

		return new PostgresStore(client, options.table)
	}

	constructor(client: pg.Client | pg.PoolClient, table: string) {
		this.client = client
		this.table = table
	}

	public async get(key: Uint8Array): Promise<Uint8Array | null> {
		const { rows } = await this.client.query(`SELECT * FROM ${this.table} WHERE key = $1`, [key])
		return rows[0] ? rows[0].value : null
	}

	public async *entries(
		lowerBound: Bound<Uint8Array> | null,
		upperBound: Bound<Uint8Array> | null,
		options: { reverse?: boolean | undefined } = {},
	): AsyncIterableIterator<[Uint8Array, Uint8Array]> {
		const query =
			`SELECT * FROM ${this.table} WHERE ` +
			(!lowerBound ? "$1::bytea IS NULL " : lowerBound.inclusive ? `key >= $1 ` : `key > $1 `) +
			`AND ` +
			(!upperBound ? "$2::bytea IS NULL " : upperBound.inclusive ? `key <= $2 ` : `key < $2 `) +
			`AND key IS NOT NULL ORDER BY key ${options.reverse ? "DESC" : "ASC"}`

		const cursor = await this.client.query(new Cursor(query, [lowerBound?.key, upperBound?.key]))

		// TODO: idiomatic
		while (true) {
			const nodes = (await cursor.read(10)) as Array<{ key: Uint8Array; value: Uint8Array }>
			if (nodes.length === 0) return
			for (const leaf of nodes) {
				assert(leaf !== null && leaf.key !== null && leaf.value !== null, "invalid leaf entry") // TODO: null tests
				yield [leaf.key, leaf.value]
			}
		}
	}

	public async set(key: Uint8Array, value: Uint8Array) {
		await this.client.query(
			`INSERT INTO ${this.table} (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2`,
			[key, value],
		)
	}

	public async delete(key: Uint8Array) {
		await this.client.query(`DELETE FROM ${this.table} WHERE key = $1`, [key])
	}

	public async clear() {
		await this.client.query(`TRUNCATE ${this.table};`)
	}
}
