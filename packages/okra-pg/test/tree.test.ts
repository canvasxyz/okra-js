import test, { ExecutionContext } from "ava"

import pg from "pg"

import { Builder } from "@canvas-js/okra"
import { MemoryStore } from "@canvas-js/okra-memory"

import { Tree } from "@canvas-js/okra-pg"
import { blake3 } from "@noble/hashes/blake3"

test("compare to builder(1000)", async (t) => {
	const path = "postgresql://localhost:5432/test" // TODO
	const client = new pg.Client(path)

	const b = await Builder.open(new MemoryStore(), { K: 16, Q: 4 })
	const tree = await Tree.initialize(client, { K: 16, Q: 4, clear: true })

	const buffer = new ArrayBuffer(4)
	const view = new DataView(buffer)
	for (let i = 0; i < 1000; i++) {
		view.setUint32(0, i)
		const key = new Uint8Array(buffer, 0, 4)
		const value = blake3(key, { dkLen: 4 })
		await tree.set(key, value)
		await b.set(key, value)
	}

	t.deepEqual(await tree.getRoot(), await b.finalize())

	await client.end()

	t.log("YAY")
	t.pass()
})
