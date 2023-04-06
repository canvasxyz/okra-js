import test, { ExecutionContext } from "ava"

import { build } from "@canvas-js/okra-level"
import { bytesToHex } from "@noble/hashes/utils"

import { getDB, iota } from "./utils.js"

const testIota = (count: number, rootLevel: number, rootHashPrefix: string) => async (t: ExecutionContext) => {
	const db = getDB()
	const root = await build(db, iota(count))
	t.is(root.level, rootLevel)
	t.is(bytesToHex(root.hash).slice(0, rootHashPrefix.length), rootHashPrefix)
}

test("build iota(0)", testIota(0, 0, "af1349b9"))
test("build iota(10)", testIota(10, 4, "29f0468d"))
test("build iota(100)", testIota(100, 4, "b389c726"))
test("build iota(1000)", testIota(1000, 7, "42f378b6"))
test("build iota(10000)", testIota(10000, 9, "f3f55398"))
test("build iota(100000)", testIota(100000, 8, "f7fe5a93"))
