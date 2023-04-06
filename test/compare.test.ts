import test from "ava"

import { compareEntries, getDB, iota } from "./utils.js"

test("compare entries iota(10)", async (t) => {
	const [a, b] = [getDB(t), getDB(t)]

	for (const [key, value] of iota(10)) {
		await a.put(key, value)
		await b.put(key, value)
	}

	const delta = await compareEntries(t, a.iterator(), b.iterator())
	t.is(delta, 0)
})

test("compare entries iota(100)", async (t) => {
	const [a, b] = [getDB(t), getDB(t)]

	for (const [key, value] of iota(100)) {
		await a.put(key, value)
		await b.put(key, value)
	}

	const delta = await compareEntries(t, a.iterator(), b.iterator())
	t.is(delta, 0)
})

test("compare entries iota(100) % 1", async (t) => {
	const [a, b] = [getDB(t), getDB(t)]

	for (const [key, value] of iota(100)) {
		await a.put(key, value)
		await b.put(key, value)
	}

	await b.del(new Uint8Array([0x00, 0x00, 0x00, 0x0f]))

	const delta = await compareEntries(t, a.iterator(), b.iterator())
	t.is(delta, 1)
})

test("compare entries iota(45) % iota(50)", async (t) => {
	const [a, b] = [getDB(t), getDB(t)]

	for (const [key, value] of iota(45)) await a.put(key, value)
	for (const [key, value] of iota(50)) await b.put(key, value)

	const delta = await compareEntries(t, a.iterator(), b.iterator())
	t.is(delta, 5)
})

test("compare entries iota(15) % iota(10)", async (t) => {
	const [a, b] = [getDB(t), getDB(t)]

	for (const [key, value] of iota(15)) await a.put(key, value)
	for (const [key, value] of iota(10)) await b.put(key, value)

	const delta = await compareEntries(t, a.iterator(), b.iterator())
	t.is(delta, 5)
})
