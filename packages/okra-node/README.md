# `@canvas-js/okra-node`

[![NPM version](https://img.shields.io/npm/v/@canvas-js/okra-node)](https://www.npmjs.com/package/@canvas-js/okra-node) ![TypeScript types](https://img.shields.io/npm/types/@canvas-js/okra-node)

## Install

```
npm i @canvas-js/okra-node
```

The following targets are supported:

- `x86_64-linux-gnu`
- `x86_64-linux-musl`
- `aarch64-linux-gnu`
- `aarch64-linux-musl`
- `x86_64-macos`
- `aarch64-macos`

## Usage

First open an `Environment`.

```ts
import { Environment } from "@canvas-js/okra-node"

const env = new Environment("./path/to/data/directory")
try {
	// ...
} finally {
	env.close()
}
```

With the environment, you can open transactions, which are either read-write or read-only.

```ts
await env.read(async (txn) => {
	/* ... */
})

await env.write(async (txn) => {
	/* ... */
})
```

With a transaction, you can open multiple named _databases_ and/or _trees_. A `Database` is a named database in the LMDB key/value store. A `Tree` is a Okra tree that wraps an underlying `Database`. Trees need to be closed before the transaction commits, so they're only accessible within an `txn.openTree(name, async (tree) => { ... })` callback. Databases don't have to be closed, so `txn.database(name)` returns a class directly.

Both `Database` and `Tree` implement the `KeyValueStore` interface.

```ts
const auxillaryDB = txn.database("my-auxillary-db")
auxillaryDB.set(key1, value1)

await txn.openTree("my-okra-tree", async (tree) => {
	// ...
	tree.set(key2, value2)
	// ...
	const root = tree.getRoot()
	// ...
})
```

## API

```ts
import { KeyValueStore, Bound, Entry, Node, Key, Source, Target, Awaitable } from "@canvas-js/okra"

export interface EnvironmentOptions {
	mapSize?: number
	databases?: number
}

export declare class Environment {
	public readonly path: string

	public constructor(path: string, options?: EnvironmentOptions)

	public close(): void

	public read<T>(callback: (txn: Transaction) => Awaitable<T>): Promise<T>
	public write<T>(callback: (txn: Transaction) => Awaitable<T>): Promise<T>

	public resize(mapSize: number): void
}

export declare class Transaction {
	public database(name: string | null = null): Database

	public async openTree(name: string | null, callback: (tree: Tree) => Awaitable<T>): Promise<T>
}

export declare class Database implements KeyValueStore {
	public get(key: Uint8Array): Uint8Array | null
	public set(key: Uint8Array, value: Uint8Array): void
	public delete(key: Uint8Array): void

	public entries(
		lowerBound?: Bound<Uint8Array> | null,
		upperBound?: Bound<Uint8Array> | null,
		options?: { reverse?: boolean }
	): AsyncIterableIterator<Entry>
}

export declare class Tree implements KeyValueStore, Source, Target {
	public get(key: Uint8Array): Uint8Array | null
	public set(key: Uint8Array, value: Uint8Array): void
	public delete(key: Uint8Array): void

	public entries(
		lowerBound?: Bound<Uint8Array> | null,
		upperBound?: Bound<Uint8Array> | null,
		options?: { reverse?: boolean }
	): AsyncIterableIterator<Entry>

	public getRoot(): Node
	public getNode(level: number, key: Key): Node | null
	public getChildren(level: number, key: Key): Node[]

	public nodes(
		level: number,
		lowerBound?: Bound<Key> | null,
		upperBound?: Bound<Key> | null,
		options?: { reverse?: boolean }
	): AsyncIterableIterator<Node>
}
```
