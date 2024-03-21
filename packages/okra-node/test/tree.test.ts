import test from "ava"

import { hexToBytes as hex } from "@noble/hashes/utils"

import { collect } from "@canvas-js/okra"
import { getEnvironment, encode } from "./utils.js"

// Some simple leaf entries we'll use for testing

const anchor = { level: 0, key: null, hash: hex("e3b0c44298fc1c149afbf4c8996fb924") }
const a = { level: 0, key: encode("a"), hash: hex("1ff8f70b7ec5106c00461223aeb65155"), value: encode("foo") }
const b = { level: 0, key: encode("b"), hash: hex("51c6c5d032ae2f766c57e442069c58d2"), value: encode("bar") }
const c = { level: 0, key: encode("c"), hash: hex("6f74a8aeb1e83ae60d24005607c75467"), value: encode("baz") }
const g = { level: 0, key: encode("g"), hash: hex("3c98ed85f511097a828976b342053803"), value: encode("ooo") }
const h = { level: 0, key: encode("h"), hash: hex("f162646345628774f00b8905ee47b015"), value: encode("aaa") }

test("get/set/delete", async (t) => {
	const env = getEnvironment(t, {})

	await env.write((txn) =>
		txn.openTree(null, (tree) => {
			tree.set(a.key, a.value)
			tree.set(b.key, b.value)
			tree.set(c.key, c.value)
		})
	)

	await env.read((txn) =>
		txn.openTree(null, (tree) => {
			t.deepEqual(tree.get(a.key), a.value)
			t.deepEqual(tree.get(b.key), b.value)
			t.deepEqual(tree.get(c.key), c.value)
			t.deepEqual(tree.get(encode("d")), null)
		})
	)

	await env.write((txn) => txn.openTree(null, (tree) => tree.delete(b.key)))
	t.is(await env.read((txn) => txn.openTree(null, (tree) => tree.get(b.key))), null)
})

test("getRoot/getNode/getChildren", async (t) => {
	const env = getEnvironment(t, {})

	await env.write((txn) =>
		txn.openTree(null, (tree) => {
			tree.set(a.key, a.value)
			tree.set(b.key, b.value)
			tree.set(c.key, c.value)
		})
	)

	await env.read((txn) =>
		txn.openTree(null, (tree) => {
			t.deepEqual(tree.getRoot(), { level: 1, key: null, hash: hex("f8acdc73fb2e1cc001d82a87ce3d2553") })
			t.deepEqual(tree.getNode(1, null), { level: 1, key: null, hash: hex("f8acdc73fb2e1cc001d82a87ce3d2553") })
			t.deepEqual(tree.getNode(0, null), anchor)
			t.deepEqual(tree.getNode(0, a.key), a)
			t.deepEqual(tree.getNode(0, b.key), b)
			t.deepEqual(tree.getNode(0, c.key), c)
			t.deepEqual(tree.getNode(0, encode("d")), null)

			t.deepEqual(tree.getChildren(1, null), [anchor, a, b, c])
		})
	)
})

test("nodes iterator", async (t) => {
	const env = getEnvironment(t, {})

	await env.write((txn) =>
		txn.openTree(null, (tree) => {
			tree.set(a.key, a.value)
			tree.set(b.key, b.value)
			tree.set(c.key, c.value)
			tree.set(g.key, g.value)
			tree.set(h.key, h.value)
		})
	)

	const bound = (key: null | string, inclusive: boolean) => ({ key: key === null ? null : encode(key), inclusive })

	await env.read((txn) =>
		txn.openTree(null, async (tree) => {
			t.deepEqual(await collect(tree.nodes(0)), [anchor, a, b, c, g, h])
			t.deepEqual(await collect(tree.nodes(0, null, null, { reverse: true })), [h, g, c, b, a, anchor])

			t.deepEqual(await collect(tree.nodes(0, bound("b", true), bound("g", true))), [b, c, g])
			t.deepEqual(await collect(tree.nodes(0, bound("b", true), bound("g", false))), [b, c])

			t.deepEqual(await collect(tree.nodes(0, bound("c", false), bound("g", false))), [])
			t.deepEqual(await collect(tree.nodes(0, bound("c", false), bound("h", false))), [g])
			t.deepEqual(await collect(tree.nodes(0, bound("c", false), bound("h", true))), [g, h])

			t.deepEqual(await collect(tree.nodes(0, bound(null, true), bound("c", false))), [anchor, a, b])
			t.deepEqual(await collect(tree.nodes(0, bound(null, false), bound("c", false))), [a, b])
		})
	)
})
