import test from "ava"

import { Cursor } from "@canvas-js/okra-node"

import { getEnvironment, encode as e } from "./utils.js"

test("cursor operations", async (t) => {
	const env = getEnvironment(t, {})

	await env.write((txn) => {
		const dbi = txn.openDatabase(null)
		txn.set(dbi, e("a"), e("foo"))
		txn.set(dbi, e("b"), e("bar"))
		txn.set(dbi, e("c"), e("baz"))

		const cursor = new Cursor(txn, dbi)
		t.deepEqual(cursor.goToFirst(), e("a"))
		t.deepEqual(cursor.getCurrentKey(), e("a"))
		t.deepEqual(cursor.getCurrentValue(), e("foo"))
		t.deepEqual(cursor.getCurrentEntry(), [e("a"), e("foo")])

		t.deepEqual(cursor.goToNext(), e("b"))
		t.deepEqual(cursor.getCurrentKey(), e("b"))
		t.deepEqual(cursor.getCurrentValue(), e("bar"))
		t.deepEqual(cursor.getCurrentEntry(), [e("b"), e("bar")])

		t.deepEqual(cursor.goToNext(), e("c"))
		t.deepEqual(cursor.getCurrentKey(), e("c"))
		t.deepEqual(cursor.getCurrentValue(), e("baz"))
		t.deepEqual(cursor.getCurrentEntry(), [e("c"), e("baz")])

		t.is(cursor.goToNext(), null)
		t.deepEqual(cursor.getCurrentEntry(), [e("c"), e("baz")])

		t.deepEqual(cursor.goToFirst(), e("a"))
		t.is(cursor.goToPrevious(), null)
		t.deepEqual(cursor.getCurrentEntry(), [e("a"), e("foo")])

		txn.set(dbi, e("f"), e("ooo"))
		txn.set(dbi, e("g"), e("aaa"))

		t.deepEqual(cursor.seek(e("e")), e("f"))

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
