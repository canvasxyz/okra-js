# `@canvas-js/okra-memory`

[![NPM version](https://img.shields.io/npm/v/@canvas-js/okra-memory)](https://www.npmjs.com/package/@canvas-js/okra-memory) ![TypeScript types](https://img.shields.io/npm/types/@canvas-js/okra-memory)

## Install

```
npm i @canvas-js/okra-memory
```

## Usage

```ts
import { Tree } from "@canvas-js/okra-memory"

const tree = new Tree()

// ...
```

## API

```ts
import { Metadata, ReadOnlyTransaction, ReadWriteTransaction, Leaf } from "@canvas-js/okra"

export declare class Tree {
    public static fromEntries(
      init: Partial<Metadata>,
      entries: AsyncIterable<[Uint8Array, Leaf]>,
    ): Promise<Tree>

    public readonly metadata: Metadata

    public constructor(init?: Partial<Metadata>)

    public close(): Promise<void>
    public clear(): void
    public read<T>(callback: (txn: ReadOnlyTransaction) => Awaitable<T>): Promise<T>
    public write<T>(callback: (txn: ReadWriteTransaction) => Awaitable<T>): Promise<T>
}
```
