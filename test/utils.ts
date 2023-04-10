import type { ExecutionContext } from "ava"
import { MemoryLevel } from "memory-level"
import { bytesToHex as hex } from "@noble/hashes/utils"

export const encodingOptions = { keyEncoding: "view", valueEncoding: "view" }

export function getDB(t?: ExecutionContext) {
	const db = new MemoryLevel({ keyEncoding: "view", valueEncoding: "view" })
	if (t !== undefined) {
		t.teardown(() => db.close())
	}

	return db
}

export const defaultValue = Buffer.from([0xff, 0xff, 0xff, 0xff])

export function getKey(i: number): Buffer {
	const key = Buffer.alloc(4)
	key.writeUint32BE(i)
	return key
}

export function* iota(iota: number): Iterable<[Uint8Array, Uint8Array]> {
	for (let i = 0; i < iota; i++) {
		yield [getKey(i), Buffer.from(defaultValue)]
	}
}

export async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
	const values: T[] = []
	for await (const value of iter) {
		values.push(value)
	}
	return values
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
