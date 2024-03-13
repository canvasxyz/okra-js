import test, { ExecutionContext } from "ava"

import { Builder } from "@canvas-js/okra"
import { MemoryStore } from "@canvas-js/okra-memory"

import { Tree } from "@canvas-js/okra-sqlite"
import { blake3 } from "@noble/hashes/blake3"

test("compare to builder(1000)", async (t) => {
	const b = await Builder.open(new MemoryStore(), { K: 16, Q: 4 })
	const tree = new Tree(null, { K: 16, Q: 4 })

	const buffer = new ArrayBuffer(4)
	const view = new DataView(buffer)
	for (let i = 0; i < 1000; i++) {
		view.setUint32(0, i)
		const key = new Uint8Array(buffer, 0, 4)
		const value = blake3(key, { dkLen: 4 })
		tree.set(key, value)
		await b.set(key, value)
	}

	t.deepEqual(tree.getRoot(), await b.finalize())

	t.log("YAY")
	t.pass()
})
