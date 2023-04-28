import test from "ava"

import { collect } from "@canvas-js/okra"
import { iota, getKey, defaultValue, initialize } from "./utils.js"

test("Tree.entries", async (t) => {
	const count = 10
	const tree = await initialize(t, iota(10), { K: 16, Q: 4 })

	t.deepEqual(await collect(tree.entries()), [...iota(count)])
	t.deepEqual(await collect(tree.entries(null, null, { reverse: true })), [...iota(count)].reverse())
	t.deepEqual(await collect(tree.entries({ key: getKey(0), inclusive: true }, { key: getKey(5), inclusive: false })), [
		...iota(5),
	])
	t.deepEqual(await collect(tree.entries({ key: getKey(5), inclusive: true })), [...iota(10)].slice(5))
	t.deepEqual(
		await collect(tree.entries({ key: getKey(5), inclusive: true }, { key: getKey(5), inclusive: false })),
		[]
	)
	t.deepEqual(await collect(tree.entries({ key: getKey(5), inclusive: true }, { key: getKey(6), inclusive: false })), [
		[getKey(5), defaultValue],
	])
	t.deepEqual(
		await collect(
			tree.entries({ key: getKey(5), inclusive: true }, { key: getKey(7), inclusive: false }, { reverse: true })
		),
		[
			[getKey(6), defaultValue],
			[getKey(5), defaultValue],
		]
	)
})
