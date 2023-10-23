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

```ts
import { Environment } from "@canvas-js/okra-node"

const env = new Environment("./path/to/data/directory")
await env.writeTree(async (tree) => {
	// ...
})
```

## API

```ts
import { KeyValueStore, Bound, Entry, Node, Key, Source, Target, Awaitable } from "@canvas-js/okra"

export type DatabaseName = string | null
export type DatabaseID = number

export interface EnvironmentOptions {
	mapSize?: number
	databases?: number
}

declare class Environment {
	public readonly path: string

	public constructor(path: string, options?: EnvironmentOptions)

	public close(): void

	public resize(mapSize: number): void

	public read<T>(
		callback: (txn: Transaction) => Awaitable<T>,
		options?: { dbi?: DatabaseName | DatabaseID }
	): Promise<T>

	public readTree<T>(callback: (tree: Tree) => Awaitable<T>, options?: { dbi?: DatabaseName | DatabaseID }): Promise<T>

	public write<T>(
		callback: (txn: Transaction) => Awaitable<T>,
		options?: { dbi?: DatabaseName | DatabaseID }
	): Promise<T>

	public writeTree<T>(callback: (tree: Tree) => Awaitable<T>, options?: { dbi?: DatabaseName | DatabaseID }): Promise<T>
}

export interface TransactionOptions {
	readOnly?: boolean
	parent?: Transaction
	dbi?: DatabaseName | DatabaseID
}

declare class Transaction implements KeyValueStore {
	public readonly env: Environment
	public readonly readOnly: boolean
	public readonly parent: Transaction | null

	public constructor(env: Environment, options?: TransactionOptions)

	public abort(): void

	public commit(): void

	public openDatabase(dbi: DatabaseName): DatabaseID

	public get(key: Uint8Array, options?: { dbi?: DatabaseName | DatabaseID }): Uint8Array | null

	public set(key: Uint8Array, value: Uint8Array, options?: { dbi?: DatabaseName | DatabaseID }): void

	public delete(key: Uint8Array, options?: { dbi?: DatabaseName | DatabaseID }): void

	public entries(
		lowerBound?: Bound<Uint8Array> | null,
		upperBound?: Bound<Uint8Array> | null,
		options?: { dbi?: DatabaseName | DatabaseID; reverse?: boolean }
	): AsyncIterableIterator<Entry>
}

export interface TreeOptions {
	dbi?: DatabaseName | DatabaseID
}

declare class Tree implements KeyValueStore, Source, Target {
	public readonly txn: Transaction
	public readonly dbi: number

	public constructor(txn: Transaction, options?: TreeOptions)

	public close(): void

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
