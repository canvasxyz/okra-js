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
import { Tree } from "@canvas-js/okra-lmdb"

const tree = new Tree("./path/to/data/directory")

await tree.write((txn) => {
  txn.set(new Uint8Array([0, 1, 2]), new Uint8Array([4, 5, 6]))
})

await tree.close()
```

## API

```ts
import { Metadata, ReadOnlyTransaction, ReadWriteTransaction, Leaf } from "@canvas-js/okra"

export interface TreeOptions extends Partial<Metadata> {
  mapSize?: number
	databases?: number
}

export declare class Tree {
    public static fromEntries(
      path: string,
      init: TreeOptions,
      entries: AsyncIterable<[Uint8Array, Leaf]>,
    ): Promise<Tree>

    public readonly metadata: Metadata;

    public constructor(path: string, init?: TreeOptions);

    public close(): Promise<void>
    public clear(): Promise<void>
    public build(): Promise<void>
    public resize(mapSize: number): Promise<void>
    public read<T>(callback: (txn: ReadOnlyTransaction) => Awaitable<T>): Promise<T>
    public write<T>(callback: (txn: ReadWriteTransaction) => Awaitable<T>): Promise<T>
}
```
