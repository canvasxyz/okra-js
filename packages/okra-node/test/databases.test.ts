import test from "ava"

import { getEnvironment, encode as e } from "./utils.js"

test("named databases", async (t) => {
	const env = getEnvironment(t, { databases: 4 })

	await env.write((txn) => {
		const x = txn.openDatabase("x")
		const y = txn.openDatabase("y")
		txn.set(x, e("a"), e("xxx"))
		txn.set(x, e("b"), e("xxx"))
		txn.set(y, e("a"), e("yyy"))
	})

	t.deepEqual(await env.read((txn) => txn.get(txn.openDatabase("x"), e("a"))), e("xxx"))
	t.deepEqual(await env.read((txn) => txn.get(txn.openDatabase("x"), e("b"))), e("xxx"))
	t.deepEqual(await env.read((txn) => txn.get(txn.openDatabase("y"), e("a"))), e("yyy"))
	t.deepEqual(await env.read((txn) => txn.get(txn.openDatabase("y"), e("b"))), null)
})
