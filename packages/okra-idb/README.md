# `@canvas-js/okra-idb`

[![NPM version](https://img.shields.io/npm/v/@canvas-js/okra-idb)](https://www.npmjs.com/package/@canvas-js/okra-idb) ![TypeScript types](https://img.shields.io/npm/types/@canvas-js/okra-idb)

## Install

```
npm i @canvas-js/okra-idb
```

## Usage

```ts
import { openDB } from "idb"
import { IDBTree } from "@canvas-js/okra-idb"

const tree = await MemoryTree.open()

// ...
```

## API

```ts
type Key = Uint8Array | null
type Node = { level: number; key: Key; hash: Uint8Array; value?: Uint8Array }
type Bound<T> = { key: T; inclusive: boolean }

declare class IDBTree {
	public static open(db: IDBPDatabase, storeName: string, options?: Partial<Metadata>): Promise<IDBTree>

	private constructor()

	public get(key: Uint8Array): Promise<Uint8Array | null>
	public set(key: Uint8Array, value: Uint8Array): Promise<void>
	public delete(key: Uint8Array): Promise<void>

	public entries(
		lowerBound?: Bound<Uint8Array> | null,
		upperBound?: Bound<Uint8Array> | null,
		options: { reverse?: boolean }
	): AsyncGenerator<[Uint8Array, Uint8Array]>

	public getRoot(): Promise<Node>
	public getNode(level: number, key: Key): Promise<Node | null>
	public getChildren(level: number, key: Key): Promise<Node[]>

	public nodes(
		level: number,
		lowerBound?: Bound<Key> | null,
		upperBound?: Bound<Key> | null,
		options: { reverse?: boolean }
	): AsyncGenerator<Node>
}
```
