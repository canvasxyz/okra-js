import assert from "node:assert"
import { createRequire } from "node:module"

import { familySync } from "detect-libc"
import { equals } from "uint8arrays"
import PQueue from "p-queue"

import { KeyValueStore, Bound, Entry, lessThan, Node, Key, Source, Target, Awaitable } from "@canvas-js/okra"

const family = familySync()

const { platform, arch } = process

const target = family === null ? `${arch}-${platform}` : `${arch}-${platform}-${family}`

const require = createRequire(import.meta.url)

const okra = require(`../zig-out/lib/${target}/okra.node`)

export interface EnvironmentOptions {
	mapSize?: number
	databases?: number
}

export class Environment extends okra.Environment {
	#open = true
	#queue = new PQueue({ concurrency: 1 })

	constructor(public readonly path: string, options: EnvironmentOptions = {}) {
		super(path, options)
	}

	public async close() {
		this.#queue.clear()
		await this.#queue.onIdle()
		if (this.#open) {
			super.close()
			this.#open = false
		} else {
			throw new Error("environment closed")
		}
	}

	public async resize(mapSize: number) {
		await this.#queue.add(() => super.resize(mapSize))
	}

	public async read<T>(callback: (txn: Transaction) => Awaitable<T>): Promise<T> {
		const txn = new Transaction(this, { readOnly: true })
		try {
			return await callback(txn)
		} finally {
			txn.abort()
		}
	}

	public async write<T>(callback: (txn: Transaction) => Awaitable<T>): Promise<T> {
		let result: T | null = null
		await this.#queue.add(async () => {
			const txn = new Transaction(this, { readOnly: false })
			try {
				result = await callback(txn)
				txn.commit()
			} catch (err) {
				txn.abort()
				throw err
			}
		})

		return result!
	}
}

export interface TransactionOptions {
	readOnly?: boolean
	parent?: Transaction
}

export class Transaction extends okra.Transaction {
	public readonly readOnly: boolean
	public readonly parent: Transaction | null

	#open = true

	constructor(public readonly env: Environment, options: TransactionOptions = {}) {
		const { readOnly = false, parent = null } = options
		super(env, readOnly, parent)

		this.readOnly = readOnly
		this.parent = parent
	}

	public abort() {
		if (this.#open === false) {
			throw new Error("transaction closed")
		}

		super.abort()
		this.#open = false
	}

	public commit() {
		if (this.#open === false) {
			throw new Error("transaction closed")
		}

		super.commit()
		this.#open = false
	}

	public async openTree<T = void>(name: string | null, callback: (tree: Tree) => Awaitable<T>): Promise<T> {
		if (this.#open === false) {
			throw new Error("transaction closed")
		}

		const tree = new Tree(this, name)
		try {
			return await callback(tree)
		} finally {
			tree.close()
		}
	}

	public database(name: string | null = null): Database {
		return new Database(this, name)
	}
}

export class Database extends okra.Database implements KeyValueStore {
	constructor(txn: Transaction, name: string | null) {
		super(txn, name)
	}

	public get(key: Uint8Array): Uint8Array | null {
		return super.get(key)
	}

	public set(key: Uint8Array, value: Uint8Array): void {
		super.set(key, value)
	}

	public delete(key: Uint8Array): void {
		if (super.get(key) !== null) {
			super.delete(key)
		}
	}

	public async *entries(
		lowerBound: Bound<Uint8Array> | null = null,
		upperBound: Bound<Uint8Array> | null = null,
		options: { reverse?: boolean } = {}
	): AsyncIterableIterator<Entry> {
		const { reverse = false } = options
		const cursor = new Cursor(this)
		if (reverse) {
			for (let key = cursor.goToEnd(upperBound); key !== null; key = cursor.goToPrevious()) {
				if (lowerBound !== null) {
					if (lessThan(key, lowerBound.key)) {
						return
					} else if (lowerBound.inclusive === false && equals(lowerBound.key, key)) {
						return
					}
				}

				const value = cursor.getCurrentValue()
				yield [key, value]
			}
		} else {
			for (let key = cursor.goToStart(lowerBound); key !== null; key = cursor.goToNext()) {
				if (upperBound !== null) {
					if (lessThan(upperBound.key, key)) {
						return
					} else if (upperBound.inclusive === false && equals(upperBound.key, key)) {
						return
					}
				}

				const value = cursor.getCurrentValue()
				yield [key, value]
			}
		}
	}
}

