# okra-js

Pure JS merkle search tree over an [`abstract-level`](https://github.com/Level/abstract-level) interface.

## Table of Contents

- [Background](#background)
- [Install](#install)
- [Usage](#usage)
  - [Opening a tree](#opening-a-tree)
  - [Getting, setting, and deleting entries](#getting-setting-and-deleting-entries)
  - [Iterating over ranges of entries](#iterating-over-ranges-of-entries)
  - [Exposing the internal merkle search tree](#exposing-the-internal-merkle-search-tree)
  - [Syncing with a remote source](#syncing-with-a-remote-source)
  - [`pull`, `copy`, and `merge` patterns](#pull-copy-and-merge-patterns)
  - [Debugging](#debugging)
- [Testing](#testing)
- [API](#api)
- [Contributing](#contributing)
- [License](#license)

## Background

okra is a key/value store augmented with a _merkle search tree_ index. You can use it like a regular key/value store, with `get`/`set`/`delete` methods and an `entries()` iterator. The merkle search tree enables **efficient syncing** by iterating over the missing, extra, or conflicting entries between a local and remote okra database.

okra can be used as a **natural persistence layer for operation-based CRDTs**, directly as a persistent state-based CRDT map with efficient merging, "rsync for key/value stores", and much more. Read through the examples in the usage section to see it in action.

`@canvas-js/okra` is one of two compatible reference implementations. The other is [`@canvas-js/okra-node`](https://github.com/canvasxyz/okra), which is written in Zig and can be installed as a native NodeJS module.

## Install

```
npm i @canvas-js/okra
```

## Usage

okra is designed as a thin wrapper around an existing key/value store; the specification is documented in the main [canvasxyz/okra](https://github.com/canvasxyz/okra) repo. This package exports a `Tree` class that can wrap any implementation of the [abstract-level](https://github.com/Level/abstract-level) interface. abstract-level is a project that grew out of leveldb and its extended universe; it now houses a family of API-compatible key/value stores including [memory-level](https://github.com/Level/memory-level) (totally in-memory), [classic-level](https://github.com/Level/classic-level) (backed by LevelDB), and [browser-level](https://github.com/Level/browser-level), backed by IndexedDB. The examples here all use memory-level, but okra works with any of them.

### Opening a tree

Import the `Tree` class and pass an abstract-level instance into `Tree.open`. Upon opening, the tree will write a header entry and the leaf anchor node if they do not exist.

```ts
import { Tree } from "@canvas-js/okra"
import { MemoryLevel } from "memory-level"

const tree = await Tree.open(new MemoryLevel())
```

### Getting, setting, and deleting entries

The tree can be used as a normal key/value store with `.get`, `.set`, and `.delete` methods.

> ⚠️ Concurrent calls to `.set` and `.delete` **WILL cause internal corruption** - you must always use `await`, locks, a queue, or some other kind of concurrency control.

Setting or deleting an entry translates into several `put` and `del` operations in the underlying `abstract-level` database. The `abstract-level` interface only offers "transactions" in the form of batched operations, which isn't suitable for dynamic internal tree maintenance. As a result, `.set` and `.delete` have weak consistency properties: if a underlying `put` or `del` fails, it will leave the tree in a corrupted state. If this happens, it can be corrected with a call to `await tree.rebuild()`.

If atomic and consistent transactions are important to you, consider using the native NodeJS bindings for the [Zig implementation](https://github.com/canvasxyz/okra), which has fully ACID transactions and a multi-reader single-writer concurrency model.

You can override the default internal hash size and target fanout degree by passing `{ K: number, Q: number }` into `Tree.open`, although this is discouraged.

```js
const encoder = new TextEncoder()

await tree.set(encoder.encode("a"), encoder.encode("foo"))
await tree.set(encoder.encode("b"), encoder.encode("bar"))
await tree.set(encoder.encode("c"), encoder.encode("baz"))

await tree.get(encoder.encode("a"))
// <Buffer 66 6f 6f>
```

### Iterating over ranges of entries

You can iterate over ranges of entries with `tree.entries()`, which takes an optional inclusive lower bound and an optional exclusive uppper bound.

```ts
import { collect } from "@canvas-js/okra"

await collect(tree.entries())
// [
//   [ <Buffer 61>, <Buffer 66 6f 6f> ],
//   [ <Buffer 62>, <Buffer 62 61 72> ],
//   [ <Buffer 63>, <Buffer 62 61 7a> ]
// ]

await collect(tree.entries(null, null, { reverse: true }))
// [
//   [ <Buffer 63>, <Buffer 62 61 7a> ],
//   [ <Buffer 62>, <Buffer 62 61 72> ],
//   [ <Buffer 61>, <Buffer 66 6f 6f> ]
// ]

await collect(tree.entries(encoder.encode("b"), encoder.encode("c")))
// [
//	 [ <Buffer 62>, <Buffer 62 61 72> ]
// ]
```

### Exposing the internal merkle search tree

You can access the internal merkle tree nodes using the `getRoot` and `getChildren` methods. These are the methods that must be accessible to other okra databases, such as over an HTTP API. okra-js itself is transport-agnostic.

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

First, you must have an instance of the `Source` interface for the remote okra database you want to sync with. If you're exposing the merkle tree via an HTTP API, you'll have to write a little client implementing `Source` that uses `fetch`, or whatever is appropriate for your transport.

```ts
interface Source {
  getRoot(): Promise<Node>
  getChildren(level: number, key: Key): Promise<Node[]>
}
```

`Tree` itself implements `Source`, so we can easily demonstrate the sync methods using two local databases.

```ts
import { Tree, collect } from "@canvas-js/okra"

// create two in-memory trees
const source = await Tree.open(new MemoryLevel())
const target = await Tree.open(new MemoryLevel())

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

await collect(target.delta(source))
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

`Tree.prototype.delta` is the lowest-level form of syncing. It is an async generator that yields `delta: Delta` objects with `key`, `source`, and `target` properties. `delta.key` is always a `Uint8Array`. `delta.source === null && delta.target !== null` represents an entry that the target has but the source is missing, `delta.source !== null && delta.target === null` represents an entry that the source has but the target is missing, and `delta.source !== null && delta.target !== null` represents an entry for which the source and target have different values. `delta.source` and `delta.target` are never both `null`.

> ⚠️ Syncing **will fail if the source is concurrently modified**. This is because abstract-level does not support proper snapshots with transactions.

This means that your implementation of sync transport will need some concept of "sessions" so that okra-js sources can queue pending calls to `.set` and `.delete` when a session is active, and resume handling them when the session ends. This could be done with an async queue like[ `p-queue`](https://github.com/sindresorhus/p-queue) or using locks from e.g. the [Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API). In the future, okra-js may enforce locking itself, but for now it is left to the user.

However, thanks to the specific behavior of the sync algorithm, the **target tree _can_ be modified while syncing**. You can safely `await tree.set(...)` and `await tree.delete(...)` inside a `for await (const delta of tree.delta(source)) { ... }` loop.

The Zig implementation and its NodeJS bindings support snapshots and thus can process a read-write transaction with abitrarily many concurrent read-only transactions.

### `pull`, `copy`, and `merge` patterns

Calling `tree.delta(source)` does not automatically modify `tree` - it only iterates over the differences. Taking action in response to each delta is up to you! There are several different ways that you might want to use the deltas, three of which are implemented as exmples.

#### `Tree.prototype.pull`

Call `await tree.pull(source)` to _pull in missing entries_ that `source` has but `tree` doesn't, doing nothing for entries in `tree` missing in `source`, and throwing an error if the values for a key conflict. Only use this if the values of keys don't change! One example where this is useful is in content-addressed systems where keys are derived from the hashes of immutable values.

One way of looking at `pull` is that it implements a grow-only set with an efficient union operation. This pattern is useful, for example, as a persistence layer for **operation-based CRDT** systems, where it allows arbitrary peers to directly sync their sets of operations without relying on tracking methods that scale linearly in the number of peers. In that case, you'd probably want to use `delta(source)` directly so that you can apply new operations in addition to inserting them into the tree.

```ts
class Tree {
  // ...
  public async pull(source: Source): Promise<void> {
    for await (const delta of this.delta(source)) {
      if (delta.source === null) {
        continue
      } else if (delta.target === null) {
        await this.set(delta.key, delta.source)
      } else {
        throw new ModuleError("Conflict", { code: "OKRA_CONFLICT" })
      }
    }
  }
}
```

#### `Tree.prototype.copy`

Call `await tree.copy(source)` to _copy the remote source_, deleting any local entries that `source` doesn't have, setting new entries for keys that `source` has that `tree` doesn't, and adopting `source`'s value for any conflicting keys. By the end, `tree` will have the exact same leaf entries, tree structure, and root hash as `source`.

```ts
class Tree {
  // ...
  public async copy(source: Source): Promise<void> {
    for await (const delta of this.delta(source)) {
      if (delta.source === null) {
        await this.delete(delta.key)
      } else {
        await this.set(delta.key, delta.source)
      }
    }
  }
}
```

#### `Tree.prototype.merge`

Call `await tree.merge(source, arbiter)` to merge entries from a remote source - keeping local entries that `source` doesn't have, copying entries from `source` that aren't present in `tree`, and resolving conflicting values using the provided `arbiter` method.

In most cases, the `arbiter` method should deterministically choose one of the two values, but it could also return a new "merged" value. The only hard constraints are that it must be commutative, associative, and idempotent.

- commutativity: `arbiter(A, B) == arbiter(B, A)` for all `A` and `B`
- associativity: `arbiter(A, arbiter(B, C)) == arbiter(arbiter(A, B), C)` for all `A`, `B`, and `C`
- idempotence: `arbiter(A, A) == A` for all `A`

The merge method is useful for implementing **persistent state-based CRDT** systems. If your top-level state and its global merge function can be represented as a key/value map with entry-wise merging, you can use okra to **perform p2p state merges in logarithmic time**.

```ts
class Tree {
  // ...
  public async merge(
    source: Source,
    arbiter: (key: Uint8Array, source: Uint8Array, target: Uint8Array) => Uint8Array | Promise<Uint8Array>
  ): Promise<void> {
    for await (const delta of this.delta(source)) {
      if (delta.source === null) {
        continue
      } else if (delta.target === null) {
        await this.set(delta.key, delta.source)
      } else {
        const value = await mergeValues(delta.key, delta.source, delta.target)
        await this.set(delta.key, value)
      }
    }
  }
}
```

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

const bigTree = await Tree.open(new MemoryLevel())
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

Tests are run with [AVA](https://github.com/avajs/ava) and live in [./test/\*.test.ts](./test). They use [memory-level](https://github.com/Level/memory-level) for the underlying database.

```
npm run test
```

The two most important things covered by the tests are 1) correctness of the tree update algorithm 2) correctness of the syncing algorithm. Correctness of the tree is tested by comparing the underlying database entry-by-entry with a reference tree built layer-by-layer using the `Builder` class exported from [./src/builder.ts](./src/builder.ts) (also used by `Tree.prototype.rebuild`). These tests insert entries in random order in a series of sizes up to 10000 entries, using `Q = 4` to maximize tree height and internal complexity. Correctness of syncing is tested by initializing two trees with the same contents, also with `Q = 4`, then randomly deleting different sets of entries from each of them, manually tracking the expected set of deltas and testing that `t.deepEqual(await collect(target.delta(source)), expected)`.

## API

```ts
declare type Entry = [key: Uint8Array, value: Uint8Array]

declare type Key = Uint8Array | null

// value is undefined for level > 0 || key === null,
// and a Uint8Array for level === 0 && key !== null.
declare type Node = {
  level: number
  key: Key
  hash: Uint8Array
  value?: Uint8Array
}

// source and target are never both null.
declare type Delta = { key: Uint8Array; source: Uint8Array | null; target: Uint8Array | null }

declare interface Source {
  getRoot(): Promise<Node>
  getChildren(level: number, key: Key): Promise<Node[]>
}

/**
 * You should never have to instantiate the generic type parameters manually.
 * Just pass an abstract-level instance to Tree.open and the TypeScript
 * compiler should be able to infer the rest.
 */
declare class Tree<TFormat = any, KDefault = any, VDefault = any> implements Source {
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
  public entries(
    lowerBound?: Uint8Array | null,
    upperBound?: Uint8Array | null,
    options?: { reverse?: boolean }
  ): AsyncIterableIterator<Entry>

  // access internal merkle tree nodes
  public getRoot(): Promise<Node>
  public getNode(level: number, key: Key): Promise<Node | null>
  public getChildren(level: number, key: Key): Promise<Node[]>

  /**
   * Iterate over the differences between the entries in the local tree and a remote source.
   */
  public delta(source: Source): AsyncGenerator<Delta, void, undefined>

  public pull(source: Source): Promise<void>

  public copy(source: Source): Promise<void>

  public merge(
    source: Source,
    arbiter: (key: Uint8Array, source: Uint8Array, target: Uint8Array) => Uint8Array | Promise<Uint8Array>
  ): Promise<void>

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

## License

MIT © 2023 Canvas Technologies, Inc.
