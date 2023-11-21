import test from "ava"

import { getEnvironment, encode as e } from "./utils.js"

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

test("open a write txn during an open read txn", async (t) => {
	const env = getEnvironment(t)
	await env.read(async (txnA) => {
		const dbiA = txnA.openDatabase(null)
		await env.write(async (txnB) => {
			const dbiB = txnB.openDatabase(null)
			await wait(300)

			txnB.set(dbiB, e("a"), e("foo"))
			txnB.set(dbiB, e("b"), e("bar"))
			txnB.set(dbiB, e("c"), e("baz"))
		})

		t.is(txnA.get(dbiA, e("a")), null)
		t.deepEqual(await env.read((txnC) => txnC.get(txnC.openDatabase(null), e("a"))), e("foo"))
	})
})

test("open concurrent writes", async (t) => {
	const env = getEnvironment(t)

	let index = 0
	const order = await Promise.all([
		env.write(async (txn) => {
			await wait(500)
			return index++
		}),
		env.write(async (txn) => {
			await wait(500)
			return index++
		}),
	])

	t.deepEqual(order, [0, 1])
})

test("open lots of concurrent writes", async (t) => {
	const env = getEnvironment(t)

	let index = 0
	const order = await Promise.all([
		env.write(async (txn) => {
			await wait(Math.ceil(Math.random() * 100))
			return index++
		}),
		env.write(async (txn) => {
			await wait(Math.ceil(Math.random() * 100))
			return index++
		}),
		env.write(async (txn) => {
			await wait(Math.ceil(Math.random() * 100))
			return index++
		}),
		env.write(async (txn) => {
			await wait(Math.ceil(Math.random() * 100))
			return index++
		}),
		env.write(async (txn) => {
			await wait(Math.ceil(Math.random() * 100))
			return index++
		}),
	])

	t.deepEqual(order, [0, 1, 2, 3, 4])
})
