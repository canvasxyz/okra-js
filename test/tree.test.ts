import test, { ExecutionContext } from "ava"

import { bytesToHex } from "@noble/hashes/utils"

import { Tree, getLeafAnchorHash } from "@canvas-js/okra-level"

import { getDB, iota, shuffle } from "./utils.js"

const K = 16
const Q = 4

test("Tree.open", async (t) => {
	const db = getDB(t)
	const tree = await Tree.open(db, { K, Q })
	const root = await tree.getRoot()
	t.deepEqual(root, { level: 0, key: null, hash: Buffer.from(getLeafAnchorHash({ K })) })
})

const testIota = (count: number, rootLevel: number, rootHashPrefix: string) => async (t: ExecutionContext) => {
	t.timeout(60 * 1000)

	const db = getDB(t)
	const tree = await Tree.open(db, { K, Q })
	for (const [key, value] of iota(count)) {
		await tree.set(key, value)
	}

	const root = await tree.getRoot()
	t.is(root.level, rootLevel)
	t.is(bytesToHex(root.hash).slice(0, rootHashPrefix.length), rootHashPrefix)
}

test("Tree iota(10)", testIota(10, 4, "29f0468d"))
test("Tree iota(100)", testIota(100, 4, "b389c726"))
test("Tree iota(1000)", testIota(1000, 7, "42f378b6"))

const testShuffleIota =
	(count: number, rootLevel: number, rootHashPrefix: string, iters: number) => async (t: ExecutionContext) => {
		t.timeout(Math.max(5 * 60 * 1000, iters * count))

		const entries = [...iota(count)]

		for (let i = 0; i < iters; i++) {
			t.log(`iteration ${i + 1}/${iters}`)

			shuffle(entries)
			const db = getDB()
			const tree = await Tree.open(db, { K, Q })
			try {
				for (const [key, value] of entries) {
					await tree.set(key, value)
				}

				const root = await tree.getRoot()
				t.is(root.level, rootLevel)
				t.is(bytesToHex(root.hash).slice(0, rootHashPrefix.length), rootHashPrefix)
			} finally {
				db.close()
			}
		}
	}

test("Tree shuffle(iota(10))", testShuffleIota(10, 4, "29f0468d", 10))
test("Tree shuffle(iota(100))", testShuffleIota(100, 4, "b389c726", 20))
test("Tree shuffle(iota(1000))", testShuffleIota(1000, 7, "42f378b6", 20))

// test("Tree shuffle(iota(10000))", testShuffleIota(10000, 9, "f3f55398", 5))
// test("Tree shuffle(iota(100000))", testShuffleIota(100000, 8, "f7fe5a93", 1))
