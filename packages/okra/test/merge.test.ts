import test, { ExecutionContext } from "ava"
import Prando from "prando"

import { Builder, Tree } from "@canvas-js/okra"
import { MemoryStore, MemoryTree } from "@canvas-js/okra-memory"

import { getKey, compareEntries } from "./utils.js"
import { text } from "node:stream/consumers"

/**
 * testMerge creates identical trees A and B with the same entries:
 * monotonic keys and random 1-byte values. It then sets `deltaA` of
 * the entries in A to different random 1-byte values, and `deltaB`
 * entries in B to different random 1-byte values.
 *
 * The merge() method iterates over the deltas and sets the target
 * entry to be [max(delta.source[0], delta.target[0])]. This is run both
 * ways, from A to B and then from B to A. At the end, the entries of
 * both databases are expected to be identical.
 */
async function testMerge(
	t: ExecutionContext,
	seed: string,
	count: number,
	deltaA: number,
	deltaB: number
): Promise<void> {
	const rng = new Prando(seed)

	const metadata = { K: 16, Q: 4 }
	const [storeA, storeB] = [new MemoryStore(), new MemoryStore()]
	const [builderA, builderB] = await Promise.all([Builder.open(storeA, metadata), Builder.open(storeB, metadata)])

	for (let i = 0; i < count; i++) {
		const value = new Uint8Array([rng.nextInt(0, 255)])
		await Promise.all([builderA.set(getKey(i), value), builderB.set(getKey(i), value)])
	}

	await Promise.all([builderA.finalize(), builderB.finalize()])

	const [a, b] = [new MemoryTree(storeA, metadata), new MemoryTree(storeB, metadata)]

	for (let i = 0; i < deltaA; i++) {
		const key = getKey(rng.nextInt(0, count - 1))
		const value = new Uint8Array([rng.nextInt(0, 255)])
		await a.set(key, value)
	}

	for (let i = 0; i < deltaB; i++) {
		const key = getKey(rng.nextInt(0, count - 1))
		const value = new Uint8Array([rng.nextInt(0, 255)])
		await a.set(key, value)
	}
	// console.log("TREE A ------------")
	// console.log(await text(a.print()))
	// console.log("TREE B ------------")
	// console.log(await text(a.print()))

	await a.merge(b, (_, [x], [y]) => new Uint8Array([Math.max(x, y)]))
	await b.merge(a, (_, [x], [y]) => new Uint8Array([Math.max(x, y)]))

	const delta = await compareEntries(t, a.entries(), b.entries())
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

test("testMerge(10000, 100, 100) x 10", async (t) => {
	t.timeout(5 * 60 * 1000)
	for (let i = 0; i < 10; i++) {
		await testMerge(t, `merge:10000:${i}`, 10000, 100, 100)
	}
})
