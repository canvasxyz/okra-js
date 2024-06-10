import test from "ava"

import { fromString } from "uint8arrays"
import { Environment, Cursor, Transaction, Database } from "@canvas-js/okra-lmdb/lmdb"

import { getDirectory } from "./utils.js"

test("cursor operations", async (t) => {
	const env = new Environment(getDirectory(t), {})

	const txn = new Transaction(env, false, null)
	try {
		const db = new Database(txn, null)
		db.set(fromString("a"), fromString("foo"))
		db.set(fromString("b"), fromString("bar"))
		db.set(fromString("c"), fromString("baz"))

		const cursor = new Cursor(db)
		t.deepEqual(cursor.goToFirst(), fromString("a"))
		t.deepEqual(cursor.getCurrentKey(), fromString("a"))
		t.deepEqual(cursor.getCurrentValue(), fromString("foo"))
		t.deepEqual(cursor.getCurrentEntry(), [fromString("a"), fromString("foo")])

		t.deepEqual(cursor.goToNext(), fromString("b"))
		t.deepEqual(cursor.getCurrentKey(), fromString("b"))
		t.deepEqual(cursor.getCurrentValue(), fromString("bar"))
		t.deepEqual(cursor.getCurrentEntry(), [fromString("b"), fromString("bar")])

		t.deepEqual(cursor.goToNext(), fromString("c"))
		t.deepEqual(cursor.getCurrentKey(), fromString("c"))
		t.deepEqual(cursor.getCurrentValue(), fromString("baz"))
		t.deepEqual(cursor.getCurrentEntry(), [fromString("c"), fromString("baz")])

		t.is(cursor.goToNext(), null)
		t.deepEqual(cursor.getCurrentEntry(), [fromString("c"), fromString("baz")])

		t.deepEqual(cursor.goToFirst(), fromString("a"))
		t.is(cursor.goToPrevious(), null)
		t.deepEqual(cursor.getCurrentEntry(), [fromString("a"), fromString("foo")])

		db.set(fromString("f"), fromString("ooo"))
		db.set(fromString("g"), fromString("aaa"))

		t.deepEqual(cursor.seek(fromString("e")), fromString("f"))

		cursor.close()

		txn.commit()
	} catch (err) {
		txn.abort()
	}
})
