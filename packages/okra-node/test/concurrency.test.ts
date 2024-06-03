import test from "ava"

import { hexToBytes as hex } from "@noble/hashes/utils"

import { getEnvironment, readTree, writeTree } from "./utils.js"

const encoder = new TextEncoder()
const encode = (value: string) => encoder.encode(value)

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

test.serial("open a write txn during an open read txn", async (t) => {
	const env = getEnvironment(t)

	await writeTree(env, () => {})
	await readTree(env, async (treeA) => {
		const rootB = await writeTree(env, async (treeB) => {
			await wait(100)
			treeB.set(encode("a"), encode("foo"))
			treeB.set(encode("b"), encode("bar"))
			treeB.set(encode("c"), encode("baz"))
			return treeB.getRoot()
		})

		t.deepEqual(rootB, {
			level: 1,
			key: null,
			hash: hex("f8acdc73fb2e1cc001d82a87ce3d2553"),
		})

		t.deepEqual(treeA.getRoot(), {
			level: 0,
			key: null,
			hash: hex("e3b0c44298fc1c149afbf4c8996fb924"),
		})

		t.deepEqual(await readTree(env, (treeC) => treeC.getRoot()), rootB)
	})
})

test("open concurrent writes", async (t) => {
	const env = getEnvironment(t)
	await writeTree(env, () => {})

	let index = 0
	const order = await Promise.all([
		writeTree(env, async (tree) => {
			await wait(500)
			return index++
		}),
		writeTree(env, async (tree) => {
			await wait(500)
			return index++
		}),
	])

	t.deepEqual(order, [0, 1])
})

test("open lots of concurrent writes", async (t) => {
	const env = getEnvironment(t)
	await writeTree(env, () => {})

	let index = 0
	const order = await Promise.all([
		writeTree(env, async (txn) => {
			await wait(Math.ceil(Math.random() * 100))
			return index++
		}),
		writeTree(env, async (txn) => {
			await wait(Math.ceil(Math.random() * 100))
			return index++
		}),
		writeTree(env, async (txn) => {
			await wait(Math.ceil(Math.random() * 100))
			return index++
		}),
		writeTree(env, async (txn) => {
			await wait(Math.ceil(Math.random() * 100))
			return index++
		}),
		writeTree(env, async (txn) => {
			await wait(Math.ceil(Math.random() * 100))
			return index++
		}),
	])

	t.deepEqual(order, [0, 1, 2, 3, 4])
})
