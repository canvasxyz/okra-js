import test, { ExecutionContext } from "ava"

import "fake-indexeddb/auto"
import { openDB } from "idb"

import { hexToBytes } from "@noble/hashes/utils"

import { Tree } from "@canvas-js/okra"
import { IDBTree } from "@canvas-js/okra-idb"

async function openTree(t: ExecutionContext) {
	const storeName = "store"

	const db = await openDB(t.title, 1, {
		upgrade(db, oldVersion, newVersion, txn) {
			db.createObjectStore(storeName)
		},
	})

	t.teardown(() => db.close())

	return await IDBTree.open(db, storeName)
}

test("open tree", async (t) => {
	const tree = await openTree(t)
	const root = await tree.getRoot()
	t.deepEqual(root, { level: 0, key: null, hash: hexToBytes("e3b0c44298fc1c149afbf4c8996fb924") })
})

test("get/set/delete", async (t) => {
	const tree = await openTree(t)

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
