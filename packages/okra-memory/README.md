# `@canvas-js/okra-memory`

[![NPM version](https://img.shields.io/npm/v/@canvas-js/okra-memory)](https://www.npmjs.com/package/@canvas-js/okra-memory) ![TypeScript types](https://img.shields.io/npm/types/@canvas-js/okra-memory)

## Install

```
npm i @canvas-js/okra-memory
```

## Usage

```ts
import { MemoryTree } from "@canvas-js/okra-memory"

const tree = await MemoryTree.open()

// ...
```

## API

```ts
type Key = Uint8Array | null
type Node = { level: number; key: Key; hash: Uint8Array; value?: Uint8Array }
type Bound<T> = { key: T; inclusive: boolean }

declare class MemoryTree {
  static open(options?: { K?: number; Q?: number }): Promise<MemoryTree>

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
