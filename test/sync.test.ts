import test, { ExecutionContext } from "ava"

import { Delta, collect } from "@canvas-js/okra"

import { getKey, defaultValue, random, initialize } from "./utils.js"

const K = 16
const Q = 4

async function testSync(
	t: ExecutionContext,
	seed: string,
	count: number,
	deleteSource: number,
	deleteTarget: number
): Promise<void> {
	const [source, target] = await Promise.all([initialize(t, count, { K, Q }), initialize(t, count, { K, Q })])

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

	t.deepEqual(await collect(target.sync(source)), expected)
}

test("testSync(100, 10, 10) x 10", async (t) => {
	t.timeout(2 * 60 * 1000)
	for (let i = 0; i < 10; i++) {
		await testSync(t, `sync:100:${i}`, 100, 10, 10)
	}
})

test("testSync(1000, 20, 20) x 10", async (t) => {
	t.timeout(2 * 60 * 1000)
	for (let i = 0; i < 10; i++) {
		await testSync(t, `sync:1000:${i}`, 1000, 20, 20)
	}
})

test("testSync(10000, 100, 100) x 10", async (t) => {
	t.timeout(5 * 60 * 1000)
	for (let i = 0; i < 10; i++) {
		await testSync(t, `sync:10000:${i}`, 10000, 100, 100)
	}
})
