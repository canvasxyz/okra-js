import test, { ExecutionContext } from "ava"

import { Builder, Metadata, Node, DEFAULT_METADATA } from "@canvas-js/okra"

import { NodeStore } from "@canvas-js/okra-memory"

import { iota } from "./utils.js"
import { fixtures } from "./fixtures.js"

const testIota = (count: number, root: Node, metadata: Partial<Metadata>) => async (t: ExecutionContext) => {
	const store = new NodeStore({ ...DEFAULT_METADATA, ...metadata })
	store.initialize()

	const builder = new Builder(store)
	for (const [key, value] of iota(count)) {
		await builder.set(key, value)
	}

	t.deepEqual(await builder.finalize(), root)
}

for (const { count, root, metadata } of fixtures) {
	test(`build iota(${count})`, testIota(count, root, metadata))
}
