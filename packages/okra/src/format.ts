import debug from "debug"
import { toString } from "uint8arrays"

import { Key, Node, Bound } from "./interface.js"

export const formatKey = (key: Key) => (key ? toString(key, "hex") : "null")

export const formatNode = (node: Node | null) =>
	node ? `{ ${node.level}:${formatKey(node.key)} | ${toString(node.hash, "hex")} }` : "null"

export const formatBound = (bound: Bound<Key> | null) =>
	bound ? (bound.inclusive ? `[${formatKey(bound.key)}]` : `(${formatKey(bound.key)})`) : "..."

debug.formatters.h = (bytes) => toString(bytes, "hex")
debug.formatters.k = formatKey
debug.formatters.n = formatNode
debug.formatters.b = formatBound

export { debug }
