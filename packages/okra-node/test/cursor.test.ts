import test from "ava"

import { Cursor } from "@canvas-js/okra-node"

import { getEnvironment, encode, decode } from "./utils.js"

test("cursor operations", async (t) => {
	const env = getEnvironment(t, {})

	await env.write((txn) => {
		txn.set(encode("a"), encode("foo"))
		txn.set(encode("b"), encode("bar"))
		txn.set(encode("c"), encode("baz"))

		const cursor = new Cursor(txn)
		t.deepEqual(cursor.goToFirst(), encode("a"))
		t.deepEqual(cursor.getCurrentKey(), encode("a"))
		t.deepEqual(cursor.getCurrentValue(), encode("foo"))
		t.deepEqual(cursor.getCurrentEntry(), [encode("a"), encode("foo")])

		t.deepEqual(cursor.goToNext(), encode("b"))
		t.deepEqual(cursor.getCurrentKey(), encode("b"))
		t.deepEqual(cursor.getCurrentValue(), encode("bar"))
		t.deepEqual(cursor.getCurrentEntry(), [encode("b"), encode("bar")])

		t.deepEqual(cursor.goToNext(), encode("c"))
		t.deepEqual(cursor.getCurrentKey(), encode("c"))
		t.deepEqual(cursor.getCurrentValue(), encode("baz"))
		t.deepEqual(cursor.getCurrentEntry(), [encode("c"), encode("baz")])

		t.is(cursor.goToNext(), null)
		t.deepEqual(cursor.getCurrentEntry(), [encode("c"), encode("baz")])

		t.deepEqual(cursor.goToFirst(), encode("a"))
		t.is(cursor.goToPrevious(), null)
		t.deepEqual(cursor.getCurrentEntry(), [encode("a"), encode("foo")])

		txn.set(encode("f"), encode("ooo"))
		txn.set(encode("g"), encode("aaa"))

		t.deepEqual(cursor.seek(encode("e")), encode("f"))

		cursor.close()
	})

	t.pass()
})

// test("bounds", async (t) => {
// 	const env = getEnvironment(t, { codec: string })

// 	await env.write((txn) => {
// 		txn.set("a", "foo")
// 		txn.set("b", "bar")
// 		txn.set("c", "baz")
// 		txn.set("f", "ooo")
// 		txn.set("g", "aaa")

// 		const cursor = new Cursor(txn)
// 		console.log(cursor.seek("j"))
// 		cursor.close()
// 	})

// 	t.pass()
// })