export class Cursor extends okra.Cursor {
	#open = true

	constructor(public readonly db: Database) {
		super(db)
	}

	public close(): void {
		if (this.#open) {
			super.close()
			this.#open = false
		} else {
			throw new Error("cursor closed")
		}
	}

	public goToStart(lowerBound: Bound<Uint8Array> | null): Uint8Array | null {
		if (lowerBound === null) {
			return this.goToFirst()
		}

		const start = this.seek(lowerBound.key)
		if (lowerBound.inclusive === false) {
			if (start !== null && equals(start, lowerBound.key)) {
				return this.goToNext()
			}
		}

		return start
	}

	public goToEnd(upperBound: Bound<Uint8Array> | null): Uint8Array | null {
		if (upperBound === null) {
			return this.goToLast()
		}

		const end = this.seek(upperBound.key)
		if (upperBound.inclusive) {
			if (end !== null && equals(end, upperBound.key)) {
				return end
			} else {
				return this.goToPrevious()
			}
		} else {
			return this.goToPrevious()
		}
	}

	public getCurrentEntry(): Entry {
		const [key, value] = super.getCurrentEntry()
		return [key, value]
	}

	public getCurrentKey(): Uint8Array {
		return super.getCurrentKey()
	}

	public getCurrentValue(): Uint8Array {
		return super.getCurrentValue()
	}

	public setCurrentValue(value: Uint8Array): void {
		super.setCurrentValue(value)
	}

	public deleteCurrentKey(): void {
		super.deleteCurrentKey()
	}

	public goToNext(): Uint8Array | null {
		return super.goToNext()
	}

	public goToPrevious(): Uint8Array | null {
		return super.goToPrevious()
	}

	public goToFirst(): Uint8Array | null {
		return super.goToFirst()
	}

	public goToLast(): Uint8Array | null {
		return super.goToLast()
	}

	public goToKey(key: Uint8Array): void {
		super.goToKey(key)
	}

	public seek(needle: Uint8Array): Uint8Array | null {
		return super.seek(needle)
	}
}

export interface TreeOptions {
	name?: string | null
}

export class Tree extends okra.Tree implements KeyValueStore, Source, Target {
	#open = true

	public constructor(public readonly txn: Transaction, name: string | null) {
		super(txn, name)
	}

	public close() {
		if (this.#open) {
			super.close()
			this.#open = false
		} else {
			throw new Error("tree closed")
		}
	}

	// KeyValueStore methods

	public get(key: Uint8Array): Uint8Array | null {
		return super.get(key)
	}

	public set(key: Uint8Array, value: Uint8Array) {
		super.set(key, value)
	}

	public delete(key: Uint8Array) {
		super.delete(key)
	}

	public async *entries(
		lowerBound: Bound<Uint8Array> | null = null,
		upperBound: Bound<Uint8Array> | null = null,
		options: { reverse?: boolean } = {}
	): AsyncIterableIterator<Entry> {
		for await (const node of this.nodes(0, lowerBound ?? { key: null, inclusive: false }, upperBound, options)) {
			assert(node.key !== null, "expected node.key !== null")
			assert(node.value !== undefined, "expected node.value !== undefined")
			yield [node.key, node.value]
		}
	}

	// Source & Target methods

	public getRoot(): Node {
		return super.getRoot()
	}

	public getNode(level: number, key: Key): Node | null {
		return super.getNode(level, key)
	}

	public getChildren(level: number, key: Key): Node[] {
		return super.getChildren(level, key)
	}

	public async *nodes(
		level: number,
		lowerBound: Bound<Key> | null = null,
		upperBound: Bound<Key> | null = null,
		options: { reverse?: boolean } = {}
	): AsyncIterableIterator<Node> {
		const iter = new Iterator(this, level, lowerBound, upperBound, options)
		try {
			for (let node = iter.next(); node !== null; node = iter.next()) {
				yield node
			}
		} finally {
			iter.close()
		}
	}
}

export class Iterator extends okra.Iterator {
	#open = true

	public constructor(
		public readonly tree: Tree,
		level: number,
		lowerBound: Bound<Key> | null = null,
		upperBound: Bound<Key> | null = null,
		options: { reverse?: boolean } = {}
	) {
		super(tree, level, lowerBound, upperBound, options.reverse ?? false)
	}

	public close() {
		if (this.#open) {
			super.close()
			this.#open = false
		} else {
			throw new Error("iterator closed")
		}
	}

	public next(): Node | null {
		return super.next()
	}
}
