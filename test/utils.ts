import type { ExecutionContext } from "ava"
import { MemoryLevel } from "memory-level"
import { bytesToHex } from "@noble/hashes/utils"

export function getDB(t?: ExecutionContext) {
	const db = new MemoryLevel<Uint8Array, Uint8Array>({ keyEncoding: "view", valueEncoding: "view" })
	if (t !== undefined) {
		t.teardown(() => db.close())
	}

	return db
}

export function* iota(iota: number): Iterable<[Uint8Array, Uint8Array]> {
	for (let i = 0; i < iota; i++) {
		const keyBuffer = new ArrayBuffer(4)
		const keyView = new DataView(keyBuffer)
		keyView.setUint32(0, i)
		const key = new Uint8Array(keyBuffer)
		yield [key, new Uint8Array([0xff, 0xff, 0xff, 0xff])]
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
			t.log(`[${bytesToHex(keyB)}] a: null, b: ${bytesToHex(valueB)} !`)
			delta += 1
			entryB = await iterB.next()
			continue
		}

		if (!entryA.done && entryB.done) {
			const [keyA, valueA] = entryA.value
			t.log(`[${bytesToHex(keyA)}] a: ${bytesToHex(valueA)}, b: null !`)
			delta += 1
			entryA = await iterA.next()
			continue
		}

		if (!entryA.done && !entryB.done) {
			const [keyA, valueA] = entryA.value
			const [keyB, valueB] = entryB.value

			switch (Buffer.from(keyA).compare(Buffer.from(keyB))) {
				case -1: {
					t.log(`[${bytesToHex(keyA)}] a: ${bytesToHex(valueA)}, b: null`)
					entryA = await iterA.next()
					delta += 1
					continue
				}
				case 0: {
					if (!Buffer.from(valueA).equals(Buffer.from(valueB))) {
						t.log(`[${bytesToHex(keyA)}] a: ${bytesToHex(valueA)}, b: ${bytesToHex(valueB)}`)
						delta += 1
					}

					entryA = await iterA.next()
					entryB = await iterB.next()
					continue
				}
				case 1: {
					t.log(`[${bytesToHex(keyB)}] a: null, b: ${bytesToHex(valueB)}`)
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
