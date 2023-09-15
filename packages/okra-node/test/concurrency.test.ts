import test from "ava"

import { hexToBytes as hex } from "@noble/hashes/utils"

import { getEnvironment } from "./utils.js"

const encoder = new TextEncoder()
const encode = (value: string) => encoder.encode(value)

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

test("open a write txn during an open read txn", async (t) => {
	const env = getEnvironment(t)
	await env.writeTree(() => {})
	await env.readTree(async (treeA) => {
		const rootB = await env.writeTree(async (treeB) => {
			await wait(100)
			treeB.set(encode("a"), encode("foo"))
			treeB.set(encode("b"), encode("bar"))
			treeB.set(encode("c"), encode("baz"))
			return treeB.getRoot()
		})

		t.deepEqual(rootB, {
			level: 1,
			key: null,
			hash: hex("6246b94074d09feb644be1a1c12c1f50"),
		})

		t.deepEqual(treeA.getRoot(), {
			level: 0,
			key: null,
			hash: hex("af1349b9f5f9a1a6a0404dea36dcc949"),
		})

		t.deepEqual(await env.readTree((treeC) => treeC.getRoot()), rootB)
	})
})

test("open concurrent writes", async (t) => {
	const env = getEnvironment(t)
	await env.writeTree(() => {})

	let index = 0
	const order = await Promise.all([
		env.writeTree(async (tree) => {
			await wait(500)
			return index++
		}),
		env.writeTree(async (tree) => {
			await wait(500)
			return index++
		}),
	])

	t.deepEqual(order, [0, 1])
})

test("open lots of concurrent writes", async (t) => {
	const env = getEnvironment(t)
	await env.writeTree(() => {})

	let index = 0
	const order = await Promise.all([
		env.writeTree(async (txn) => {
			await wait(Math.ceil(Math.random() * 100))
			return index++
		}),
		env.writeTree(async (txn) => {
			await wait(Math.ceil(Math.random() * 100))
			return index++
		}),
		env.writeTree(async (txn) => {
			await wait(Math.ceil(Math.random() * 100))
			return index++
		}),
		env.writeTree(async (txn) => {
			await wait(Math.ceil(Math.random() * 100))
			return index++
		}),
		env.writeTree(async (txn) => {
			await wait(Math.ceil(Math.random() * 100))
			return index++
		}),
	])

	t.deepEqual(order, [0, 1, 2, 3, 4])
})
