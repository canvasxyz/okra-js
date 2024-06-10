import { setTimeout } from "node:timers/promises"

import { fromString } from "uint8arrays"
import { testPlatforms } from "./utils.js"

testPlatforms("open a write txn during an open read txn", async (t, openTree) => {
	const tree = openTree(t)

	await tree.read(async (readTxn) => {
		await tree.write((writeTxn) => {
			writeTxn.set(fromString("a"), fromString("foo"))
			writeTxn.set(fromString("b"), fromString("bar"))
			writeTxn.set(fromString("c"), fromString("baz"))
		})

		t.is(readTxn.get(fromString("a")), null)
		t.is(readTxn.get(fromString("b")), null)
		t.is(readTxn.get(fromString("c")), null)
	})

	await tree.read(async (readTxn) => {
		t.deepEqual(readTxn.get(fromString("a")), fromString("foo"))
		t.deepEqual(readTxn.get(fromString("b")), fromString("bar"))
		t.deepEqual(readTxn.get(fromString("c")), fromString("baz"))
	})
})

testPlatforms("open concurrent writes", async (t, openTree) => {
	const tree = openTree(t)

	let index = 0
	const order = await Promise.all([
		tree.write(async (txn) => {
			await setTimeout(500)
			return index++
		}),
		tree.write(async (txn) => {
			await setTimeout(500)
			return index++
		}),
	])

	t.deepEqual(order, [0, 1])
})

testPlatforms("open lots of concurrent writes", async (t, openTree) => {
	const tree = openTree(t)

	let index = 0
	const order = await Promise.all([
		tree.write(async (txn) => {
			await setTimeout(Math.ceil(Math.random() * 100))
			return index++
		}),
		tree.write(async (txn) => {
			await setTimeout(Math.ceil(Math.random() * 100))
			return index++
		}),
		tree.write(async (txn) => {
			await setTimeout(Math.ceil(Math.random() * 100))
			return index++
		}),
		tree.write(async (txn) => {
			await setTimeout(Math.ceil(Math.random() * 100))
			return index++
		}),
		tree.write(async (txn) => {
			await setTimeout(Math.ceil(Math.random() * 100))
			return index++
		}),
	])

	t.deepEqual(order, [0, 1, 2, 3, 4])
})
