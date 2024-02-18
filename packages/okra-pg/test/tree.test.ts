import test, { ExecutionContext } from "ava"
import { text } from "node:stream/consumers"

import pg from "pg"

import { Sha256Hasher, Blake3Hasher, PostgresTree } from "@canvas-js/okra-pg"
import { blake3 } from "@noble/hashes/blake3"
import { bytesToHex as hex } from "@noble/hashes/utils"

import {
	Sha256Hasher as SqliteSha256Hasher,
	Blake3Hasher as SqliteBlake3Hasher,
	Tree as SqliteTree,
} from "@canvas-js/okra-sqlite"

const getVal = (index: number) => {
	const buffer = new ArrayBuffer(4)
	const view = new DataView(buffer)
	view.setUint32(0, index)
	const key = new Uint8Array(buffer, 0, 4)
	const value = blake3(key, { dkLen: 4 })
	return [key, value]
}

const getTree = async ({ prefix, items }: { prefix?: string; items?: number } = {}) => {
	const path = "postgresql://localhost:5432/test" // TODO
	const client = new pg.Client(path)

	const hasher = new Sha256Hasher({ size: new ArrayBuffer(4), K: 16 })
	const tree = await PostgresTree.initialize(client, { K: 16, Q: 4, clear: true, hasher, prefix })

	if (items !== undefined) {
		for (let i = 0; i < items; i++) {
			const [key, value] = getVal(i)
			await tree.set(key, value)
		}
	}

	return tree
}

const getSqliteTree = () => {
	const sqliteHasher = new SqliteSha256Hasher({ size: new ArrayBuffer(4), K: 16 })
	const sqliteTree = new SqliteTree(null, { K: 16, Q: 4, hasher: sqliteHasher })
	return sqliteTree
}

test.serial("compare pg to sqlite(1000)", async (t) => {
	const tree = await getTree()
	const sqliteTree = getSqliteTree()

	for (let i = 0; i < 1000; i++) {
		const [key, value] = getVal(i)
		await tree.set(key, value)
		await sqliteTree.set(key, value)
	}

	const pgRoot = await tree.getRoot()
	await tree.close()
	t.deepEqual(pgRoot, sqliteTree.getRoot())
	t.pass()
})

test.serial("compare pg to sqlite(100) with interleaved deletes", async (t) => {
	const tree = await getTree()
	const sqliteTree = getSqliteTree()

	for (let i = 0; i < 100; i++) {
		const [key, value] = getVal(i)
		await tree.set(key, value)
		await sqliteTree.set(key, value)

		if (i > 50 && i % 2 === 0) {
			const [key] = getVal(i - 50)
			await tree.delete(key)
			await sqliteTree.delete(key)
		}
	}

	for (let i = 0; i < 100; i++) {
		const [key] = getVal(i)
		t.deepEqual(await tree.getValue(key), sqliteTree.getValue(key))
	}

	const pgRoot = await tree.getRoot()
	await tree.close()
	t.deepEqual(pgRoot, sqliteTree.getRoot())
	t.pass()
})

test.serial("create two trees with different prefixes", async (t) => {
	const tree1 = await getTree({ prefix: "ones" })
	const tree2 = await getTree({ prefix: "twos", items: 20 })

	t.plan(20)

	for await (const node of tree1.entries(null, null)) {
		t.fail("ones tree should be empty")
	}

	for await (const node of tree2.entries(null, null)) {
		t.pass("twos tree saw a value")
	}

	await tree1.close()
	await tree2.close()
})

test.serial("tree.entries() returns correct values", async (t) => {
	const tree = await getTree({ items: 100 })

	t.plan(100)
	let i = 0
	for await (const node of tree.entries(null, null)) {
		const [key, value] = getVal(i)
		if (node === null || node.value === null) throw new Error("tree.entries() never returns null")
		t.is(hex(node.value), hex(value))
		i++
	}
	await tree.close()
})

test.serial("tree.entries() returns expected number of values with various bounds", async (t) => {
	const tree = await getTree({ items: 100 })

	const len = async (a: AsyncIterable<any>) => {
		const result = []
		for await (const i of a) result.push(i)
		return result.length
	}

	t.is(await len(tree.entries(null, { key: getVal(10)[0], inclusive: true })), 11) // 0..10
	t.is(await len(tree.entries(null, { key: getVal(10)[0], inclusive: false })), 10) // 0...10

	t.is(await len(tree.entries({ key: getVal(90)[0], inclusive: true }, null)), 10) // 90..100
	t.is(await len(tree.entries({ key: getVal(90)[0], inclusive: false }, null)), 9) // 90...100

	t.is(await len(tree.entries({ key: getVal(90)[0], inclusive: true }, { key: getVal(110)[0], inclusive: false })), 10)
	t.is(await len(tree.entries({ key: getVal(60)[0], inclusive: false }, { key: getVal(90)[0], inclusive: false })), 29)
	t.is(await len(tree.entries({ key: getVal(60)[0], inclusive: true }, { key: getVal(90)[0], inclusive: true })), 31)
	t.is(await len(tree.entries({ key: getVal(0)[0], inclusive: false }, { key: getVal(17)[0], inclusive: true })), 17)

	await tree.close()
})
