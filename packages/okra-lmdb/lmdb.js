import assert from "node:assert"
import { createRequire } from "node:module"

import { familySync } from "detect-libc"

const family = familySync()

const { platform, arch } = process

const target = family === null ? `${arch}-${platform}` : `${arch}-${platform}-${family}`

const require = createRequire(import.meta.url)

const lmdb = require(`./zig-out/lib/${target}/lmdb.node`)

export class Environment extends lmdb.Environment {}

export class Transaction extends lmdb.Transaction {
	#open = true
	get open() {
		return this.#open
	}

	abort() {
		assert(this.#open)
		this.#open = false
		super.abort()
	}

	commit() {
		assert(this.#open)
		this.#open = false
		super.commit()
	}
}

export class Database extends lmdb.Database {
	#txn
	get txn() {
		return this.#txn
	}

	constructor(txn, name) {
		assert(txn.open)
		super(txn, name)
		this.#txn = txn
	}
}

export class Cursor extends lmdb.Cursor {
	#txn
	get txn() {
		return this.#txn
	}

	#db
	get db() {
		return this.#db
	}

	constructor(db) {
		assert(db.txn.open)
		super(db)
		this.#db = db
		this.#txn = db.txn
	}

	[Symbol.dispose]() {
		assert(this.txn.open)
		super.close()
	}

	close() {
		assert(this.txn.open)
		super.close()
	}
}

// export const Environment = lmdb.Environment
// export const Transaction = lmdb.Transaction
// export const Database = lmdb.Database
// export const Cursor = lmdb.Cursor
