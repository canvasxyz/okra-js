export interface Metadata {
	readonly K: number
	readonly Q: number
}

export type Key = Uint8Array | null

export type Node = {
	level: number
	key: Key
	hash: Uint8Array
	value?: Uint8Array
}

type Awaitable<T> = Promise<T> | T

export interface Source {
	getRoot(): Awaitable<Node>
	getNode(level: number, key: Key): Awaitable<Node | null>
	getChildren(level: number, key: Key): Awaitable<Node[]>
}

export type Bound<K> = { key: K; inclusive: boolean }

export interface Target extends Source {
	nodes(
		level: number,
		lowerBound?: Bound<Key> | null,
		upperBound?: Bound<Key> | null,
		options?: { reverse?: boolean }
	): AsyncIterableIterator<Node>
}

export interface KeyValueStore {
	get(key: Uint8Array): Awaitable<Uint8Array | null>
	set(key: Uint8Array, value: Uint8Array): Awaitable<void>
	delete(key: Uint8Array): Awaitable<void>
	entries(
		lowerBound?: Bound<Uint8Array> | null,
		upperBound?: Bound<Uint8Array> | null,
		options?: { reverse?: boolean }
	): AsyncIterableIterator<Entry>
}

export type Entry = [Uint8Array, Uint8Array]

export type Delta = { key: Uint8Array; source: Uint8Array | null; target: Uint8Array | null }
