import type { ExecutionContext } from "ava"
import { MemoryLevel } from "memory-level"
import { bytesToHex as hex } from "@noble/hashes/utils"
import Prando from "prando"

import { Tree, Builder, hashEntry } from "@canvas-js/okra-level"

export const encodingOptions = { keyEncoding: "view", valueEncoding: "view" }

export function getDB(t?: ExecutionContext): MemoryLevel<Uint8Array, Uint8Array> {
	const db = new MemoryLevel<Uint8Array, Uint8Array>({ keyEncoding: "view", valueEncoding: "view" })
	if (t !== undefined) {
		t.teardown(() => db.close())
	}

	return db
}

export async function initialize(t: ExecutionContext, count: number, options: { K: number; Q: number }): Promise<Tree> {
	const db = getDB(t)
	const builder = await Builder.open(db, options)
	for (const [key, value] of iota(count)) {
		await builder.set(key, value)
	}
	await builder.finalize()
	return await Tree.open(db, options)
}

export const defaultValue = Buffer.from([0xff, 0xff, 0xff, 0xff])

export function getKey(i: number): Buffer {
	const key = Buffer.alloc(4)
	key.writeUint32BE(i)
	return key
}

export function* iota(count: number): Iterable<[Uint8Array, Uint8Array]> {
	for (let i = 0; i < count; i++) {
		yield [getKey(i), Buffer.from(defaultValue)]
	}
}

export async function compareEntries(
	t: ExecutionContext<unknown>,
	a: AsyncIterable<[Uint8Array, Uint8Array]>,
	b: AsyncIterable<[Uint8Array, Uint8Array]>
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
	const rng = new Prando(seed)
	for (let i = 0; i < count; i++) {
		yield rng.nextInt(min, max - 1)
	}
}
