import test, { ExecutionContext } from "ava"

// import { Delta, KeyValueNodeStore, Mode, collect, sync } from "@canvas-js/okra"

// import { getKey, defaultValue, random, initialize, iota, getEnvironment, readTree, writeTree } from "./utils.js"

test("no-op", (t) => t.pass())

// test("test sync empty source", async (t) => {
// 	const [source, target] = await Promise.all([
// 		initialize(t, iota(0), { K: 16, Q: 4, mode: Mode.Store }),
// 		initialize(t, iota(3), { K: 16, Q: 4, mode: Mode.Store }),
// 	])

// 	t.deepEqual(await collect(sync(source, target)), [
// 		{ key: Buffer.from("00000000", "hex"), source: null, target: Buffer.from("ffffffff", "hex") },
// 		{ key: Buffer.from("00000001", "hex"), source: null, target: Buffer.from("ffffffff", "hex") },
// 		{ key: Buffer.from("00000002", "hex"), source: null, target: Buffer.from("ffffffff", "hex") },
// 	])
// })

// test("test sync empty target", async (t) => {
// 	const [source, target] = await Promise.all([
// 		initialize(t, iota(3), { K: 16, Q: 4, mode: Mode.Store }),
// 		initialize(t, [], { K: 16, Q: 4, mode: Mode.Store }),
// 	])

// 	t.deepEqual(await collect(sync(source, target)), [
// 		{ key: Buffer.from("00000000", "hex"), source: Buffer.from("ffffffff", "hex"), target: null },
// 		{ key: Buffer.from("00000001", "hex"), source: Buffer.from("ffffffff", "hex"), target: null },
// 		{ key: Buffer.from("00000002", "hex"), source: Buffer.from("ffffffff", "hex"), target: null },
// 	])
// })

// async function testDeltaMemory(
// 	t: ExecutionContext,
// 	seed: string,
// 	count: number,
// 	deleteSource: number,
// 	deleteTarget: number
// ): Promise<void> {
// 	const [source, target] = await Promise.all([
// 		initialize(t, iota(count), { K: 16, Q: 4, mode: Mode.Store }),
// 		initialize(t, iota(count), { K: 16, Q: 4, mode: Mode.Store }),
// 	])

// 	const expected = await initializeDelta(source, target, seed, count, deleteSource, deleteTarget)

// 	const actual = await collect(sync(source, target))
// 	t.deepEqual(
// 		actual,
// 		expected.map(({ key, source, target }) => ({
// 			key: Buffer.from(key),
// 			source: source && Buffer.from(source),
// 			target: target && Buffer.from(target),
// 		}))
// 	)
// }

// async function testDeltaNode(
// 	t: ExecutionContext,
// 	seed: string,
// 	count: number,
// 	deleteSource: number,
// 	deleteTarget: number
// ): Promise<void> {
// 	const [source, target] = [getEnvironment(t), getEnvironment(t)]

// 	const expected = await writeTree(source, (sourceTree) =>
// 		writeTree(target, async (targetTree) => {
// 			for (const [key, value] of iota(count)) {
// 				sourceTree.set(key, value)
// 				targetTree.set(key, value)
// 			}

// 			return await initializeDelta(sourceTree, targetTree, seed, count, deleteSource, deleteTarget)
// 		})
// 	)

// 	const actual = await readTree(source, (sourceTree) =>
// 		readTree(target, (targetTree) => {
// 			return collect(sync(sourceTree, targetTree))
// 		})
// 	)

// 	t.deepEqual(actual, expected)
// }

// async function initializeDelta(
// 	source: KeyValueNodeStore,
// 	target: KeyValueNodeStore,
// 	seed: string,
// 	count: number,
// 	deleteSource: number,
// 	deleteTarget: number
// ): Promise<Delta[]> {
// 	const expected: Delta[] = []

// 	const deletedFromSource = new Set<number>(random(`${seed}:source`, 0, count, deleteSource))
// 	const deletedFromTarget = new Set<number>(random(`${seed}:target`, 0, count, deleteTarget))

// 	for (const i of deletedFromSource) {
// 		const key = getKey(i)
// 		await source.delete(key)
// 		if (deletedFromTarget.has(i)) {
// 			continue
// 		} else {
// 			expected.push({ key, source: null, target: defaultValue })
// 		}
// 	}

// 	for (const i of deletedFromTarget) {
// 		const key = getKey(i)
// 		await target.delete(key)
// 		if (deletedFromSource.has(i)) {
// 			continue
// 		} else {
// 			expected.push({ key, source: defaultValue, target: null })
// 		}
// 	}

// 	expected.sort(({ key: a }, { key: b }) => Buffer.from(a).compare(Buffer.from(b)))
// 	return expected
// }

// test("testDeltaMemory(100, 10, 10) x 10", async (t) => {
// 	t.timeout(2 * 60 * 1000)
// 	for (let i = 0; i < 10; i++) {
// 		await testDeltaMemory(t, `delta:100:${i}`, 100, 10, 10)
// 	}
// })

// test("testDeltaNode(100, 10, 10) x 10", async (t) => {
// 	t.timeout(2 * 60 * 1000)
// 	for (let i = 0; i < 10; i++) {
// 		await testDeltaNode(t, `delta:100:${i}`, 100, 10, 10)
// 	}
// })

// test("testDeltaMemory(1000, 20, 20) x 10", async (t) => {
// 	t.timeout(2 * 60 * 1000)
// 	for (let i = 0; i < 10; i++) {
// 		await testDeltaMemory(t, `delta:1000:${i}`, 1000, 20, 20)
// 	}
// })

// test("testDeltaNode(1000, 20, 20) x 10", async (t) => {
// 	t.timeout(2 * 60 * 1000)
// 	for (let i = 0; i < 10; i++) {
// 		await testDeltaNode(t, `delta:1000:${i}`, 1000, 20, 20)
// 	}
// })

// test("testDeltaNode(10000, 100, 100) x 10", async (t) => {
// 	t.timeout(10 * 1000)
// 	for (let i = 0; i < 10; i++) {
// 		await testDeltaNode(t, `delta:10000:${i}`, 10000, 100, 100)
// 	}
// })

// test("testDeltaNode(100000, 100, 100) x 5", async (t) => {
// 	t.timeout(10 * 1000)
// 	for (let i = 0; i < 5; i++) {
// 		await testDeltaNode(t, `delta:100000:${i}`, 100000, 100, 100)
// 	}
// })
