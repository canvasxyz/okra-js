import test from "ava"

import { getEnvironment, encode, decode } from "./utils.js"

test("named databases", async (t) => {
	const env = getEnvironment(t, { databases: 4 })

	await env.write((txn) => {
		const x = txn.openDatabase("x")
		const y = txn.openDatabase("y")
		txn.set(encode("a"), encode("xxx"), { dbi: x })
		txn.set(encode("b"), encode("xxx"), { dbi: x })
		txn.set(encode("a"), encode("yyy"), { dbi: y })
	})

	t.deepEqual(await env.read((txn) => txn.get(encode("a")), { dbi: "x" }), encode("xxx"))
	t.deepEqual(await env.read((txn) => txn.get(encode("b")), { dbi: "x" }), encode("xxx"))
	t.deepEqual(await env.read((txn) => txn.get(encode("a")), { dbi: "y" }), encode("yyy"))
	t.deepEqual(await env.read((txn) => txn.get(encode("b")), { dbi: "y" }), null)
})
