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

```
npm i @canvas-js/okra @canvas-js/okra-lmdb @canvas-js/okra-memory
```

The core package `@canvas-js/okra` has a generic tree that must be provided with a backing store.

The `@canvas-js/okra-lmdb` and `@canvas-js/okra-memory` instantiate the generic pure-JS tree with a persistent LMDB database and an in-memory red/black tree, respectively.

```ts
import { Tree } from "@canvas-js/okra-lmdb"

const tree = new Tree("path/to/db")
try {
	// ...
} finally {
	tree.close()
}
```

```ts
import { Tree } from "@canvas-js/okra-memory"

const tree = new Tree()
// ...
```

## Usage

Okra is designed as a thin wrapper around an abstract key/value store interface. The details of how Okra stores the merkle tree nodes in the underlying key/value store are documented in the [Zig implementation repo](https://github.com/canvasxyz/okra).

The examples here all use `@canvas-js/okra-memory` for simplicity.

> ⚠️ Never try to directly access or mutate the entries of the underlying key/value store. Only interact with the store through the `Tree.read(...)` and `Tree.write(...)` transaction interfaces.

### Getting, setting, and deleting entries

The tree can be used as a normal key/value store with `.get`, `.set`, and `.delete` methods.

```js
import { fromString, toString } from "uint8arrays"

import { Tree } from "@canvas-js/okra-memory"
const tree = new Tree()

await tree.write((txn) => {
	tree.set(fromString("a"), fromString("foo"))
	tree.set(fromString("b"), fromString("bar"))
	tree.set(fromString("c"), fromString("baz"))
})

await tree.read((txn) => {
	const value = txn.get(fromString("a"))
	console.log(toString(value)) // "foo"
})

await tree.write((txn) => {
	tree.delete(toString("a"))
})

await tree.read((txn) => {
	const value = tree.get(encoder.encode("a"))
	console.log(value) // null
})
```

### Iterating over ranges of entries

You can iterate over ranges of entries with `txn.entries()`.

```ts
await tree.read((txn) => {
	console.log([...txn.entries()])
	// [
	//   [ <Buffer 61>, <Buffer 66 6f 6f> ],
	//   [ <Buffer 62>, <Buffer 62 61 72> ],
	//   [ <Buffer 63>, <Buffer 62 61 7a> ]
	// ]

	console.log([...txn.entries({ reverse: true })])
	// [
	//   [ <Buffer 63>, <Buffer 62 61 7a> ],
	//   [ <Buffer 62>, <Buffer 62 61 72> ],
	//   [ <Buffer 61>, <Buffer 66 6f 6f> ]
	// ]

	console.log([
		...txn.entries({
			lowerBound: { key: fromString("b"), inclusive: true },
			upperBound: { key: fromString("c"), inclusive: false },
		}),
	])
	// [
	//	 [ <Buffer 62>, <Buffer 62 61 72> ]
	// ]
})
```

### Exposing the internal merkle tree nodes

You can access the internal merkle tree nodes using the `getRoot`, `getNode`, and `getChildren` methods. These are the methods that must be accessible to other Okra databases, such as over a WebSocket connection. okra-js itself is transport-agnostic.

```ts
await tree.read((txn) => txn.getRoot())
// { level: 1, key: null, hash: <Buffer 62 46 b9 40 74 d0 9f eb 64 4b e1 a1 c1 2c 1f 50> }

await tree.read((txn) => txn.getChildren(1, null))
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

First, you must have an instance of the `SyncSource` interface for the remote Okra database you want to sync with. If you're exposing the merkle tree via an HTTP API, you'll have to write a little client implementing `SyncSource` that uses `fetch`, or whatever is appropriate for your transport.

```ts
export interface SyncSource {
	getRoot(): Promise<Node>
	getNode(level: number, key: Key): Promise<Node | null>
	getChildren(level: number, key: Key): Promise<Node[]>
}
```

`Tree` itself implements `SyncSource`, so we can easily demonstrate the sync methods using two local databases.

```ts
import { sha256 } from "@noble/hashes/sha256"
import { Tree, sync, collect } from "@canvas-js/okra"
import { Tree } from "@canvas-js/okra-memory"

// create two in-memory trees
const source = new Tree()
const target = new Tree()

// initialize them with the same 256 random entries
{
	function init(txn) {
		for (let i = 0; i < 256; i++) {
			const key = new Uint8Array([i])
			txn.set(key, sha256(key))
		}
	}

	await source.write(init)
	await target.write(init)
}

// delete one entry from source
await source.write((txn) => txndelete(new Uint8Array([0x21])))

// delete one entry from target
await target.delete((txn) => txn.delete(new Uint8Array([0x44])))

// set conflicting values for another entry
await source.write((txn) => txn.set(new Uint8Array([0x04]), fromString("foo")))
await target.write((txn) => txn.set(new Uint8Array([0x04]), fromString("bar")))

for await (const delta of sync(source, target)) {
	console.log(delta)
}
// {
//   key: <Buffer 04>,
//   source: <Buffer 66 6f 6f>,
//   target: <Buffer 62 61 72>
// }
// {
//   key: <Buffer 21>,
//   source: null,
//   target: <Buffer bb 72 08 bc 9b 5d 7c 04 f1 23 6a 82 a0 09 3a 5e 33 f4 04 23 d5 ba 8d 42 66 f7 09 2c 3b a4 3b 62>
// }
// {
//   key: <Buffer 44>,
//   source: <Buffer 3f 39 d5 c3 48 e5 b7 9d 06 e8 42 c1 14 e6 cc 57 15 83 bb f4 4e 4b 0e bf da 1a 01 ec 05 74 5d 43>,
//   target: null
// }
```

The `sync` export takes a `SyncSource` and `SyncTarget` and returns an async generator that yields `delta: Delta` objects with `key`, `source`, and `target` properties. `delta.key` is always a `Uint8Array`. `delta.source === null && delta.target !== null` represents an entry that the target has but the source is missing, `delta.source !== null && delta.target === null` represents an entry that the source has but the target is missing, and `delta.source !== null && delta.target !== null` represents an entry for which the source and target have different values. `delta.source` and `delta.target` are never both `null`.

### Basic syncing patterns

Calling `sync(source, target)` does not automatically modify `target` - it only iterates over the differences. Taking action in response to each delta is up to you! Here are three examples of using `sync`.

#### `pull`

```ts
import { sync } from "@canvas-js/okra"

async function pull(source: SyncSource, target: SyncTarget): Promise<void> {
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

async function copy(source: SyncSource, target: SyncTarget): Promise<void> {
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
	source: SyncSource,
	target: SyncTarget,
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

import { printTree } from "@canvas-js/okra"
import { Tree } from "@canvas-js/okra-memory"

const tree = new Tree()
await tree.write(async (txn) => {
	for (let i = 0; i < 256; i++) {
		const key = new Uint8Array([i])
		tree.set(key, sha256(key))
	}

	console.log(await text(printTree(txn)))
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
})
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
export type Key = Uint8Array | null

// value is undefined for level > 0 || key === null,
// and a Uint8Array for level === 0 && key !== null.
export type Node = {
	level: number
	key: Key
	hash: Uint8Array
	value?: Uint8Array
}

// source and target are never both null.
export type Delta = { key: Uint8Array; source: Uint8Array | null; target: Uint8Array | null }

export type Entry = [key: Uint8Array, value: Uint8Array]
export type Bound<K> = { key: K; inclusive: boolean }

export interface SyncSource {
	getRoot(): Promise<Node>
	getNode(level: number, key: Key): Promise<Node | null>
	getChildren(level: number, key: Key): Promise<Node[]>
}

export interface SyncTarget extends SyncSource {
	nodes(
		level: number,
		lowerBound?: Bound<Key> | null,
		upperBound?: Bound<Key> | null,
		options?: { reverse?: boolean }
	): AsyncIterableIterator<Node>
}

export interface IReadOnlyTransaction extends SyncSource, SyncTarget {
	has(key: Uint8Array): boolean
	get(key: Uint8Array): Uint8Array | null
	keys(
		lowerBound?: Bound<Uint8Array> | null,
		upperBound?: Bound<Uint8Array> | null,
		options?: { reverse?: boolean }
	): IterableIterator<Uint8Array>
	entries(
		lowerBound?: Bound<Uint8Array> | null,
		upperBound?: Bound<Uint8Array> | null,
		options?: { reverse?: boolean }
	): IterableIterator<Entry>
}

export interface IReadWriteTransaction extends IReadOnlyTransaction {
	set(key: Uint8Array, value: Uint8Array): void
	delete(key: Uint8Array): void
}

export interface ITree {
	metadata: Metadata
	read<T>(callback: (txn: IReadOnlyTransaction) => Awaitable<T>): Promise<T>
	write<T>(callback: (txn: IReadWriteTransaction) => Awaitable<T>): Promise<T>
}
```

## Contributing

This is an early project that is stil best treated as a research prototype. Feel free to open an issue if you find bugs or have thoughts about API design.

## License

MIT © 2023 Canvas Technologies, Inc.
