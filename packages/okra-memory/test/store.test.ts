import test, { ExecutionContext } from "ava"

import { MemoryStore } from "@canvas-js/okra-memory"
import { Tree } from "@canvas-js/okra"

function getStore(t: ExecutionContext) {
	const store = new MemoryStore()
	t.teardown(() => store.close())
	return store
}

test("get/set/delete", async (t) => {
	const store = getStore(t)

	await store.set(Buffer.from("a"), Buffer.from("foo"))
	await store.set(Buffer.from("b"), Buffer.from("bar"))
	await store.set(Buffer.from("c"), Buffer.from("baz"))

	t.deepEqual(await store.get(Buffer.from("b")), Buffer.from("bar"))
	await store.delete(Buffer.from("b"))
	t.deepEqual(await store.get(Buffer.from("b")), null)
})

test("open tree", async (t) => {
	const store = getStore(t)
	const tree = await Tree.open(store)
	const root = await tree.getRoot()
	t.deepEqual(root, { level: 0, key: null, hash: Buffer.from("af1349b9f5f9a1a6a0404dea36dcc949", "hex") })
})
