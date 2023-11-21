import test from "ava"

import { getEnvironment, encode as e } from "./utils.js"

test("get/set/delete", async (t) => {
	const env = getEnvironment(t, {})

	await env.write((txn) => {
		const dbi = txn.openDatabase(null)
		txn.set(dbi, e("a"), e("foo"))
		txn.set(dbi, e("b"), e("bar"))
		txn.set(dbi, e("c"), e("baz"))
	})

	await env.read((txn) => {
		const dbi = txn.openDatabase(null)
		t.deepEqual(txn.get(dbi, e("a")), e("foo"))
		t.deepEqual(txn.get(dbi, e("b")), e("bar"))
		t.deepEqual(txn.get(dbi, e("c")), e("baz"))
		t.deepEqual(txn.get(dbi, e("d")), null)
	})

	await env.write(async (txn) => {
		const dbi = txn.openDatabase(null)
		txn.delete(dbi, e("b"))
		// txn.delete(dbi, e("d"))
	})

	t.is(await env.read((txn) => txn.get(txn.openDatabase(null), e("b"))), null)
})

test("entries", async (t) => {
	const env = getEnvironment(t, {})

	await env.write((txn) => {
		const dbi = txn.openDatabase(null)
		txn.set(dbi, e("a"), e("foo"))
		txn.set(dbi, e("b"), e("bar"))
		txn.set(dbi, e("c"), e("baz"))
		txn.set(dbi, e("g"), e("ooo"))
		txn.set(dbi, e("h"), e("aaa"))
	})

	await env.read(async (txn) => {
		const dbi = txn.openDatabase(null)
		t.deepEqual(Array.from(txn.entries(dbi)), [
			[e("a"), e("foo")],
			[e("b"), e("bar")],
			[e("c"), e("baz")],
			[e("g"), e("ooo")],
			[e("h"), e("aaa")],
		])
	})

	// inclusive lower bound
	await env.read(async (txn) => {
		const dbi = txn.openDatabase(null)
		t.deepEqual(Array.from(txn.entries(dbi, { key: e("b"), inclusive: true })), [
			[e("b"), e("bar")],
			[e("c"), e("baz")],
			[e("g"), e("ooo")],
			[e("h"), e("aaa")],
		])
	})

	// exclusive lower bound
	await env.read(async (txn) => {
		const dbi = txn.openDatabase(null)
		t.deepEqual(Array.from(txn.entries(dbi, { key: e("b"), inclusive: false })), [
			[e("c"), e("baz")],
			[e("g"), e("ooo")],
			[e("h"), e("aaa")],
		])
	})

	// inclusive upper bound
	await env.read(async (txn) => {
		const dbi = txn.openDatabase(null)
		t.deepEqual(Array.from(txn.entries(dbi, null, { key: e("b"), inclusive: true })), [
			[e("a"), e("foo")],
			[e("b"), e("bar")],
		])
	})

	// exclusive upper bound
	await env.read(async (txn) => {
		const dbi = txn.openDatabase(null)
		t.deepEqual(Array.from(txn.entries(dbi, null, { key: e("b"), inclusive: false })), [[e("a"), e("foo")]])
	})

	// upper bound out-of-range
	await env.read(async (txn) => {
		const dbi = txn.openDatabase(null)
		t.deepEqual(Array.from(txn.entries(dbi, null, { key: e("x"), inclusive: false })), [
			[e("a"), e("foo")],
			[e("b"), e("bar")],
			[e("c"), e("baz")],
			[e("g"), e("ooo")],
			[e("h"), e("aaa")],
		])
	})

	// lower bound out-of-range
	await env.read(async (txn) => {
		const dbi = txn.openDatabase(null)
		t.deepEqual(Array.from(txn.entries(dbi, { key: e("7"), inclusive: false }, null)), [
			[e("a"), e("foo")],
			[e("b"), e("bar")],
			[e("c"), e("baz")],
			[e("g"), e("ooo")],
			[e("h"), e("aaa")],
		])
	})

	// reverse inclusive lower bound
	await env.read(async (txn) => {
		const dbi = txn.openDatabase(null)
		t.deepEqual(Array.from(txn.entries(dbi, { key: e("b"), inclusive: true }, null, { reverse: true })), [
			[e("h"), e("aaa")],
			[e("g"), e("ooo")],
			[e("c"), e("baz")],
			[e("b"), e("bar")],
		])
	})

	// reverse exclusive lower bound
	await env.read(async (txn) => {
		const dbi = txn.openDatabase(null)
		t.deepEqual(Array.from(txn.entries(dbi, { key: e("b"), inclusive: false }, null, { reverse: true })), [
			[e("h"), e("aaa")],
			[e("g"), e("ooo")],
			[e("c"), e("baz")],
		])
	})

	// reverse inclusive upper bound
	await env.read(async (txn) => {
		const dbi = txn.openDatabase(null)
		t.deepEqual(Array.from(txn.entries(dbi, null, { key: e("b"), inclusive: true }, { reverse: true })), [
			[e("b"), e("bar")],
			[e("a"), e("foo")],
		])
	})

	// reverse exclusive upper bound
	await env.read(async (txn) => {
		const dbi = txn.openDatabase(null)
		t.deepEqual(Array.from(txn.entries(dbi, null, { key: e("c"), inclusive: false }, { reverse: true })), [
			[e("b"), e("bar")],
			[e("a"), e("foo")],
		])
	})

	// reverse exclusive upper bound
	await env.read(async (txn) => {
		const dbi = txn.openDatabase(null)
		t.deepEqual(Array.from(txn.entries(dbi, null, { key: e("d"), inclusive: false }, { reverse: true })), [
			[e("c"), e("baz")],
			[e("b"), e("bar")],
			[e("a"), e("foo")],
		])
	})
})
