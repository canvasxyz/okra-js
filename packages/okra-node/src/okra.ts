import { createRequire } from "node:module"

import { familySync } from "detect-libc"

import type { Bound, Key, Node } from "@canvas-js/okra"

const family = familySync()

const { platform, arch } = process

const target = family === null ? `${arch}-${platform}` : `${arch}-${platform}-${family}`

const require = createRequire(import.meta.url)

module okra {
	export declare class Environment {
		constructor(path: string, options: { mapSize?: number; databases?: number })
		close(): void
		resize(mapSize: number): void
	}

	export declare class Transaction {
		constructor(env: Environment, readOnly: boolean, parent: Transaction | null)
		abort(): void
		commit(): void

		openDatabase(name: string | null): number

		get(dbi: number, key: Uint8Array): Uint8Array | null
		set(dbi: number, key: Uint8Array, value: Uint8Array): void
		delete(dbi: number, key: Uint8Array): void
	}

	export declare class Cursor {
		constructor(txn: Transaction, dbi: number)
		close(): void
		getCurrentEntry(): [key: Uint8Array, value: Uint8Array]
		getCurrentKey(): Uint8Array
		getCurrentValue(): Uint8Array
		setCurrentValue(value: Uint8Array): void
		deleteCurrentKey(): void
		goToNext(): Uint8Array | null
		goToPrevious(): Uint8Array | null
		goToFirst(): Uint8Array | null
		goToLast(): Uint8Array | null
		goToKey(key: Uint8Array): void
		seek(key: Uint8Array): Uint8Array | null
	}

	export declare class Tree {
		constructor(txn: Transaction, dbi: number)
		close(): void

		get(key: Uint8Array): Uint8Array | null
		set(key: Uint8Array, value: Uint8Array): void
		delete(key: Uint8Array): void

		getRoot(): Node
		getNode(level: number, key: Uint8Array | null): Node | null
		getChildren(level: number, key: Uint8Array | null): Node[]
	}

	export declare class Iterator {
		constructor(
			txn: Transaction,
			dbi: number,
			level: number,
			lowerBound: Bound<Key> | null,
			upperBound: Bound<Key> | null,
			reverse: boolean
		)

		close(): void
		next(): Node | null
	}
}

export type Environment = okra.Environment
export type Transaction = okra.Transaction
export type Cursor = okra.Cursor

export type Tree = okra.Tree
export type Iterator = okra.Iterator

export const { Environment, Transaction, Cursor, Tree, Iterator } =
	require(`../build/${target}/okra.node`) as typeof okra
