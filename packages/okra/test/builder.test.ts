import test, { ExecutionContext } from "ava"

import { Builder, Metadata, Node, DEFAULT_METADATA, Mode } from "@canvas-js/okra"

import { NodeStore } from "@canvas-js/okra-memory"

import { iota } from "./utils.js"
import { fixtures } from "./fixtures.js"
import { randomBytes } from "@noble/hashes/utils"

const testIota = (count: number, root: Node, metadata: Partial<Metadata>) => async (t: ExecutionContext) => {
	const store = new NodeStore({ ...DEFAULT_METADATA, ...metadata })
	store.initialize()

	const builder = new Builder(store)
	for (const [key, value] of iota(count)) {
		builder.set(key, value)
	}

	t.deepEqual(builder.finalize(), root)
}

for (const { count, root, metadata } of fixtures) {
	test(`build iota(${count})`, testIota(count, root, metadata))
}

test("build 2000 entries", async (t) => {
	const count = 2000
	const entries: [Uint8Array, { hash: Uint8Array }][] = []
	for (let i = 0; i < count; i++) {
		entries.push([randomBytes(20), { hash: randomBytes(16) }])
	}

	const start = performance.now()

	const store = new NodeStore({ ...DEFAULT_METADATA, mode: Mode.Index })
	store.initialize()

	const builder = new Builder(store)
	for (const [key, value] of entries) {
		builder.set(key, value)
	}

	builder.finalize()

	const delta = performance.now() - start
	t.log(`initialize ${count} entries in ${Math.round(delta)}ms`)
	t.pass()
})
