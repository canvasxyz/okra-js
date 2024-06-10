import os from "node:os"
import fs from "node:fs"
import path from "node:path"

import { ExecutionContext } from "ava"
import { nanoid } from "nanoid"

import { Metadata } from "@canvas-js/okra"
import { Tree } from "@canvas-js/okra-lmdb"

export function openTree(t: ExecutionContext, metadata: Partial<Metadata> = {}) {
	const tree = new Tree(getDirectory(t), metadata)
	t.teardown(() => tree.close())
	return tree
}

export function getDirectory(t: ExecutionContext<unknown>): string {
	const directory = path.resolve(os.tmpdir(), nanoid())
	fs.mkdirSync(directory)
	t.log("Created temporary directory", directory)
	t.teardown(() => {
		fs.rmSync(directory, { recursive: true })
		t.log("Removed temporary directory", directory)
	})
	return directory
}

const [encoder, decoder] = [new TextEncoder(), new TextDecoder()]
export const encode = (text: string) => encoder.encode(text)
export const decode = (data: Uint8Array) => decoder.decode(data)

export async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
	const values: T[] = []
	for await (const value of iter) {
		values.push(value)
	}
	return values
}

// export function readTree<T>(
// 	env: Environment,
// 	callback: (tree: KeyValueNodeStore & SyncSource & SyncTarget) => Awaitable<T>
// ): Promise<T> {
// 	return env.read((txn) => Tree.open<T>(txn, null, callback))
// }

// export function writeTree<T>(
// 	env: Environment,
// 	callback: (tree: KeyValueNodeStore & SyncSource & SyncTarget) => Awaitable<T>
// ): Promise<T> {
// 	return env.write((txn) => Tree.open<T>(txn, null, callback))
// }
