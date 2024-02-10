import test, { ExecutionContext } from "ava"

import pg from "pg"

import { Tree } from "@canvas-js/okra-pg"
import { blake3 } from "@noble/hashes/blake3"

import { Tree as SqliteTree } from "@canvas-js/okra-sqlite"

test("compare pg to sqlite(1000)", async (t) => {
	const path = "postgresql://localhost:5432/test" // TODO
	const client = new pg.Client(path)

	const tree = await Tree.initialize(client, { K: 16, Q: 4, clear: true })
	const sqliteTree = new SqliteTree(null, { K: 16, Q: 4 })

	const buffer = new ArrayBuffer(4)
	const view = new DataView(buffer)
	for (let i = 0; i < 1000; i++) {
		view.setUint32(0, i)
		const key = new Uint8Array(buffer, 0, 4)
		const value = blake3(key, { dkLen: 4 })
		await tree.set(key, value)
		await sqliteTree.set(key, value)
	}

	t.deepEqual(await tree.getRoot(), sqliteTree.getRoot())

	await client.end()

	t.log("YAY")
	t.pass()
})
