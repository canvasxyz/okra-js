import test, { ExecutionContext } from "ava"

import { getKey, compareEntries, random, initialize, iota } from "./utils.js"

import { Source, Tree, sync } from "@canvas-js/okra"

async function copy(source: Source, target: Tree): Promise<void> {
	for await (const delta of sync(source, target)) {
		if (delta.source === null) {
			await target.delete(delta.key)
		} else {
			await target.set(delta.key, delta.source)
		}
	}
}

async function testCopy(
	t: ExecutionContext,
	seed: string,
	count: number,
	deleteSource: number,
	deleteTarget: number
): Promise<void> {
	const [source, target] = await Promise.all([
		initialize(t, iota(count), { K: 16, Q: 4 }),
		initialize(t, iota(count), { K: 16, Q: 4 }),
	])

	for (const i of random(`${seed}:source`, 0, count, deleteSource)) {
		await source.delete(getKey(i))
	}

	for (const i of random(`${seed}:target`, 0, count, deleteTarget)) {
		await target.delete(getKey(i))
	}

	await copy(source, target)

	const delta = await compareEntries(t, target.entries(), source.entries())
	t.is(delta, 0)
}

test("testCopy(100, 10, 10) x 10", async (t) => {
	t.timeout(2 * 60 * 1000)
	for (let i = 0; i < 10; i++) {
		await testCopy(t, `sync:100:${i}`, 100, 10, 10)
	}
})

test("testCopy(1000, 20, 20) x 10", async (t) => {
	t.timeout(2 * 60 * 1000)
	for (let i = 0; i < 10; i++) {
		await testCopy(t, `sync:1000:${i}`, 1000, 20, 20)
	}
})

test("testCopy(10000, 100, 100) x 10", async (t) => {
	t.timeout(5 * 60 * 1000)
	for (let i = 0; i < 10; i++) {
		await testCopy(t, `sync:10000:${i}`, 10000, 100, 100)
	}
})
