import test, { ExecutionContext } from "ava"
import { Entry } from "@canvas-js/okra"
import { MemoryTree } from "@canvas-js/okra-memory"

import { Tree } from "@canvas-js/okra-node"
import { compareEntries, map, random, getEnvironment } from "./utils.js"

async function* toAsync<T>(iter: Iterable<T>): AsyncIterable<T> {
	for (const value of iter) {
		yield value
	}
}

async function compare(t: ExecutionContext, entries: Iterable<Entry>) {
	const memoryTree = await MemoryTree.open()
	const env = getEnvironment(t)

	await env.write((txn) =>
		Tree.open(txn, null, async (tree) => {
			for (const [key, value] of entries) {
				tree.set(key, value)
				await memoryTree.set(key, value)
			}
		})
	)

	t.is(
		await env.read((txn) =>
			compareEntries(t, toAsync(txn.entries(txn.openDatabase(null))), memoryTree.store.entries())
		),
		0
	)
}

test("cross-reference a tree with 3 static entries", async (t) => {
	const encoder = new TextEncoder()
	await compare(t, [
		[encoder.encode("a"), encoder.encode("foo")],
		[encoder.encode("b"), encoder.encode("bar")],
		[encoder.encode("c"), encoder.encode("baz")],
	])
})

test("cross-reference a tree with 100 random entries", async (t) => {
	const iterations = 10
	for (let i = 0; i < iterations; i++) {
		const entries: Iterable<Entry> = map(random(i.toString(), 0, 0xffff, 100), (j) => {
			const key = Buffer.alloc(2)
			key.writeUint16BE(j, 0)
			return [key, key]
		})

		await compare(t, entries)
	}
})

test("cross-reference a tree with 5000 random entries", async (t) => {
	t.timeout(20 * 1000)
	const entries: Iterable<Entry> = map(random("", 0, 0xffffffff, 5000), (i) => {
		const key = Buffer.alloc(4)
		key.writeUint32BE(i, 0)
		return [key, key]
	})

	await compare(t, entries)
})

// TODO: instantiate a JavaScript Tree implementation using the Zig LMDB bindings?
