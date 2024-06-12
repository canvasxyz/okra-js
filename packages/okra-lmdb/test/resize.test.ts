import { randomBytes } from "node:crypto"
import test from "ava"

import { Environment, Transaction, Database } from "@canvas-js/okra-lmdb/lmdb"
import { getDirectory } from "./utils.js"

test("fill environment", async (t) => {
	const mapSize = 4096 * 16
	const env = new Environment(getDirectory(t), { mapSize })
	console.log("env.info", env.info())
	t.is(env.info().mapSize, mapSize)

	const txn = new Transaction(env, false, null)
	try {
		const db = new Database(txn, null)
		for (let i = 0; i < 512; i++) {
			db.set(randomBytes(32), randomBytes(32))
		}
		txn.commit()
	} catch (err) {
		txn.abort()
	}

	t.pass()
})
