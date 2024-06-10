import test from "ava"

import { fromString } from "uint8arrays"
import { openTree } from "./utils.js"

test("get/set/delete", async (t) => {
	const tree = openTree(t, {})

	await tree.write((txn) => {
		txn.set(fromString("a"), fromString("foo"))
		txn.set(fromString("b"), fromString("bar"))
		txn.set(fromString("c"), fromString("baz"))
	})

	await tree.read((txn) => {
		t.deepEqual(txn.get(fromString("a")), fromString("foo"))
		t.deepEqual(txn.get(fromString("b")), fromString("bar"))
		t.deepEqual(txn.get(fromString("c")), fromString("baz"))
		t.deepEqual(txn.get(fromString("d")), null)
	})

	await tree.write((txn) => {
		txn.delete(fromString("b"))
		txn.delete(fromString("d"))
	})

	await tree.read((txn) => t.is(txn.get(fromString("b")), null))
})

test("entries", async (t) => {
	const tree = openTree(t, {})

	await tree.write((txn) => {
		txn.set(fromString("a"), fromString("foo"))
		txn.set(fromString("b"), fromString("bar"))
		txn.set(fromString("c"), fromString("baz"))
		txn.set(fromString("g"), fromString("ooo"))
		txn.set(fromString("h"), fromString("aaa"))
	})

	await tree.read<void>(async (txn) => {
		t.deepEqual(Array.from(txn.entries()), [
			[fromString("a"), fromString("foo")],
			[fromString("b"), fromString("bar")],
			[fromString("c"), fromString("baz")],
			[fromString("g"), fromString("ooo")],
			[fromString("h"), fromString("aaa")],
		])
	})

	// inclusive lower bound
	await tree.read((db) => {
		t.deepEqual(Array.from(db.entries({ key: fromString("b"), inclusive: true })), [
			[fromString("b"), fromString("bar")],
			[fromString("c"), fromString("baz")],
			[fromString("g"), fromString("ooo")],
			[fromString("h"), fromString("aaa")],
		])
	})

	// exclusive lower bound
	await tree.read((txn) => {
		t.deepEqual(Array.from(txn.entries({ key: fromString("b"), inclusive: false })), [
			[fromString("c"), fromString("baz")],
			[fromString("g"), fromString("ooo")],
			[fromString("h"), fromString("aaa")],
		])
	})

	// inclusive upper bound
	await tree.read((txn) => {
		t.deepEqual(Array.from(txn.entries(null, { key: fromString("b"), inclusive: true })), [
			[fromString("a"), fromString("foo")],
			[fromString("b"), fromString("bar")],
		])
	})

	// exclusive upper bound
	await tree.read((txn) => {
		t.deepEqual(Array.from(txn.entries(null, { key: fromString("b"), inclusive: false })), [
			[fromString("a"), fromString("foo")],
		])
	})

	// upper bound out-of-range
	await tree.read((db) => {
		t.deepEqual(Array.from(db.entries(null, { key: fromString("x"), inclusive: false })), [
			[fromString("a"), fromString("foo")],
			[fromString("b"), fromString("bar")],
			[fromString("c"), fromString("baz")],
			[fromString("g"), fromString("ooo")],
			[fromString("h"), fromString("aaa")],
		])
	})

	// lower bound out-of-range
	await tree.read((txn) => {
		t.deepEqual(Array.from(txn.entries({ key: fromString("7"), inclusive: false }, null)), [
			[fromString("a"), fromString("foo")],
			[fromString("b"), fromString("bar")],
			[fromString("c"), fromString("baz")],
			[fromString("g"), fromString("ooo")],
			[fromString("h"), fromString("aaa")],
		])
	})

	// reverse inclusive lower bound
	await tree.read((txn) => {
		t.deepEqual(Array.from(txn.entries({ key: fromString("b"), inclusive: true }, null, { reverse: true })), [
			[fromString("h"), fromString("aaa")],
			[fromString("g"), fromString("ooo")],
			[fromString("c"), fromString("baz")],
			[fromString("b"), fromString("bar")],
		])
	})

	// reverse exclusive lower bound
	await tree.read((txn) => {
		t.deepEqual(Array.from(txn.entries({ key: fromString("b"), inclusive: false }, null, { reverse: true })), [
			[fromString("h"), fromString("aaa")],
			[fromString("g"), fromString("ooo")],
			[fromString("c"), fromString("baz")],
		])
	})

	// reverse inclusive upper bound
	await tree.read((txn) => {
		t.deepEqual(Array.from(txn.entries(null, { key: fromString("b"), inclusive: true }, { reverse: true })), [
			[fromString("b"), fromString("bar")],
			[fromString("a"), fromString("foo")],
		])
	})

	// reverse exclusive upper bound
	await tree.read(async (txn) => {
		t.deepEqual(Array.from(txn.entries(null, { key: fromString("c"), inclusive: false }, { reverse: true })), [
			[fromString("b"), fromString("bar")],
			[fromString("a"), fromString("foo")],
		])
	})

	// reverse exclusive upper bound
	await tree.read(async (txn) => {
		t.deepEqual(Array.from(txn.entries(null, { key: fromString("d"), inclusive: false }, { reverse: true })), [
			[fromString("c"), fromString("baz")],
			[fromString("b"), fromString("bar")],
			[fromString("a"), fromString("foo")],
		])
	})
})
