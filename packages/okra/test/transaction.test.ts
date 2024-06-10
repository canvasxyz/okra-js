import { fromString } from "uint8arrays"

import { Entry, Mode } from "@canvas-js/okra"

import { testPlatforms } from "./utils.js"

testPlatforms("get/set/delete [Store]", async (t, openTree) => {
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

testPlatforms("get() throws an error [Index]", async (t, openTree) => {
	const tree = openTree(t, { mode: Mode.Index })
	await tree.write((txn) => {
		txn.set(fromString("a"), fromString("foo"))
		txn.set(fromString("b"), fromString("bar"))
		txn.set(fromString("c"), fromString("baz"))
	})

	await t.throwsAsync(tree.read((txn) => txn.get(fromString("a"))))
})

testPlatforms("has/set/delete [Index]", async (t, openTree) => {
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

const data: Entry[] = [
	[fromString("a"), fromString("foo")],
	[fromString("b"), fromString("bar")],
	[fromString("c"), fromString("baz")],
	[fromString("g"), fromString("ooo")],
	[fromString("h"), fromString("aaa")],
]

const ranges = [
	{ name: "entire range", lowerBound: null, upperBound: null, reverse: false, entries: data },
	{
		name: "inclusive lower bound",
		lowerBound: { key: fromString("b"), inclusive: true },
		upperBound: null,
		reverse: false,
		entries: [
			[fromString("b"), fromString("bar")],
			[fromString("c"), fromString("baz")],
			[fromString("g"), fromString("ooo")],
			[fromString("h"), fromString("aaa")],
		],
	},
	{
		name: "exclusive lower bound",
		lowerBound: { key: fromString("b"), inclusive: false },
		upperBound: null,
		reverse: false,
		entries: [
			[fromString("c"), fromString("baz")],
			[fromString("g"), fromString("ooo")],
			[fromString("h"), fromString("aaa")],
		],
	},
	{
		name: "inclusive upper bound",
		lowerBound: null,
		upperBound: { key: fromString("b"), inclusive: true },
		reverse: false,
		entries: [
			[fromString("a"), fromString("foo")],
			[fromString("b"), fromString("bar")],
		],
	},
	{
		name: "exclusive upper bound",
		lowerBound: null,
		upperBound: { key: fromString("b"), inclusive: false },
		reverse: false,
		entries: [[fromString("a"), fromString("foo")]],
	},
	{
		name: "upper bound out-of-range",
		lowerBound: null,
		upperBound: { key: fromString("x"), inclusive: false },
		reverse: false,
		entries: data,
	},
	{
		name: "lower bound out-of-range",
		lowerBound: { key: fromString("7"), inclusive: false },
		upperBound: null,
		reverse: false,
		entries: data,
	},
	{
		name: "reverse inclusive lower bound",
		lowerBound: { key: fromString("b"), inclusive: true },
		upperBound: null,
		reverse: true,
		entries: [
			[fromString("h"), fromString("aaa")],
			[fromString("g"), fromString("ooo")],
			[fromString("c"), fromString("baz")],
			[fromString("b"), fromString("bar")],
		],
	},
	{
		name: "reverse exclusive lower bound",
		lowerBound: { key: fromString("b"), inclusive: false },
		upperBound: null,
		reverse: true,
		entries: [
			[fromString("h"), fromString("aaa")],
			[fromString("g"), fromString("ooo")],
			[fromString("c"), fromString("baz")],
		],
	},
	{
		name: "reverse inclusive upper bound",
		lowerBound: null,
		upperBound: { key: fromString("b"), inclusive: true },
		reverse: true,
		entries: [
			[fromString("b"), fromString("bar")],
			[fromString("a"), fromString("foo")],
		],
	},
	{
		name: "reverse exclusive upper bound",
		lowerBound: null,
		upperBound: { key: fromString("c"), inclusive: false },
		reverse: true,
		entries: [
			[fromString("b"), fromString("bar")],
			[fromString("a"), fromString("foo")],
		],
	},
]

testPlatforms("entries iterator [Store]", async (t, openTree) => {
	const tree = openTree(t, {})

	await tree.write((txn) => {
		for (const [key, value] of data) {
			txn.set(key, value)
		}
	})

	await tree.read<void>(async (txn) => {
		for (const { name, lowerBound, upperBound, reverse, entries } of ranges) {
			t.deepEqual(Array.from(txn.entries(lowerBound, upperBound, { reverse })), entries, name)
		}
	})
})

testPlatforms("keys iterator [Index]", async (t, openTree) => {
	const tree = openTree(t, { mode: Mode.Index })

	await tree.write((txn) => {
		for (const [key, value] of data) {
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

// testPlatforms("nodes iterator", async (t, openTree) => {
// 	const tree = openTree(t, {})

// 	await tree.write((txn) => {
// 		txn.set(a.key, a.value)
// 		txn.set(b.key, b.value)
// 		txn.set(c.key, c.value)
// 		txn.set(g.key, g.value)
// 		txn.set(h.key, h.value)
// 	})

// 	const bound = (key: null | string, inclusive: boolean) => ({ key: key === null ? null : fromString(key), inclusive })

// 	await tree.read((txn) => {
// 		t.deepEqual([...txn.nodes(0)], [anchor, a, b, c, g, h])
// 		t.deepEqual([...txn.nodes(0, null, null, { reverse: true })], [h, g, c, b, a, anchor])

// 		t.deepEqual([...txn.nodes(0, bound("b", true), bound("g", true))], [b, c, g])
// 		t.deepEqual([...txn.nodes(0, bound("b", true), bound("g", false))], [b, c])

// 		t.deepEqual([...txn.nodes(0, bound("c", false), bound("g", false))], [])
// 		t.deepEqual([...txn.nodes(0, bound("c", false), bound("h", false))], [g])
// 		t.deepEqual([...txn.nodes(0, bound("c", false), bound("h", true))], [g, h])

// 		t.deepEqual([...txn.nodes(0, bound(null, true), bound("c", false))], [anchor, a, b])
// 		t.deepEqual([...txn.nodes(0, bound(null, false), bound("c", false))], [a, b])
// 	})
// })
