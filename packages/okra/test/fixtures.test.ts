import { Metadata, Mode, Node } from "@canvas-js/okra"

import { testPlatforms, iota } from "./utils.js"
import { fixtures } from "./fixtures.js"

function testIota(name: string, count: number, root: Node, metadata: Partial<Metadata> = {}) {
	testPlatforms(name, async (t, openTree) => {
		t.timeout(60 * 1000)

		const tree = openTree(t, metadata)
		await tree.write((txn) => {
			for (const [key, value] of iota(count)) {
				txn.set(key, value)
			}
		})

		await tree.read((txn) => t.deepEqual(txn.getRoot(), root))
	})
}

for (const { count, root, metadata } of fixtures) {
	testIota(`test iota(${count})`, count, root, { ...metadata, mode: Mode.Index })
}

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
