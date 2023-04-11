import test, { ExecutionContext } from "ava"
import Prando from "prando"

import { getKey, compareEntries, getDB } from "./utils.js"
import { Builder, Tree } from "@canvas-js/okra"

const K = 16
const Q = 4

/**
 * testMerge creates identical trees A and B with the same entries:
 * monotonic keys and random 1-byte values. It then sets `deltaA` of
 * the entries in A to different random 1-byte values, and `deltaB`
 * entries in B to different random 1-byte values.
 *
 * The merge() method iterates over the deltas and sets the target
 * entry to be [max(delta.source[0], delta.target[0])]. This is run
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

	const [dbA, dbB] = [getDB(t), getDB(t)]
	const [builderA, builderB] = await Promise.all([Builder.open(dbA, { K, Q }), Builder.open(dbB, { K, Q })])

	for (let i = 0; i < count; i++) {
		const value = new Uint8Array([rng.nextInt(0, 255)])
		await Promise.all([builderA.set(getKey(i), value), builderB.set(getKey(i), value)])
	}

	await Promise.all([builderA.finalize(), builderB.finalize()])

	const [a, b] = await Promise.all([Tree.open(dbA, { K, Q }), Tree.open(dbB, { K, Q })])

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

	async function merge(source: Tree, target: Tree) {
		for await (const delta of target.delta(source)) {
			t.true(delta.source !== null && delta.source.byteLength === 1)
			t.true(delta.target !== null && delta.target.byteLength === 1)
			const sourceValue = delta.source?.at(0) ?? 0
			const targetValue = delta.source?.at(0) ?? 0
			const mergedValue = Math.max(sourceValue, targetValue)
			await target.set(delta.key, new Uint8Array([mergedValue]))
		}
	}

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
