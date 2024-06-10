import path from "node:path"
import os from "node:os"
import fs from "node:fs"

import test, { ExecutionContext } from "ava"
import Prando from "prando"

import { nanoid } from "nanoid"
import { fromString } from "uint8arrays"

import { Tree, Entry, Metadata } from "@canvas-js/okra"

import { Tree as MemoryTree } from "@canvas-js/okra-memory"
import { Tree as PersistentTree } from "@canvas-js/okra-lmdb"

export function testPlatforms(
	name: string,
	run: (t: ExecutionContext<unknown>, openTree: (t: ExecutionContext, metadata?: Partial<Metadata>) => Tree) => void
) {
	const macro = test.macro(run)

	test(`Memory - ${name}`, macro, (t, metadata) => new MemoryTree(metadata))
	test(`LMDB   - ${name}`, macro, (t, metadata) => {
		const tree = new PersistentTree(getDirectory(t), metadata)
		t.teardown(() => tree.close())
		return tree
	})
}

function getDirectory(t: ExecutionContext<unknown>): string {
	const directory = path.resolve(os.tmpdir(), nanoid())
	fs.mkdirSync(directory)
	t.log("Created temporary directory", directory)
	t.teardown(() => {
		fs.rmSync(directory, { recursive: true })
		t.log("Removed temporary directory", directory)
	})
	return directory
}

export const defaultValue = fromString("ffffffff", "hex")

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
