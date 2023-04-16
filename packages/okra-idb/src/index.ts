import type { IDBPDatabase } from "idb"
import { Tree, TreeOptions } from "@canvas-js/okra"

import { IDBNodeStore } from "./store.js"

export async function openTree(
	db: IDBPDatabase,
	storeName: string,
	mode: IDBTransactionMode,
	options: TreeOptions = {}
): Promise<Tree> {
	const store = new IDBNodeStore(db, storeName, mode)
	const tree = await Tree.open(store, options)
	return tree
}

export { IDBNodeStore }
