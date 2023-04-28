import test from "ava"

import { compareEntries, iota } from "./utils.js"
import { MemoryStore } from "@canvas-js/okra-memory"

test("compare entries iota(10)", async (t) => {
	const [a, b] = [new MemoryStore(), new MemoryStore()]
	for (const [key, value] of iota(10)) {
		await a.db.put(key, value)
		await b.db.put(key, value)
	}

	const delta = await compareEntries(t, a.db.iterator(), b.db.iterator())
	t.is(delta, 0)
})

test("compare entries iota(100)", async (t) => {
	const [a, b] = [new MemoryStore(), new MemoryStore()]

	for (const [key, value] of iota(100)) {
		await a.db.put(key, value)
		await b.db.put(key, value)
	}

	const delta = await compareEntries(t, a.db.iterator(), b.db.iterator())
	t.is(delta, 0)
})

test("compare entries iota(100) % 1", async (t) => {
	const [a, b] = [new MemoryStore(), new MemoryStore()]

	for (const [key, value] of iota(100)) {
		await a.db.put(key, value)
		await b.db.put(key, value)
	}

	await b.db.del(new Uint8Array([0x00, 0x00, 0x00, 0x0f]))

	const delta = await compareEntries(t, a.db.iterator(), b.db.iterator())
	t.is(delta, 1)
})

test("compare entries iota(45) % iota(50)", async (t) => {
	const [a, b] = [new MemoryStore(), new MemoryStore()]

	for (const [key, value] of iota(45)) await a.db.put(key, value)
	for (const [key, value] of iota(50)) await b.db.put(key, value)

	const delta = await compareEntries(t, a.db.iterator(), b.db.iterator())
	t.is(delta, 5)
})

test("compare entries iota(15) % iota(10)", async (t) => {
	const [a, b] = [new MemoryStore(), new MemoryStore()]

	for (const [key, value] of iota(15)) await a.db.put(key, value)
	for (const [key, value] of iota(10)) await b.db.put(key, value)

	const delta = await compareEntries(t, a.db.iterator(), b.db.iterator())
	t.is(delta, 5)
})
