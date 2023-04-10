export type Key = Uint8Array | null

export type Node = {
	level: number
	key: Key
	hash: Uint8Array
	value?: Uint8Array
}

export interface Source {
	getRoot(): Promise<Node>
	getNode(level: number, key: Key): Promise<Node | null>
	getChildren(level: number, key: Key): Promise<Node[]>
}

export type Delta = { key: Uint8Array; source: Uint8Array | null; target: Uint8Array | null }
