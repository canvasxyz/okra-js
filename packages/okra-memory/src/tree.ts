import { Metadata, Tree } from "@canvas-js/okra"

import { MemoryStore } from "./store.js"

export class MemoryTree extends Tree {
	public static async open(options: Partial<Metadata> = {}) {
		const tree = new MemoryTree(new MemoryStore(), options)
		await tree.initialize()
		return tree
	}

	public constructor(public readonly store: MemoryStore = new MemoryStore(), options: Partial<Metadata> = {}) {
		super(store, options)
	}
}
