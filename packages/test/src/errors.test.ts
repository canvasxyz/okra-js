import { fromString } from "uint8arrays"
import { testPlatforms } from "./utils.js"

testPlatforms("open a write txn during an open read txn", async (t, openTree) => {
	const tree = openTree(t)

	await tree.write((txn) => txn.set(fromString("a"), fromString("foo")))

	await t.throwsAsync(() =>
		tree.write((txn) => {
			txn.set(fromString("b"), fromString("bar"))
			throw new Error("bad")
		}),
	)

	await tree.read((txn) => {
		t.deepEqual(txn.get(fromString("a")), fromString("foo"))
		t.is(txn.get(fromString("b")), null)
	})
})
