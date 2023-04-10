import debug from "debug"
import { bytesToHex } from "@noble/hashes/utils"
import { Key, Node } from "./nodes.js"

export const formatKey = (key: Key) => (key ? bytesToHex(key) : "null")
export const formatNode = ({ level, key, hash }: Node) => `[${level} ${formatKey(key)} ${bytesToHex(hash)}]`

debug.formatters.h = bytesToHex
debug.formatters.k = formatKey
debug.formatters.n = formatNode

export { debug }
