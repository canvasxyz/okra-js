import test, { ExecutionContext } from "ava"

import { bytesToHex as hex } from "@noble/hashes/utils"

import { Builder, Metadata, Tree } from "@canvas-js/okra"

import { compareEntries, iota, shuffle } from "./utils.js"
import { MemoryTree, MemoryStore } from "@canvas-js/okra-memory"

const metadata: Metadata = { K: 16, Q: 4 }
test("set and get userdata", async (t) => {
	const tree = await MemoryTree.open(metadata)
	const root = await tree.getRoot()
	t.deepEqual(root, { level: 0, key: null, hash: Buffer.from("af1349b9f5f9a1a6a0404dea36dcc949", "hex") })

	t.is(await tree.getUserdata(), null)

	const userdata = Buffer.from("hello world")
	await tree.setUserdata(userdata)
	t.deepEqual(await tree.getUserdata(), userdata)

	await tree.setUserdata(null)
	t.is(await tree.getUserdata(), null)
})
