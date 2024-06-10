import { fromString } from "uint8arrays"

import { Mode, hashEntry } from "@canvas-js/okra"

import { testPlatforms } from "./utils.js"
import { entries, ranges } from "./ranges.js"

testPlatforms("has/set/delete", async (t, openTree) => {
	const tree = openTree(t, { mode: Mode.Index })

	await tree.write((txn) => {
		txn.set(fromString("a"), fromString("foo"))
		txn.set(fromString("b"), fromString("bar"))
		txn.set(fromString("c"), fromString("baz"))
	})

	await tree.read((txn) => {
		t.true(txn.has(fromString("a")))
		t.true(txn.has(fromString("b")))
		t.true(txn.has(fromString("c")))
		t.false(txn.has(fromString("d")))
	})

	await tree.write((txn) => {
		txn.delete(fromString("b"))
		txn.delete(fromString("d"))
	})

	await tree.read((txn) => t.false(txn.has(fromString("b"))))
})

testPlatforms("get() throws an error", async (t, openTree) => {
	const tree = openTree(t, { mode: Mode.Index })
	await tree.write((txn) => {
		txn.set(fromString("a"), fromString("foo"))
		txn.set(fromString("b"), fromString("bar"))
		txn.set(fromString("c"), fromString("baz"))
	})

	await t.throwsAsync(tree.read((txn) => txn.get(fromString("a"))))
})

testPlatforms("getNode omits `value`", async (t, openTree) => {
	const tree = openTree(t, { mode: Mode.Index })
	const key = fromString("a")
	const value = fromString("foo")
	await tree.write((txn) => txn.set(key, value))

	const leaf = await tree.read((txn) => txn.getNode(0, key))
	t.deepEqual(leaf, { level: 0, key, hash: hashEntry(key, value) })
})

testPlatforms("keys iterator", async (t, openTree) => {
	const tree = openTree(t, { mode: Mode.Index })

	await tree.write((txn) => {
		for (const [key, value] of entries) {
			txn.set(key, value)
		}
	})

	await tree.read<void>(async (txn) => {
		for (const { name, lowerBound, upperBound, reverse, entries } of ranges) {
			t.deepEqual(
				Array.from(txn.keys(lowerBound, upperBound, { reverse })),
				entries.map(([key]) => key),
				name
			)
		}
	})
})
