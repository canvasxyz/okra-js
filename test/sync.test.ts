import test, { ExecutionContext } from "ava"
import Prando from "prando"

import { Delta, Tree, sync } from "@canvas-js/okra-level"

import { getDB, iota, getKey, defaultValue, collect } from "./utils.js"

const K = 16
const Q = 4

function* random(seed: string, min: number, max: number, count: number): Generator<number, void, undefined> {
	const rng = new Prando(seed)
	for (let i = 0; i < count; i++) {
		yield rng.nextInt(min, max - 1)
	}
}

async function testSync(
	t: ExecutionContext,
	seed: string,
	count: number,
	deleteSource: number,
	deleteTarget: number
): Promise<void> {
	const [source, target] = await Promise.all([Tree.open(getDB(t), { K, Q }), Tree.open(getDB(t), { K, Q })])

	for (const [key, value] of iota(count)) {
		await Promise.all([source.set(key, value), target.set(key, value)])
	}

	const expected: Delta[] = []

	const deletedFromSource = new Set<number>(random(`${seed}:source`, 0, count, deleteSource))
	const deletedFromTarget = new Set<number>(random(`${seed}:target`, 0, count, deleteTarget))

	// const toKeys = (a: number[]) => a.sort((a, b) => a - b).map((i) => hex(getKey(i)))
	// t.log(seed, `deletedFromSource { ${toKeys([...deletedFromSource]).join(", ")} }`)
	// t.log(seed, `deletedFromTarget { ${toKeys([...deletedFromTarget]).join(", ")} }`)

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

	t.deepEqual(await collect(sync(source, target)), expected)
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

// test("testSync(10000, 100, 100) x 10", async (t) => {
// 	t.timeout(5 * 60 * 1000)
// 	for (let i = 0; i < 10; i++) {
// 		await testSync(t, `sync:10000:${i}`, 10000, 100, 100)
// 	}
// })
