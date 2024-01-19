import test from "ava"

import { hexToBytes as hex } from "@noble/hashes/utils"

import { collect } from "@canvas-js/okra"
import { getEnvironment, encode } from "./utils.js"

// Some simple leaf entries we'll use for testing

const anchor = { level: 0, key: null, hash: hex("af1349b9f5f9a1a6a0404dea36dcc949") }
const a = { level: 0, key: encode("a"), hash: hex("2f26b85f65eb9f7a8ac11e79e710148d"), value: encode("foo") }
const b = { level: 0, key: encode("b"), hash: hex("684f1047a178e6cf9fff759ba1edec2d"), value: encode("bar") }
const c = { level: 0, key: encode("c"), hash: hex("56cb13c78823525b08d471b6c1201360"), value: encode("baz") }
const g = { level: 0, key: encode("g"), hash: hex("0886b4a1f64bce08a7ee27e5040ffdfb"), value: encode("ooo") }
const h = { level: 0, key: encode("h"), hash: hex("14945a3c44a4227dace558945721e0fb"), value: encode("aaa") }

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
			t.deepEqual(tree.getRoot(), { level: 1, key: null, hash: hex("6246b94074d09feb644be1a1c12c1f50") })
			t.deepEqual(tree.getNode(1, null), { level: 1, key: null, hash: hex("6246b94074d09feb644be1a1c12c1f50") })
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
