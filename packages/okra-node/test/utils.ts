import os from "node:os"
import fs from "node:fs"
import path from "node:path"

import { nanoid } from "nanoid"

import { ExecutionContext } from "ava"

import { Awaitable, KeyValueStore, Source, Target } from "@canvas-js/okra"
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

const [encoder, decoder] = [new TextEncoder(), new TextDecoder()]
export const encode = (text: string) => encoder.encode(text)
export const decode = (data: Uint8Array) => decoder.decode(data)

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
