import path from "node:path"
import os from "node:os"
import fs from "node:fs"

import type { ExecutionContext } from "ava"
import Prando from "prando"
import { bytesToHex as hex, hexToBytes } from "@noble/hashes/utils"
import { nanoid } from "nanoid"

import { KeyValueStore, Source, Target, Node, Tree, Builder, DEFAULT_METADATA, Entry, Awaitable } from "@canvas-js/okra"
import { MemoryStore, MemoryTree } from "@canvas-js/okra-memory"
import { Environment, EnvironmentOptions } from "@canvas-js/okra-node"

export function getEnvironment(t: ExecutionContext, options: EnvironmentOptions = {}) {
	const directory = path.resolve(os.tmpdir(), nanoid())
	const env = new Environment(directory, options)
	t.teardown(() => {
		env.close()
		fs.rmSync(directory, { recursive: true })
	})

	return env
}

export function readTree<T>(
	env: Environment,
	callback: (tree: KeyValueStore & Source & Target) => Awaitable<T>
): Promise<T> {
	return env.read((txn) => txn.openTree<T>(null, callback))
}

export function writeTree<T>(
	env: Environment,
	callback: (tree: KeyValueStore & Source & Target) => Awaitable<T>
): Promise<T> {
	return env.write((txn) => txn.openTree<T>(null, callback))
}

export async function initialize(
	t: ExecutionContext,
	entries: Iterable<[Uint8Array, Uint8Array]>,
	metadata = DEFAULT_METADATA
): Promise<Tree> {
	const store = new MemoryStore()
	const builder = await Builder.open(store, metadata)
	for (const [key, value] of entries) {
		await builder.set(key, value)
	}

	await builder.finalize()
	return new MemoryTree(store, metadata)
}

export const defaultValue = hexToBytes("ffffffff")

export function getKey(i: number): Uint8Array {
	const buffer = new ArrayBuffer(4)
	const view = new DataView(buffer)
	view.setUint32(0, i)
	return new Uint8Array(buffer)
}

export function* iota(count: number, getValue: (i: number) => Uint8Array = (i) => defaultValue): Iterable<Entry> {
	for (let i = 0; i < count; i++) {
		yield [getKey(i), getValue(i)]
	}
}

export async function compareEntries(
	t: ExecutionContext<unknown>,
	a: AsyncIterable<Entry>,
	b: AsyncIterable<Entry>
): Promise<number> {
	const iterA = a[Symbol.asyncIterator]()
	const iterB = b[Symbol.asyncIterator]()

	let entryA = await iterA.next()
	let entryB = await iterB.next()

	let delta = 0
	while (!entryA.done || !entryB.done) {
		if (entryA.done && !entryB.done) {
			const [keyB, valueB] = entryB.value
			t.log(`[${hex(keyB)}] a: null, b: ${hex(valueB)} !`)
			delta += 1
			entryB = await iterB.next()
			continue
		}

		if (!entryA.done && entryB.done) {
			const [keyA, valueA] = entryA.value
			t.log(`[${hex(keyA)}] a: ${hex(valueA)}, b: null !`)
			delta += 1
			entryA = await iterA.next()
			continue
		}

		if (!entryA.done && !entryB.done) {
			const [keyA, valueA] = entryA.value
			const [keyB, valueB] = entryB.value

			switch (Buffer.from(keyA).compare(Buffer.from(keyB))) {
				case -1: {
					t.log(`[${hex(keyA)}] a: ${hex(valueA)}, b: null`)
					entryA = await iterA.next()
					delta += 1
					continue
				}
				case 0: {
					if (!Buffer.from(valueA).equals(Buffer.from(valueB))) {
						t.log(`[${hex(keyA)}] a: ${hex(valueA)}, b: ${hex(valueB)}`)
						delta += 1
					}

					entryA = await iterA.next()
					entryB = await iterB.next()
					continue
				}
				case 1: {
					t.log(`[${hex(keyB)}] a: null, b: ${hex(valueB)}`)
					entryB = await iterB.next()
					delta += 1
					continue
				}
			}
		}
	}

	return delta
}

export function shuffle<T>(array: T[]) {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1))
		const temp = array[i]
		array[i] = array[j]
		array[j] = temp
	}
}

export function* random(seed: string, min: number, max: number, count: number): Generator<number, void, undefined> {
	const rng = new Prando.default(seed)
	for (let i = 0; i < count; i++) {
		yield rng.nextInt(min, max - 1)
	}
}

export function compare(a: Node, b: Node): -1 | 0 | 1 {
	if (a.level < b.level) {
		return -1
	} else if (b.level < a.level) {
		return 1
	}

	if (a.key !== null && b.key !== null) {
		return Buffer.compare(a.key, b.key)
	} else if (a.key !== null) {
		return 1
	} else if (b.key !== null) {
		return -1
	} else {
		return 0
	}
}

export function* map<I, O>(iter: Iterable<I>, f: (value: I) => O): Iterable<O> {
	for (const value of iter) {
		yield f(value)
	}
}
