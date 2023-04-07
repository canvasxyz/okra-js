import test from "ava"

import { compareEntries, getDB, iota, encodingOptions } from "./utils.js"

test("compare entries iota(10)", async (t) => {
	const [a, b] = [getDB(t), getDB(t)]

	for (const [key, value] of iota(10)) {
		await a.put(key, value, encodingOptions)
		await b.put(key, value, encodingOptions)
	}

	const delta = await compareEntries(t, a.iterator(encodingOptions), b.iterator(encodingOptions))
	t.is(delta, 0)
})

test("compare entries iota(100)", async (t) => {
	const [a, b] = [getDB(t), getDB(t)]

	for (const [key, value] of iota(100)) {
		await a.put(key, value, encodingOptions)
		await b.put(key, value, encodingOptions)
	}

	const delta = await compareEntries(t, a.iterator(encodingOptions), b.iterator(encodingOptions))
	t.is(delta, 0)
})

test("compare entries iota(100) % 1", async (t) => {
	const [a, b] = [getDB(t), getDB(t)]

	for (const [key, value] of iota(100)) {
		await a.put(key, value, encodingOptions)
		await b.put(key, value, encodingOptions)
	}

	await b.del(new Uint8Array([0x00, 0x00, 0x00, 0x0f]), encodingOptions)

	const delta = await compareEntries(t, a.iterator(encodingOptions), b.iterator(encodingOptions))
	t.is(delta, 1)
})

test("compare entries iota(45) % iota(50)", async (t) => {
	const [a, b] = [getDB(t), getDB(t)]

	for (const [key, value] of iota(45)) await a.put(key, value, encodingOptions)
	for (const [key, value] of iota(50)) await b.put(key, value, encodingOptions)

	const delta = await compareEntries(t, a.iterator(encodingOptions), b.iterator(encodingOptions))
	t.is(delta, 5)
})

test("compare entries iota(15) % iota(10)", async (t) => {
	const [a, b] = [getDB(t), getDB(t)]

	for (const [key, value] of iota(15)) await a.put(key, value, encodingOptions)
	for (const [key, value] of iota(10)) await b.put(key, value, encodingOptions)

	const delta = await compareEntries(t, a.iterator(encodingOptions), b.iterator(encodingOptions))
	t.is(delta, 5)
})
