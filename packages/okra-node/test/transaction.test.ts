import test from "ava"

import { collect } from "@canvas-js/okra"

import { getEnvironment, encode } from "./utils.js"

test("get/set/delete", async (t) => {
	const env = getEnvironment(t, {})

	await env.write((txn) => {
		const db = txn.database()
		db.set(encode("a"), encode("foo"))
		db.set(encode("b"), encode("bar"))
		db.set(encode("c"), encode("baz"))
	})

	await env.read((txn) => {
		const db = txn.database()
		t.deepEqual(db.get(encode("a")), encode("foo"))
		t.deepEqual(db.get(encode("b")), encode("bar"))
		t.deepEqual(db.get(encode("c")), encode("baz"))
		t.deepEqual(db.get(encode("d")), null)
	})

	await env.write(async (txn) => {
		const db = txn.database()
		await db.delete(encode("b"))
		await db.delete(encode("d"))
	})

	t.is(await env.read((txn) => txn.database().get(encode("b"))), null)
})

test("entries", async (t) => {
	const env = getEnvironment(t, {})

	await env.write((txn) => {
		const db = txn.database()
		db.set(encode("a"), encode("foo"))
		db.set(encode("b"), encode("bar"))
		db.set(encode("c"), encode("baz"))
		db.set(encode("g"), encode("ooo"))
		db.set(encode("h"), encode("aaa"))
	})

	await env.read<void>(async (txn) => {
		t.deepEqual(await collect(txn.database().entries()), [
			[encode("a"), encode("foo")],
			[encode("b"), encode("bar")],
			[encode("c"), encode("baz")],
			[encode("g"), encode("ooo")],
			[encode("h"), encode("aaa")],
		])
	})

	// inclusive lower bound
	await env.read(async (txn) => {
		const db = txn.database()
		t.deepEqual(await collect(db.entries({ key: encode("b"), inclusive: true })), [
			[encode("b"), encode("bar")],
			[encode("c"), encode("baz")],
			[encode("g"), encode("ooo")],
			[encode("h"), encode("aaa")],
		])
	})

	// exclusive lower bound
	await env.read(async (txn) => {
		const db = txn.database()
		t.deepEqual(await collect(db.entries({ key: encode("b"), inclusive: false })), [
			[encode("c"), encode("baz")],
			[encode("g"), encode("ooo")],
			[encode("h"), encode("aaa")],
		])
	})

	// inclusive upper bound
	await env.read(async (txn) => {
		const db = txn.database()
		t.deepEqual(await collect(db.entries(null, { key: encode("b"), inclusive: true })), [
			[encode("a"), encode("foo")],
			[encode("b"), encode("bar")],
		])
	})

	// exclusive upper bound
	await env.read(async (txn) => {
		const db = txn.database()
		t.deepEqual(await collect(db.entries(null, { key: encode("b"), inclusive: false })), [[encode("a"), encode("foo")]])
	})

	// upper bound out-of-range
	await env.read(async (txn) => {
		const db = txn.database()
		t.deepEqual(await collect(db.entries(null, { key: encode("x"), inclusive: false })), [
			[encode("a"), encode("foo")],
			[encode("b"), encode("bar")],
			[encode("c"), encode("baz")],
			[encode("g"), encode("ooo")],
			[encode("h"), encode("aaa")],
		])
	})

	// lower bound out-of-range
	await env.read(async (txn) => {
		const db = txn.database()
		t.deepEqual(await collect(db.entries({ key: encode("7"), inclusive: false }, null)), [
			[encode("a"), encode("foo")],
			[encode("b"), encode("bar")],
			[encode("c"), encode("baz")],
			[encode("g"), encode("ooo")],
			[encode("h"), encode("aaa")],
		])
	})

	// reverse inclusive lower bound
	await env.read(async (txn) => {
		const db = txn.database()
		t.deepEqual(await collect(db.entries({ key: encode("b"), inclusive: true }, null, { reverse: true })), [
			[encode("h"), encode("aaa")],
			[encode("g"), encode("ooo")],
			[encode("c"), encode("baz")],
			[encode("b"), encode("bar")],
		])
	})

	// reverse exclusive lower bound
	await env.read(async (txn) => {
		const db = txn.database()
		t.deepEqual(await collect(db.entries({ key: encode("b"), inclusive: false }, null, { reverse: true })), [
			[encode("h"), encode("aaa")],
			[encode("g"), encode("ooo")],
			[encode("c"), encode("baz")],
		])
	})

	// reverse inclusive upper bound
	await env.read(async (txn) => {
		const db = txn.database()
		t.deepEqual(await collect(db.entries(null, { key: encode("b"), inclusive: true }, { reverse: true })), [
			[encode("b"), encode("bar")],
			[encode("a"), encode("foo")],
		])
	})

	// reverse exclusive upper bound
	await env.read(async (txn) => {
		const db = txn.database()
		t.deepEqual(await collect(db.entries(null, { key: encode("c"), inclusive: false }, { reverse: true })), [
			[encode("b"), encode("bar")],
			[encode("a"), encode("foo")],
		])
	})

	// reverse exclusive upper bound
	await env.read(async (txn) => {
		const db = txn.database()
		t.deepEqual(await collect(db.entries(null, { key: encode("d"), inclusive: false }, { reverse: true })), [
			[encode("c"), encode("baz")],
			[encode("b"), encode("bar")],
			[encode("a"), encode("foo")],
		])
	})
})
