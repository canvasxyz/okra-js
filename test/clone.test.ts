import test, { ExecutionContext } from "ava"

import { getKey, compareEntries, random, initialize } from "./utils.js"

const K = 16
const Q = 4

async function testClone(
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

test("testClone(100, 10, 10) x 10", async (t) => {
	t.timeout(2 * 60 * 1000)
	for (let i = 0; i < 10; i++) {
		await testClone(t, `sync:100:${i}`, 100, 10, 10)
	}
})

test("testClone(1000, 20, 20) x 10", async (t) => {
	t.timeout(2 * 60 * 1000)
	for (let i = 0; i < 10; i++) {
		await testClone(t, `sync:1000:${i}`, 1000, 20, 20)
	}
})

// test("testClone(10000, 100, 100) x 10", async (t) => {
// 	t.timeout(5 * 60 * 1000)
// 	for (let i = 0; i < 10; i++) {
// 		await testClone(t, `sync:10000:${i}`, 10000, 100, 100)
// 	}
// })
