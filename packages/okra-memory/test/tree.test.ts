import test from "ava"

import { fromString } from "uint8arrays"
import { Tree } from "@canvas-js/okra-memory"

test("get/set/delete", async (t) => {
	const tree = new Tree()

	await tree.write((txn) => {
		txn.set(fromString("a"), fromString("foo"))
		txn.set(fromString("b"), fromString("bar"))
		txn.set(fromString("c"), fromString("baz"))
	})

	await tree.read((txn) => t.deepEqual(txn.get(fromString("b")), fromString("bar")))

	await tree.write((txn) => txn.delete(fromString("b")))

	await tree.read((txn) => t.is(txn.get(fromString("b")), null))
})
