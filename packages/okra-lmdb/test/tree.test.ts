import test from "ava"

import { fromString } from "uint8arrays"

import { openTree, collect } from "./utils.js"

// Some simple leaf entries we'll use for testing

const anchor = { level: 0, key: null, hash: fromString("e3b0c44298fc1c149afbf4c8996fb924", "hex") }
const a = {
	level: 0,
	key: fromString("a"),
	hash: fromString("1ff8f70b7ec5106c00461223aeb65155", "hex"),
	value: fromString("foo"),
}
const b = {
	level: 0,
	key: fromString("b"),
	hash: fromString("51c6c5d032ae2f766c57e442069c58d2", "hex"),
	value: fromString("bar"),
}
const c = {
	level: 0,
	key: fromString("c"),
	hash: fromString("6f74a8aeb1e83ae60d24005607c75467", "hex"),
	value: fromString("baz"),
}
const g = {
	level: 0,
	key: fromString("g"),
	hash: fromString("3c98ed85f511097a828976b342053803", "hex"),
	value: fromString("ooo"),
}
const h = {
	level: 0,
	key: fromString("h"),
	hash: fromString("f162646345628774f00b8905ee47b015", "hex"),
	value: fromString("aaa"),
}

test("get/set/delete", async (t) => {
	const env = openTree(t, {})

	const tree = openTree(t)
	await tree.write((txn) => {
		txn.set(a.key, a.value)
		txn.set(b.key, b.value)
		txn.set(c.key, c.value)
	})

	await tree.read((txn) => {
		t.deepEqual(txn.get(a.key), a.value)
		t.deepEqual(txn.get(b.key), b.value)
		t.deepEqual(txn.get(c.key), c.value)
		t.deepEqual(txn.get(fromString("d")), null)
	})

	await tree.write((txn) => txn.delete(b.key))
	await tree.read((txn) => t.is(txn.get(b.key), null))
})

test("getRoot/getNode/getChildren", async (t) => {
	const tree = openTree(t, {})

	await tree.write((txn) => {
		txn.set(a.key, a.value)
		txn.set(b.key, b.value)
		txn.set(c.key, c.value)
	})

	await tree.read((txn) => {
		t.deepEqual(txn.getRoot(), { level: 1, key: null, hash: fromString("f8acdc73fb2e1cc001d82a87ce3d2553", "hex") })
		t.deepEqual(txn.getNode(1, null), {
			level: 1,
			key: null,
			hash: fromString("f8acdc73fb2e1cc001d82a87ce3d2553", "hex"),
		})
		t.deepEqual(txn.getNode(0, null), anchor)
		t.deepEqual(txn.getNode(0, a.key), a)
		t.deepEqual(txn.getNode(0, b.key), b)
		t.deepEqual(txn.getNode(0, c.key), c)
		t.deepEqual(txn.getNode(0, fromString("d")), null)

		t.deepEqual(txn.getChildren(1, null), [anchor, a, b, c])
	})
})

test("nodes iterator", async (t) => {
	const tree = openTree(t, {})

	await tree.write((txn) => {
		txn.set(a.key, a.value)
		txn.set(b.key, b.value)
		txn.set(c.key, c.value)
		txn.set(g.key, g.value)
		txn.set(h.key, h.value)
	})

	const bound = (key: null | string, inclusive: boolean) => ({ key: key === null ? null : fromString(key), inclusive })

	await tree.read((txn) => {
		t.deepEqual([...txn.nodes(0)], [anchor, a, b, c, g, h])
		t.deepEqual([...txn.nodes(0, null, null, { reverse: true })], [h, g, c, b, a, anchor])

		t.deepEqual([...txn.nodes(0, bound("b", true), bound("g", true))], [b, c, g])
		t.deepEqual([...txn.nodes(0, bound("b", true), bound("g", false))], [b, c])

		t.deepEqual([...txn.nodes(0, bound("c", false), bound("g", false))], [])
		t.deepEqual([...txn.nodes(0, bound("c", false), bound("h", false))], [g])
		t.deepEqual([...txn.nodes(0, bound("c", false), bound("h", true))], [g, h])

		t.deepEqual([...txn.nodes(0, bound(null, true), bound("c", false))], [anchor, a, b])
		t.deepEqual([...txn.nodes(0, bound(null, false), bound("c", false))], [a, b])
	})
})
