import test from "ava"

import { getEnvironment, encode } from "./utils.js"

test("named databases", async (t) => {
	const env = getEnvironment(t, { databases: 4 })

	await env.write((txn) => {
		const x = txn.database("x")
		x.set(encode("a"), encode("xxx"))
		x.set(encode("b"), encode("xxx"))

		const y = txn.database("y")
		y.set(encode("a"), encode("yyy"))
	})

	t.deepEqual(await env.read((txn) => txn.database("x").get(encode("a"))), encode("xxx"))
	t.deepEqual(await env.read((txn) => txn.database("x").get(encode("b"))), encode("xxx"))
	t.deepEqual(await env.read((txn) => txn.database("y").get(encode("a"))), encode("yyy"))
	t.deepEqual(await env.read((txn) => txn.database("y").get(encode("b"))), null)
})
