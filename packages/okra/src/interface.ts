export type Key = Uint8Array | null

export type Node = {
	level: number
	key: Key
	hash: Uint8Array
	value?: Uint8Array
}

export interface NodeRange {
	level: number
	reverse?: boolean
	lowerBound?: { key: Key; inclusive: boolean }
	upperBound?: { key: Key; inclusive: boolean }
}

export interface Source {
	getRoot(): Promise<Node>
	getChildren(level: number, key: Key): Promise<Node[]>
}

export type Delta = { key: Uint8Array; source: Uint8Array | null; target: Uint8Array | null }
