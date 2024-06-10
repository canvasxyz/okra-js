import { createRequire } from "node:module"

import { familySync } from "detect-libc"

const family = familySync()

const { platform, arch } = process

const target = family === null ? `${arch}-${platform}` : `${arch}-${platform}-${family}`

const require = createRequire(import.meta.url)

const lmdb = require(`./zig-out/lib/${target}/lmdb.node`)

export const Environment = lmdb.Environment
export const Transaction = lmdb.Transaction
export const Database = lmdb.Database
export const Cursor = lmdb.Cursor
