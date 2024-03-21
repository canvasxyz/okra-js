import test, { ExecutionContext } from "ava"

import { bytesToHex as hex } from "@noble/hashes/utils"

import { Builder, Metadata, Tree } from "@canvas-js/okra"
import { MemoryTree, MemoryStore } from "@canvas-js/okra-memory"

import { compareEntries, iota, shuffle } from "./utils.js"

const metadata: Metadata = { K: 16, Q: 4 }
test("open tree", async (t) => {
	const tree = await MemoryTree.open(metadata)
	const root = await tree.getRoot()
	t.deepEqual(root, { level: 0, key: null, hash: Buffer.from("e3b0c44298fc1c149afbf4c8996fb924", "hex") })
})

test("get/set/delete", async (t) => {
	const tree = await MemoryTree.open(metadata)
	await tree.set(Buffer.from("a"), Buffer.from("foo"))
	await tree.set(Buffer.from("a"), Buffer.from("bar"))
	t.deepEqual(await tree.get(Buffer.from("a")), Buffer.from("bar"))
	await tree.delete(Buffer.from("a"))
	t.deepEqual(await tree.get(Buffer.from("a")), null)
	await tree.delete(Buffer.from("a"))
	t.deepEqual(await tree.get(Buffer.from("a")), null)
})

// const testIota = (count: number, rootLevel: number, rootHashPrefix: string) => async (t: ExecutionContext) => {
// 	t.timeout(60 * 1000)

// 	const tree = await MemoryTree.open(metadata)
// 	for (const [key, value] of iota(count)) {
// 		await tree.set(key, value)
// 	}

// 	const root = await tree.getRoot()
// 	t.is(root.level, rootLevel)
// 	t.is(hex(root.hash).slice(0, rootHashPrefix.length), rootHashPrefix)
// }

// test("Tree iota(10)", testIota(10, 4, "29f0468d"))
// test("Tree iota(100)", testIota(100, 4, "b389c726"))
// test("Tree iota(1000)", testIota(1000, 7, "42f378b6"))

// const testShuffleIota =
// 	(count: number, rootLevel: number, rootHashPrefix: string, iters: number) => async (t: ExecutionContext) => {
// 		t.timeout(Math.max(5 * 60 * 1000, iters * count))

// 		const store = new MemoryStore()
// 		const builder = await Builder.open(store, { K: 16, Q: 4 })

// 		const entries: [Uint8Array, Uint8Array][] = []
// 		for (const [key, value] of iota(count)) {
// 			entries.push([key, value])
// 			await builder.set(key, value)
// 		}

// 		const root = await builder.finalize()
// 		t.is(root.level, rootLevel)
// 		t.is(hex(root.hash).slice(0, rootHashPrefix.length), rootHashPrefix)

// 		for (let i = 0; i < iters; i++) {
// 			t.log(`iteration ${i + 1}/${iters}`)

// 			shuffle(entries)

// 			const tree = await MemoryTree.open({ K: 16, Q: 4 })

// 			for (const [key, value] of entries) {
// 				await tree.set(key, value)
// 			}

// 			t.deepEqual(await tree.getRoot(), root)
// 			const delta = await compareEntries(t, tree.store.db.iterator(), store.db.iterator())
// 			t.is(delta, 0)
// 		}
// 	}

// test("Tree shuffle(iota(10))", testShuffleIota(10, 4, "29f0468d", 10))
// test("Tree shuffle(iota(100))", testShuffleIota(100, 4, "b389c726", 20))
// test("Tree shuffle(iota(1000))", testShuffleIota(1000, 7, "42f378b6", 20))

// test("Tree shuffle(iota(10000))", testShuffleIota(10000, 9, "f3f55398", 5))
// test("Tree shuffle(iota(100000))", testShuffleIota(100000, 8, "f7fe5a93", 1))
