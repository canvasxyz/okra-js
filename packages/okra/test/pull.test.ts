import test, { ExecutionContext } from "ava"

import { iota, getKey, compareEntries, random, initialize } from "./utils.js"

async function testPull(
	t: ExecutionContext,
	seed: string,
	count: number,
	deleteA: number,
	deleteB: number
): Promise<void> {
	const [a, b] = await Promise.all([
		initialize(t, iota(count), { K: 16, Q: 4 }),
		initialize(t, iota(count), { K: 16, Q: 4 }),
	])

	for (const [key, value] of iota(count)) {
		await Promise.all([a.set(key, value), b.set(key, value)])
	}

	for (const i of random(`${seed}:source`, 0, count, deleteA)) {
		await a.delete(getKey(i))
	}

	for (const i of random(`${seed}:target`, 0, count, deleteB)) {
		await b.delete(getKey(i))
	}

	await b.pull(a)
	await a.pull(b)

	const delta = await compareEntries(t, b.entries(), a.entries())
	t.is(delta, 0)
}

test("testPull(100, 10, 10) x 10", async (t) => {
	t.timeout(2 * 60 * 1000)
	for (let i = 0; i < 10; i++) {
		await testPull(t, `pull:100:${i}`, 100, 10, 10)
	}
})

test("testPull(1000, 20, 20) x 10", async (t) => {
	t.timeout(2 * 60 * 1000)
	for (let i = 0; i < 10; i++) {
		await testPull(t, `pull:1000:${i}`, 1000, 20, 20)
	}
})

test("testPull(10000, 100, 100) x 10", async (t) => {
	t.timeout(5 * 60 * 1000)
	for (let i = 0; i < 10; i++) {
		await testPull(t, `pull:10000:${i}`, 10000, 100, 100)
	}
})
