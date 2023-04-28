import test, { ExecutionContext } from "ava"

import { Builder } from "@canvas-js/okra"
import { bytesToHex as hex } from "@noble/hashes/utils"

import { iota } from "./utils.js"
import { MemoryStore } from "@canvas-js/okra-memory"

const testIota = (count: number, rootLevel: number, rootHashPrefix: string) => async (t: ExecutionContext) => {
	const builder = await Builder.open(new MemoryStore(), { K: 16, Q: 4 })
	for (const [key, value] of iota(count)) {
		await builder.set(key, value)
	}

	const root = await builder.finalize()
	t.is(root.level, rootLevel)
	t.is(hex(root.hash).slice(0, rootHashPrefix.length), rootHashPrefix)
}

test("build iota(0)", testIota(0, 0, "af1349b9"))
test("build iota(10)", testIota(10, 4, "29f0468d"))
test("build iota(100)", testIota(100, 4, "b389c726"))
test("build iota(1000)", testIota(1000, 7, "42f378b6"))
test("build iota(10000)", testIota(10000, 9, "f3f55398"))
test("build iota(100000)", testIota(100000, 8, "f7fe5a93"))
