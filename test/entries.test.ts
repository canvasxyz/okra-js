import test from "ava"

import { Tree, collect } from "@canvas-js/okra-level"

import { getDB, iota, getKey, defaultValue, initialize } from "./utils.js"

const K = 16
const Q = 4

test("Tree.entries", async (t) => {
	const count = 10
	const tree = await initialize(t, 10, { K, Q })

	t.deepEqual(await collect(tree.entries()), [...iota(count)])
	t.deepEqual(await collect(tree.entries(null, null, { reverse: true })), [...iota(count)].reverse())
	t.deepEqual(await collect(tree.entries(getKey(0), getKey(5))), [...iota(5)])
	t.deepEqual(await collect(tree.entries(getKey(5), null)), [...iota(10)].slice(5))
	t.deepEqual(await collect(tree.entries(getKey(5), getKey(5))), [])
	t.deepEqual(await collect(tree.entries(getKey(5), getKey(6))), [[getKey(5), defaultValue]])
	t.deepEqual(await collect(tree.entries(getKey(5), getKey(7), { reverse: true })), [
		[getKey(6), defaultValue],
		[getKey(5), defaultValue],
	])
})
