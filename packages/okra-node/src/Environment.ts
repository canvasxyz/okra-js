import PQueue from "p-queue"

import type { Awaitable } from "./types.js"
import { Transaction } from "./Transaction.js"
import * as okra from "./okra.js"

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
			throw new Error("Environment closed")
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
