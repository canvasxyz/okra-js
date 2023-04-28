import debug from "debug"
import { bytesToHex as hex } from "@noble/hashes/utils"

import { Key, Node, Bound } from "./interface.js"

export const formatKey = (key: Key) => (key ? hex(key) : "null")
export const formatNode = (node: Node | null) =>
	node ? `{ ${node.level}:${formatKey(node.key)} | ${hex(node.hash)} }` : "null"
export const formatBound = (bound: Bound<Key> | null) =>
	bound ? (bound.inclusive ? `[${formatKey(bound.key)}]` : `(${formatKey(bound.key)})`) : "..."

debug.formatters.h = hex
debug.formatters.k = formatKey
debug.formatters.n = formatNode
debug.formatters.b = formatBound

export { debug }
