import test, { ExecutionContext } from "ava"

import "fake-indexeddb/auto"
import { openDB } from "idb"

import { hexToBytes } from "@noble/hashes/utils"

import { Tree } from "@canvas-js/okra"
import { IDBNodeStore } from "@canvas-js/okra-idb"

async function openStore(t: ExecutionContext) {
	const storeName = "test/db/store"

	const db = await openDB("test/db", 1, {
		upgrade(db, oldVersion, newVersion, txn) {
			db.createObjectStore(storeName)
		},
	})

	t.teardown(() => db.close())
	return new IDBNodeStore(db, storeName, "readwrite")
}

test("open tree", async (t) => {
	const store = await openStore(t)
	const tree = await Tree.open(store)
	const root = await tree.getRoot()
	t.deepEqual(root, { level: 0, key: null, hash: hexToBytes("af1349b9f5f9a1a6a0404dea36dcc949") })
})

test("get/set/delete", async (t) => {
	const store = await openStore(t)
	const tree = await Tree.open(store)

	const encoder = new TextEncoder()
	const e = (value: string) => encoder.encode(value)

	await tree.set(e("a"), e("foo"))
	await tree.set(e("a"), e("bar"))

	t.deepEqual(await tree.get(e("a")), e("bar"))
	await tree.delete(e("a"))
	t.deepEqual(await tree.get(e("a")), null)
	await tree.delete(e("a"))
	t.deepEqual(await tree.get(e("a")), null)
})
