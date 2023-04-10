import test, { ExecutionContext } from "ava"

import { Tree } from "@canvas-js/okra-level"

import { getDB, iota, getKey, compareEntries, random, initialize } from "./utils.js"

const K = 16
const Q = 4

async function testMerge(
	t: ExecutionContext,
	seed: string,
	count: number,
	deleteSource: number,
	deleteTarget: number
): Promise<void> {
	const [source, target] = await Promise.all([initialize(t, count, { K, Q }), initialize(t, count, { K, Q })])

	for (const i of random(`${seed}:source`, 0, count, deleteSource)) {
		await source.delete(getKey(i))
	}

	for (const i of random(`${seed}:target`, 0, count, deleteTarget)) {
		await target.delete(getKey(i))
	}

	for await (const delta of target.sync(source)) {
		if (delta.source === null) {
			await target.delete(delta.key)
		} else {
			await target.set(delta.key, delta.source)
		}
	}

	const delta = await compareEntries(t, target.entries(), source.entries())
	t.is(delta, 0)
}

test("testMerge(100, 10, 10) x 10", async (t) => {
	t.timeout(2 * 60 * 1000)
	for (let i = 0; i < 10; i++) {
		await testMerge(t, `merge:100:${i}`, 100, 10, 10)
	}
})

test("testMerge(1000, 20, 20) x 10", async (t) => {
	t.timeout(2 * 60 * 1000)
	for (let i = 0; i < 10; i++) {
		await testMerge(t, `merge:1000:${i}`, 1000, 20, 20)
	}
})

// test("testClone(10000, 100, 100) x 10", async (t) => {
// 	t.timeout(5 * 60 * 1000)
// 	for (let i = 0; i < 10; i++) {
// 		await testClone(t, `clone:10000:${i}`, 10000, 100, 100)
// 	}
// })
