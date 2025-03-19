import { fromString } from "uint8arrays"

import { Mode, hashEntry } from "@canvas-js/okra"

import { entries, ranges } from "./ranges.js"
import { testPlatforms } from "./utils.js"

testPlatforms("get() returns the stored value", async (t, openTree) => {
	const tree = openTree(t, { mode: Mode.Store })
	const key = fromString("a")
	const value = fromString("foo")

	await tree.write((txn) => txn.set(key, value))
	await tree.read((txn) => t.deepEqual(txn.get(key), value))
})

testPlatforms("getNode includes `value`", async (t, openTree) => {
	const tree = openTree(t, { mode: Mode.Store })
	const key = fromString("a")
	const value = fromString("foo")
	await tree.write((txn) => txn.set(key, value))

	const leaf = await tree.read((txn) => txn.getNode(0, key))
	t.deepEqual(leaf, { level: 0, key, hash: hashEntry(key, value), value })
})

testPlatforms("get/set/delete", async (t, openTree) => {
	const tree = openTree(t, {})

	await tree.write((txn) => {
		txn.set(fromString("a"), fromString("foo"))
		txn.set(fromString("b"), fromString("bar"))
		txn.set(fromString("c"), fromString("baz"))
	})

	await tree.read((txn) => {
		t.deepEqual(txn.get(fromString("a")), fromString("foo"))
		t.deepEqual(txn.get(fromString("b")), fromString("bar"))
		t.deepEqual(txn.get(fromString("c")), fromString("baz"))
		t.deepEqual(txn.get(fromString("d")), null)
	})

	await tree.write((txn) => {
		txn.delete(fromString("b"))
		txn.delete(fromString("d"))
	})

	await tree.read((txn) => t.is(txn.get(fromString("b")), null))
})

testPlatforms("entries iterator", async (t, openTree) => {
	const tree = openTree(t, {})

	await tree.write((txn) => {
		for (const [key, value] of entries) {
			txn.set(key, value)
		}
	})

	await tree.read<void>(async (txn) => {
		for (const { name, lowerBound, upperBound, reverse, entries } of ranges) {
			t.deepEqual(Array.from(txn.entries(lowerBound, upperBound, { reverse })), entries, name)
		}
	})
})

testPlatforms("keys iterator", async (t, openTree) => {
	const tree = openTree(t, { mode: Mode.Store })

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
