# okra-js

A p2p merklized database index.

## Table of Contents

- [Background](#background)
- [Install](#install)
- [Usage](#usage)
  - [Opening a tree](#opening-a-tree)
  - [Getting, setting, and deleting entries](#getting-setting-and-deleting-entries)
  - [Iterating over ranges of entries](#iterating-over-ranges-of-entries)
  - [Exposing the internal merkle tree nodes](#exposing-the-internal-merkle-tree-nodes)
  - [Syncing with a remote source](#syncing-with-a-remote-source)
  - [Basic syncing patterns](#basic-syncing-patterns)
  - [Debugging](#debugging)
- [Testing](#testing)
- [API](#api)
- [Contributing](#contributing)
- [License](#license)

## Background

Okra is a key/value store augmented with a merkle tree index. You can use it like a regular key/value store, with `get`/`set`/`delete` methods and an `entries()` iterator. The merkle tree enables **efficient syncing** by iterating over the missing, extra, or conflicting entries between a local and remote Okra database.

## Install

The core package `@canvas-js/okra` has a generic tree that must be provided with a backing key/value store.

```
npm i @canvas-js/okra
```

The `@canvas-js/okra-idb` and `@canvas-js/okra-memory` instantiate the generic pure-JS tree with an IndexedDB object store and an in-memory red/black tree, respectively. The `@canvas-js/okra-node` package exports compatible native NodeJS bindings for the [Zig implementation](https://github.com/canvasxyz/okra).

```
npm i @canvas-js/okra-idb @canvas-js/okra-memory @canvas-js/okra-node
```

## Usage

Okra is designed as a thin wrapper around an abstract key/value store interface. The details of how Okra stores the merkle tree nodes in the underlying key/value store are documented in the [Zig implementation repo](https://github.com/canvasxyz/okra).

```ts
interface KeyValueStore {
	get(key: Uint8Array): Promise<Uint8Array | null>
	set(key: Uint8Array, value: Uint8Array): Promise<void>
	delete(key: Uint8Array): Promise<void>
	entries(range?: KeyRange): AsyncIterableIterator<[Uint8Array, Uint8Array]>
}

type KeyRange = {
	reverse?: boolean
	lowerBound?: { key: Uint8Array; inclusive: boolean }
	upperBound?: { key: Uint8Array; inclusive: boolean }
}
```

You can either use okra-js with your own implementation of `KeyValueStore`, or one of the three first-party packages:

- [`@canvas-js/okra-memory`](./packages/okra-memory/), backed by an in-memory red/black tree
- [`@canvas-js/okra-idb`](./packages/okra-idb/), backed by an IndexedDB object store
- [`@canvas-js/okra-node`](./packages/okra-node/), backed by [LMDB](https://www.symas.com/lmdb) via a native NodeJS bindings

The examples here all use `@canvas-js/okra-memory` for simplicity.

> ⚠️ Never try to directly access or mutate the entries of the underlying key/value store. Only interact with the store through the public `Tree` methods.

### Opening a tree

Import the `Tree` class and pass a `store: KeyValueStore` into `Tree.open`. Upon opening, the tree will write a header entry and the leaf anchor node if they do not exist.

```ts
import { MemoryTree } from "@canvas-js/okra-memory"

const tree = await MemoryTree.open()
```

If you want to use Okra with your own key/value store, extend the Tree class and pass your instance of the `KeyValueStore` interface to constructor. If you do this, you must also call the `protected async initialize(): Promise<void>` method immediately after creating the tree. One wasy way to do this is to make the constructor `private` and always use a `async static open()` method to open the tree.

```ts
import { Tree } from "@canvas-js/okra"

class MyCustomTree extends Tree {
	public static async open() {
		const store = new MyCustomKeyValueStore()
		const tree = new MyCustomTree(store)
		await tree.initialize()
		return tree
	}
}

const tree = await MyCustomTree.open()
```

You can override the default internal hash size and target fanout degree by passing an optional second argument `options?: { K?: number, Q?: number }` to the `Tree` constructor, although this is discouraged. If you do, be sure to pass the same values every time you open the tree.

### Getting, setting, and deleting entries

The tree can be used as a normal key/value store with `.get`, `.set`, and `.delete` methods.

```js
const encoder = new TextEncoder()

await tree.set(encoder.encode("a"), encoder.encode("foo"))
await tree.set(encoder.encode("b"), encoder.encode("bar"))
await tree.set(encoder.encode("c"), encoder.encode("baz"))

await tree.get(encoder.encode("a"))
// <Buffer 66 6f 6f>

await tree.delete(encoder.encode("a"))
await tree.get(encoder.encode("a"))
// null
```

> ⚠️ Concurrent calls to `.set` or `.delete` will cause internal corruption - you must always use `await`, locks, a queue, or some other kind of concurrency control.

Setting or deleting an entry translates into several sets and deletes in the underlying store. As a result, if a underlying `tree.store.set()` or `tree.store.delete()` fails, it will leave the tree in a corrupted state. There are two ways to recover from this:

- If your underlying store supports transactions that can be aborted, implement the `KeyValueStore` interface as a wrapper around a transaction object, not the database itself, and open a new tree over a new transaction for every set of changes you want to make. Then, if an operation fails, abort the transaction.
- If your underlying store doesn't support transactions and a set or delete fails, the tree can be repaired with a call to `await tree.rebuild()`. However, this can be expensive for large databases.

If atomic and consistent transactions are important to you, consider using the native NodeJS bindings for the [Zig implementation](https://github.com/canvasxyz/okra), which has fully ACID transactions and a multi-reader single-writer concurrency model.

### Iterating over ranges of entries

You can iterate over ranges of entries with `tree.entries()`.

```ts
import { collect } from "@canvas-js/okra"

await collect(tree.entries())
// [
//   [ <Buffer 61>, <Buffer 66 6f 6f> ],
//   [ <Buffer 62>, <Buffer 62 61 72> ],
//   [ <Buffer 63>, <Buffer 62 61 7a> ]
// ]

await collect(tree.entries({ reverse: true }))
// [
//   [ <Buffer 63>, <Buffer 62 61 7a> ],
//   [ <Buffer 62>, <Buffer 62 61 72> ],
//   [ <Buffer 61>, <Buffer 66 6f 6f> ]
// ]

await collect(
	tree.entries({
		lowerBound: { key: encoder.encode("b"), inclusive: true },
		upperBound: { key: encoder.encode("c"), inclusive: false },
	})
)
// [
//	 [ <Buffer 62>, <Buffer 62 61 72> ]
// ]
```

### Exposing the internal merkle tree nodes

You can access the internal merkle tree nodes using the `getRoot`, `getNode`, and `getChildren` methods. These are the methods that must be accessible to other Okra databases, such as over a WebSocket connection. okra-js itself is transport-agnostic.

```ts
await tree.getRoot()
// { level: 1, key: null, hash: <Buffer 62 46 b9 40 74 d0 9f eb 64 4b e1 a1 c1 2c 1f 50> }

await tree.getChildren(1, null)
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

Note that the leaf anchor node at `(level = 0, key = null)` doesn't have a value, but the rest of the leaf nodes do, since they represent entries in the external key/value store.

### Syncing with a remote source

First, you must have an instance of the `Source` interface for the remote Okra database you want to sync with. If you're exposing the merkle tree via an HTTP API, you'll have to write a little client implementing `Source` that uses `fetch`, or whatever is appropriate for your transport.

```ts
export interface Source {
	getRoot(): Promise<Node>
	getNode(level: number, key: Key): Promise<Node | null>
	getChildren(level: number, key: Key): Promise<Node[]>
}
```

`Tree` itself implements `Source`, so we can easily demonstrate the sync methods using two local databases.

```ts
import { sha256 } from "@noble/hashes/sha256"
import { Tree, sync, collect } from "@canvas-js/okra"
import { MemoryStore } from "@canvas-js/okra-memory"

// create two in-memory trees
const source = await MemoryTree.open()
const target = await MemoryTree.open()

// initialize them with the same 256 random entries
for (let i = 0; i < 256; i++) {
	const key = new Uint8Array([i])
	await source.set(key, sha256(key))
	await target.set(key, sha256(key))
}

// delete one entry from source
await source.delete(new Uint8Array([0x21]))

// delete one entry from target
await target.delete(new Uint8Array([0x44]))

// set conflicting values for another entry
const encoder = new TextEncoder()
await source.set(new Uint8Array([0x04]), encoder.encode("foo"))
await target.set(new Uint8Array([0x04]), encoder.encode("bar"))

await collect(sync(source, target))
// [
//   {
//     key: <Buffer 04>,
//     source: <Buffer 66 6f 6f>,
//     target: <Buffer 62 61 72>
//   },
//   {
//     key: <Buffer 21>,
//     source: null,
//     target: <Buffer bb 72 08 bc 9b 5d 7c 04 f1 23 6a 82 a0 09 3a 5e 33 f4 04 23 d5 ba 8d 42 66 f7 09 2c 3b a4 3b 62>
//   },
//   {
//     key: <Buffer 44>,
//     source: <Buffer 3f 39 d5 c3 48 e5 b7 9d 06 e8 42 c1 14 e6 cc 57 15 83 bb f4 4e 4b 0e bf da 1a 01 ec 05 74 5d 43>,
//     target: null
//   }
// ]
```

The `sync` export takes a `Source` and `Target` and returns an async generator that yields `delta: Delta` objects with `key`, `source`, and `target` properties. `delta.key` is always a `Uint8Array`. `delta.source === null && delta.target !== null` represents an entry that the target has but the source is missing, `delta.source !== null && delta.target === null` represents an entry that the source has but the target is missing, and `delta.source !== null && delta.target !== null` represents an entry for which the source and target have different values. `delta.source` and `delta.target` are never both `null`.

> ⚠️ Syncing **will fail if the source is concurrently modified**.

This means that your implementation of sync transport will need some concept of "sessions" so that okra-js sources can queue pending calls to `.set` and `.delete` when a session is active, and resume handling them when the session ends. This could be done with an async queue like[ `p-queue`](https://github.com/sindresorhus/p-queue) or using locks from e.g. the [Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API). In the future, okra-js may enforce locking itself, but for now it is left to the user.

However, thanks to the specific behavior of the sync algorithm, the **target tree _can_ be modified while syncing**. You can safely `await tree.set(...)` and `await tree.delete(...)` inside a `for await (const delta of tree.delta(source)) { ... }` loop.

The Zig implementation and its NodeJS bindings support snapshots and thus can process a read-write transaction with abitrarily many concurrent read-only transactions.

### Basic syncing patterns

Calling `sync(source, target)` does not automatically modify `target` - it only iterates over the differences. Taking action in response to each delta is up to you! Here are three examples of using `sync`.

#### `pull`

```ts
import { sync } from "@canvas-js/okra"

async function pull(source: Source, target: Tree): Promise<void> {
	for await (const delta of sync(source, target)) {
		if (delta.source === null) {
			continue
		} else if (delta.target === null) {
			await target.set(delta.key, delta.source)
			// do more stuff to process the new value
			// ...
		} else {
			throw new Error(`Conflict at key ${hex(delta.key)}`)
		}
	}
}
```

Call `await pull(source, tree)` to _pull in missing entries_ that `source` has but `tree` doesn't, doing nothing for entries in `tree` missing in `source`, and throwing an error if the values for a key conflict. Only use this if the values of keys don't change! One example where this is useful is in content-addressed systems where keys are derived from the hashes of immutable values.

One way of looking at `pull` is that it implements a grow-only set with an efficient union operation. This pattern is useful, for example, as a persistence layer for **operation-based CRDT** systems, where it allows arbitrary peers to directly sync their sets of operations without relying on tracking methods that scale linearly in the number of peers.

#### `copy`

```ts
import { sync } from "@canvas-js/okra"

async function copy(source: Source, target: Tree): Promise<void> {
	for await (const delta of sync(source, target)) {
		if (delta.source === null) {
			await target.delete(delta.key)
		} else {
			await target.set(delta.key, delta.source)
		}
	}
}
```

Call `copy(source, tree)` to _copy the remote source_, deleting any local entries that `source` doesn't have, setting new entries for keys that `source` has that `tree` doesn't, and adopting `source`'s value for any conflicting keys. By the end, `tree` will have the exact same leaf entries, tree structure, and root hash as `source`.

#### `merge`

```ts
import { sync } from "@canvas-js/okra"

async function merge(
	source: Source,
	target: Tree,
	resolve: (key: Uint8Array, source: Uint8Array, target: Uint8Array) => Uint8Array | Promise<Uint8Array>
): Promise<void> {
	for await (const delta of sync(source, target)) {
		if (delta.source === null) {
			continue
		} else if (delta.target === null) {
			await target.set(delta.key, delta.source)
		} else {
			const value = await resolve(delta.key, delta.source, delta.target)
			await target.set(delta.key, value)
		}
	}
}
```

Call `merge(source, tree, resolve)` to merge entries from a remote source - keeping local entries that `source` doesn't have, copying entries from `source` that aren't present in `tree`, and resolving conflicting values using the provided `resolve` method.

In most cases, the `resolve` method should deterministically choose one of the two values, but it could also return a new "merged" value. The only hard constraints are that it must be commutative, associative, and idempotent.

- commutativity: `resolve(A, B) == resolve(B, A)` for all `A` and `B`
- associativity: `resolve(A, resolve(B, C)) == resolve(resolve(A, B), C)` for all `A`, `B`, and `C`
- idempotence: `resolve(A, A) == A` for all `A`

The merge method is useful for implementing **persistent state-based CRDT** systems. If your top-level state and its global merge function can be represented as a key/value map with entry-wise merging, you can use Okra to **perform p2p state merges in logarithmic time**.

### Debugging

okra-js uses the [`debug`](https://www.npmjs.com/package/debug) package for logging. In NodeJS, you can turn on logging to stdout by setting a `DEBUG=okra:*` environment variable. In the browser, you can turn on console logging by setting `localStorage.debug = 'okra:*'`.

Also useful is the `tree.print()` method, which pretty-prints the merkle tree structure to a utf-8 `AsyncIterableIterator<Uint8Array>` stream. In NodeJS, you can pipe this directly to stdout or consume the entire output with the `text` utility method from `stream/consumers`:

```ts
import { text } from "node:stream/consumers"
import { sha256 } from "@noble/hashes/sha256"

console.log(await text(tree.print())) // hash size defaults to 4 bytes for readability
// ── 6246b940 ┬─ af1349b9 |
//             ├─ 2f26b85f | 61
//             ├─ 684f1047 | 62
//             └─ 56cb13c7 | 63

const bigTree = await Tree.open(new MemoryStore())
for (let i = 0; i < 256; i++) {
	const key = new Uint8Array([i])
	await bigTree.set(key, sha256(key))
}

console.log(await text(bigTree.print()))
// ── 10d7126a ┬─ a74fc67d ┬─ af1349b9 |
//             │           ├─ 83a4849c | 00
//             │           ├─ d789a084 | 01
//             │           ├─ cf069554 | 02
//             │           ├─ 30c20bbc | 03
//             │           ├─ ad5563ad | 04
//             │           ├─ d8a59831 | 05
//             │           └─ 8c7fe3e1 | 06
//             ├─ 9bc31466 ┬─ 063bdfac | 07
// ...
```

Entry values are not printed; the rightmost column is the list of keys of the leaf entries in hex.

## Testing

Tests are run with [AVA](https://github.com/avajs/ava) and live in [./test/\*.test.ts](./test).

```
npm run test
```

The two most important things covered by the tests are 1) correctness of the tree update algorithm 2) correctness of the syncing algorithm. Correctness of the tree is tested by comparing the underlying database entry-by-entry with a reference tree built layer-by-layer using the `Builder` class exported from [./src/builder.ts](./src/builder.ts) (also used by `Tree.prototype.rebuild`). These tests insert entries in random order in a series of sizes up to 10000 entries, using `Q = 4` to maximize tree height and internal complexity. Correctness of syncing is tested by initializing two trees with the same contents, also with `Q = 4`, then randomly deleting different sets of entries from each of them, manually tracking the expected set of deltas and testing that `t.deepEqual(await collect(sync(source, target)), expected)`.

## API

```ts
type Key = Uint8Array | null

// value is undefined for level > 0 || key === null,
// and a Uint8Array for level === 0 && key !== null.
type Node = {
	level: number
	key: Key
	hash: Uint8Array
	value?: Uint8Array
}

// source and target are never both null.
type Delta = { key: Uint8Array; source: Uint8Array | null; target: Uint8Array | null }

interface Source {
	getRoot(): Promise<Node>
	getNode(level: number, key: Key): Promise<Node | null>
	getChildren(level: number, key: Key): Promise<Node[]>
}

type Bound<K> = { key: K; inclusive: boolean }

interface Target extends Source {
	nodes(
		level: number,
		lowerBound?: Bound<Key> | null,
		upperBound?: Bound<Key> | null,
		options?: { reverse?: boolean }
	): AsyncIterableIterator<Node>
}

interface KeyValueStore {
	get(key: Uint8Array): Awaitable<Uint8Array | null>
	set(key: Uint8Array, value: Uint8Array): Awaitable<void>
	delete(key: Uint8Array): Awaitable<void>
	entries(
		lowerBound?: Bound<Uint8Array> | null,
		upperBound?: Bound<Uint8Array> | null,
		options?: { reverse?: boolean }
	): AsyncIterableIterator<[Uint8Array, Uint8Array]>
}

declare class Tree implements KeyValueStore, Source, Target {
	protected constructor(store: KeyValueStore, options?: { K?: number; Q?: number })

	// closes the underlying store
	public close(): Promise<void>

	// external key/value interface
	public get(key: Uint8Array): Promise<Uint8Array | null>
	public set(key: Uint8Array, value: Uint8Array): Promise<void>
	public delete(key: Uint8Array): Promise<void>
	public entries(range?: KeyRange): AsyncIterableIterator<[key: Uint8Array, value: Uint8Array]>

	// access internal merkle tree nodes
	public getRoot(): Promise<Node>
	public getNode(level: number, key: Key): Promise<Node | null>
	public getChildren(level: number, key: Key): Promise<Node[]>

	/**
	 * Raze and rebuild the merkle tree from the leaves.
	 * @returns the new root node
	 */
	public rebuild(): Promise<void>

	/**
	 * Pretty-print the tree structure to a utf-8 stream.
	 * Consume with a TextDecoderStream or async iterable sink.
	 */
	public async *print(): AsyncIterableIterator<Uint8Array>
}
```

## Contributing

This is an early project that is stil best treated as a research prototype. Feel free to open an issue if you find bugs or have thoughts about API design.

## License

MIT © 2023 Canvas Technologies, Inc.
