import test from "ava"

import { collect } from "@canvas-js/okra"

import { getEnvironment, encode, decode } from "./utils.js"

test("get/set/delete", async (t) => {
	const env = getEnvironment(t, {})

	await env.write((txn) => {
		txn.set(encode("a"), encode("foo"))
		txn.set(encode("b"), encode("bar"))
		txn.set(encode("c"), encode("baz"))
	})

	await env.read((txn) => {
		t.deepEqual(txn.get(encode("a")), encode("foo"))
		t.deepEqual(txn.get(encode("b")), encode("bar"))
		t.deepEqual(txn.get(encode("c")), encode("baz"))
		t.deepEqual(txn.get(encode("d")), null)
	})

	await env.write(async (txn) => {
		await txn.delete(encode("b"))
		await txn.delete(encode("d"))
	})

	t.is(await env.read((txn) => txn.get(encode("b"))), null)
})

test("entries", async (t) => {
	const env = getEnvironment(t, {})

	await env.write((txn) => {
		txn.set(encode("a"), encode("foo"))
		txn.set(encode("b"), encode("bar"))
		txn.set(encode("c"), encode("baz"))
		txn.set(encode("g"), encode("ooo"))
		txn.set(encode("h"), encode("aaa"))
	})

	await env.read(async (txn) => {
		t.deepEqual(await collect(txn.entries()), [
			[encode("a"), encode("foo")],
			[encode("b"), encode("bar")],
			[encode("c"), encode("baz")],
			[encode("g"), encode("ooo")],
			[encode("h"), encode("aaa")],
		])
	})

	// inclusive lower bound
	await env.read(async (txn) => {
		t.deepEqual(await collect(txn.entries({ key: encode("b"), inclusive: true })), [
			[encode("b"), encode("bar")],
			[encode("c"), encode("baz")],
			[encode("g"), encode("ooo")],
			[encode("h"), encode("aaa")],
		])
	})

	// exclusive lower bound
	await env.read(async (txn) => {
		t.deepEqual(await collect(txn.entries({ key: encode("b"), inclusive: false })), [
			[encode("c"), encode("baz")],
			[encode("g"), encode("ooo")],
			[encode("h"), encode("aaa")],
		])
	})

	// inclusive upper bound
	await env.read(async (txn) => {
		t.deepEqual(await collect(txn.entries(null, { key: encode("b"), inclusive: true })), [
			[encode("a"), encode("foo")],
			[encode("b"), encode("bar")],
		])
	})

	// exclusive upper bound
	await env.read(async (txn) => {
		t.deepEqual(await collect(txn.entries(null, { key: encode("b"), inclusive: false })), [
			[encode("a"), encode("foo")],
		])
	})

	// upper bound out-of-range
	await env.read(async (txn) => {
		t.deepEqual(await collect(txn.entries(null, { key: encode("x"), inclusive: false })), [
			[encode("a"), encode("foo")],
			[encode("b"), encode("bar")],
			[encode("c"), encode("baz")],
			[encode("g"), encode("ooo")],
			[encode("h"), encode("aaa")],
		])
	})

	// lower bound out-of-range
	await env.read(async (txn) => {
		t.deepEqual(await collect(txn.entries({ key: encode("7"), inclusive: false }, null)), [
			[encode("a"), encode("foo")],
			[encode("b"), encode("bar")],
			[encode("c"), encode("baz")],
			[encode("g"), encode("ooo")],
			[encode("h"), encode("aaa")],
		])
	})

	// reverse inclusive lower bound
	await env.read(async (txn) => {
		t.deepEqual(await collect(txn.entries({ key: encode("b"), inclusive: true }, null, { reverse: true })), [
			[encode("h"), encode("aaa")],
			[encode("g"), encode("ooo")],
			[encode("c"), encode("baz")],
			[encode("b"), encode("bar")],
		])
	})

	// reverse exclusive lower bound
	await env.read(async (txn) => {
		t.deepEqual(await collect(txn.entries({ key: encode("b"), inclusive: false }, null, { reverse: true })), [
			[encode("h"), encode("aaa")],
			[encode("g"), encode("ooo")],
			[encode("c"), encode("baz")],
		])
	})

	// reverse inclusive upper bound
	await env.read(async (txn) => {
		t.deepEqual(await collect(txn.entries(null, { key: encode("b"), inclusive: true }, { reverse: true })), [
			[encode("b"), encode("bar")],
			[encode("a"), encode("foo")],
		])
	})

	// reverse exclusive upper bound
	await env.read(async (txn) => {
		t.deepEqual(await collect(txn.entries(null, { key: encode("c"), inclusive: false }, { reverse: true })), [
			[encode("b"), encode("bar")],
			[encode("a"), encode("foo")],
		])
	})

	// reverse exclusive upper bound
	await env.read(async (txn) => {
		t.deepEqual(await collect(txn.entries(null, { key: encode("d"), inclusive: false }, { reverse: true })), [
			[encode("c"), encode("baz")],
			[encode("b"), encode("bar")],
			[encode("a"), encode("foo")],
		])
	})
})
