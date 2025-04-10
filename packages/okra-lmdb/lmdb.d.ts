export interface EnvironmentOptions {
	map?: number
	maxDbs?: number
	maxReaders?: number
	readOnly?: boolean
	writeMap?: boolean
	mode?: number
}

export interface EnvironmentInfo {
	mapSize: number
	readers: number
	maxReaders: number
}

export interface EnvironmentStat {
	pageSize: number
	depth: number
	branchPages: number
	leafPages: number
	overflowPages: number
	entries: number
}

export declare class Environment {
	constructor(path: string, options: EnvironmentOptions)
	close(): void
	info(): EnvironmentInfo
	stat(): EnvironmentStat
	resize(mapSize: number): void
}

export declare class Transaction {
	constructor(env: Environment, readOnly: boolean, parent: Transaction | null)
	abort(): void
	commit(): void
}

export declare class Database {
	constructor(txn: Transaction, name: string | null)

	get(key: Uint8Array): Uint8Array | null
	set(key: Uint8Array, value: Uint8Array): void
	delete(key: Uint8Array): void
}

export declare class Cursor {
	constructor(db: Database)
	[Symbol.dispose](): void
	close(): void
	getCurrentEntry(): [Uint8Array, Uint8Array]
	getCurrentKey(): Uint8Array
	getCurrentValue(): Uint8Array
	setCurrentValue(value: Uint8Array): void
	deleteCurrentKey(): void
	goToNext(): Uint8Array | null
	goToPrevious(): Uint8Array | null
	goToFirst(): Uint8Array | null
	goToLast(): Uint8Array | null
	goToKey(key: Uint8Array): void
	seek(needle: Uint8Array): Uint8Array | null
}
