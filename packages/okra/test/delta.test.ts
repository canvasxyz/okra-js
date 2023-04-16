import test, { ExecutionContext } from "ava"

import { Delta, collect } from "@canvas-js/okra"

import { getKey, defaultValue, random, initialize, iota } from "./utils.js"

async function testDelta(
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

	const expected: Delta[] = []

	const deletedFromSource = new Set<number>(random(`${seed}:source`, 0, count, deleteSource))
	const deletedFromTarget = new Set<number>(random(`${seed}:target`, 0, count, deleteTarget))

	for (const i of deletedFromSource) {
		const key = getKey(i)
		await source.delete(key)
		if (deletedFromTarget.has(i)) {
			continue
		} else {
			expected.push({ key, source: null, target: defaultValue })
		}
	}

	for (const i of deletedFromTarget) {
		const key = getKey(i)
		await target.delete(key)
		if (deletedFromSource.has(i)) {
			continue
		} else {
			expected.push({ key, source: defaultValue, target: null })
		}
	}

	expected.sort(({ key: a }, { key: b }) => Buffer.from(a).compare(Buffer.from(b)))

	t.deepEqual(await collect(target.delta(source)), expected)
}

test("testDelta(100, 10, 10) x 10", async (t) => {
	t.timeout(2 * 60 * 1000)
	for (let i = 0; i < 10; i++) {
		await testDelta(t, `delta:100:${i}`, 100, 10, 10)
	}
})

test("testDelta(1000, 20, 20) x 10", async (t) => {
	t.timeout(2 * 60 * 1000)
	for (let i = 0; i < 10; i++) {
		await testDelta(t, `delta:1000:${i}`, 1000, 20, 20)
	}
})

test("testDelta(10000, 100, 100) x 10", async (t) => {
	t.timeout(5 * 60 * 1000)
	for (let i = 0; i < 10; i++) {
		await testDelta(t, `delta:10000:${i}`, 10000, 100, 100)
	}
})
