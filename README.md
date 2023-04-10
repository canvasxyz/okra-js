# okra-js

Pure JS okra implementation over an [`abstract-level`](https://github.com/Level/abstract-level) interface.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [API](#api)

## Installation

```
npm i @canvas-js/okra-level
```

## Usage

Import the `Tree` class and pass an [`abstract-level`](https://github.com/Level/abstract-level) instance into `Tree.open`. Upon opening, the tree will write a header entry and the leaf anchor node if they do not exist.

The tree can be used as a normal key/value store with `.get`, `.set`, and `.delete` methods. In addition, you can access the internal merkle tree nodes using `getRoot`, `getNode`, and `getChildren` methods.

Setting or deleting an entry translates into several `put` and `del` operations in the underlying `abstract-level` database. The `abstract-level` interface only offers "transactions" in the form of batched operations, which isn't suitable for dynamic internal tree maintenance. As a result, `.set` and `.delete` have weak consistency properties: if a underlying `put` or `del` fails, it will leave the tree in a corrupted state. If this happens, it can be corrected with a call to `await Tree.rebuild()`.

If atomic and consistent transactions are important to you, consider the native NodeJS binding for the Zig implementation of okra, which is fully ACID compliant and supports reads and writes concurrently.

Concurrent calls to `.set` and `.delete` **WILL cause internal corruption** - you must always use `await`, locks, a queue, or some other kind of concurrency control.

You can override the default internal hash size and target fanout degree by passing `{ K: number, Q: number }` into `Tree.open`, although this is discouraged.

```js
import { Tree } from "@canvas-js/okra-level"
import { MemoryLevel } from "memory-level"

const encoder = new TextEncoder()

const tree = await Tree.open(new MemoryLevel())
await tree.set(encoder.encode("a"), encoder.encode("foo"))
await tree.set(encoder.encode("b"), encoder.encode("bar"))
await tree.set(encoder.encode("c"), encoder.encode("baz"))

await tree.get(encoder.encode("a"))
// <Buffer 66 6f 6f>

const root = await tree.getRoot()
// { level: 1, key: null, hash: <Buffer 62 46 b9 40 74 d0 9f eb 64 4b e1 a1 c1 2c 1f 50> }

const children = await tree.getChildren(1, null)
// [
//   {
//     level: 0,
//     key: null,
//     hash: <Buffer af 13 49 b9 f5 f9 a1 a6 a0 40 4d ea 36 dc c9 49>
//   },
//   {
//     level: 0,
//     key: <Buffer 61>,
//     hash: <Buffer 2f 26 b8 5f 65 eb 9f 7a 8a c1 1e 79 e7 10 14 8d>,
//     value: <Buffer 66 6f 6f>
//   },
//   {
//     level: 0,
//     key: <Buffer 62>,
//     hash: <Buffer 68 4f 10 47 a1 78 e6 cf 9f ff 75 9b a1 ed ec 2d>,
//     value: <Buffer 62 61 72>
//   },
//   {
//     level: 0,
//     key: <Buffer 63>,
//     hash: <Buffer 56 cb 13 c7 88 23 52 5b 08 d4 71 b6 c1 20 13 60>,
//     value: <Buffer 62 61 7a>
//   }
// ]
```

## API

```ts
declare type Key = Uint8Array | null

declare type Node = {
	level: number
	key: Key
	hash: Uint8Array
	value?: Uint8Array
}

declare interface IteratorOptions {
	reverse?: boolean
	gt?: Uint8Array
	gte?: Uint8Array
	lt?: Uint8Array
	lte?: Uint8Array
}

declare class Tree<TFormat, KDefault, VDefault> {
	public readonly db: AbstractLevel<TFormat, KDefault, VDefault>
	public readonly K: number
	public readonly Q: number

	public static open<TFormat, KDefault, VDefault>(
		db: AbstractLevel<TFormat, KDefault, VDefault>,
		options?: { K?: number; Q?: number }
	): Promise<Tree<TFormat, KDefault, VDefault>>

	// closes the underlying AbstractLevel database
	public close(): Promise<void>

	// external key/value interface
	public get(key: Uint8Array): Promise<Uint8Array | null>
	public set(key: Uint8Array, value: Uint8Array): Promise<void>
	public delete(key: Uint8Array): Promise<void>
	public iterator(options: IteratorOptions): AsyncIterable<[Uint8Array, Uint8Array]>

	// access internal merkle tree nodes
	public getRoot(): Promise<Node>
	public getNode(level: number, key: Key): Promise<Node | null>
	public getChildren(level: number, key: Key): Promise<Node[]>

	// raze and rebuild the merkle tree from the leaves
	public rebuild(): Promise<void>
}
```
