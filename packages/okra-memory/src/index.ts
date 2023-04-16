import { Tree, TreeOptions } from "@canvas-js/okra"
import { MemoryStore } from "./store.js"

export async function openTree(options: TreeOptions = {}): Promise<Tree> {
	const store = new MemoryStore()
	const tree = await Tree.open(store, options)
	return tree
}

export { MemoryStore }
