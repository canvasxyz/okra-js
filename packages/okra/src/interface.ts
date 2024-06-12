export enum Mode {
	Index = 0,
	Store = 1,
}

export interface Metadata {
	readonly K: number
	readonly Q: number
	readonly mode: Mode
}

export type Key = Uint8Array | null

export type Node = {
	level: number
	key: Key
	hash: Uint8Array
	value?: Uint8Array
}

export type Awaitable<T> = Promise<T> | T

export type Bound<T = Uint8Array> = { key: T; inclusive: boolean }

export type Entry = [key: Uint8Array, value: Uint8Array]
export type Delta = { key: Uint8Array; source: Uint8Array | null; target: Uint8Array | null }

export interface SyncSource {
	getRoot(): Awaitable<Node>
	getNode(level: number, key: Key): Awaitable<Node | null>
	getChildren(level: number, key: Key): Awaitable<Node[]>
}

export interface ReadOnlyTransaction {
	getRoot(): Node
	getNode(level: number, key: Key): Node | null
	getChildren(level: number, key: Key): Node[]
	nodes(
		level: number,
		lowerBound?: Bound<Key> | null,
		upperBound?: Bound<Key> | null,
		options?: { reverse?: boolean },
	): IterableIterator<Node>

	has(key: Uint8Array): boolean
	get(key: Uint8Array): Uint8Array | null

	keys(
		lowerBound?: Bound<Uint8Array> | null,
		upperBound?: Bound<Uint8Array> | null,
		options?: { reverse?: boolean },
	): IterableIterator<Uint8Array>

	entries(
		lowerBound?: Bound<Uint8Array> | null,
		upperBound?: Bound<Uint8Array> | null,
		options?: { reverse?: boolean },
	): IterableIterator<Entry>
}

export interface ReadWriteTransaction extends ReadOnlyTransaction {
	set(key: Uint8Array, value: Uint8Array): void
	delete(key: Uint8Array): void
}

export interface Tree {
	metadata: Metadata

	read<T>(callback: (txn: ReadOnlyTransaction) => Awaitable<T>): Promise<T>
	write<T>(callback: (txn: ReadWriteTransaction) => Awaitable<T>): Promise<T>

	close(): Awaitable<void>
	clear(): Awaitable<void>
}
