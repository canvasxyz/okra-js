import debug from "debug"
import { bytesToHex as hex } from "@noble/hashes/utils"

import { Key, Node } from "./interface.js"

export const formatKey = (key: Key) => (key ? hex(key) : "null")
export const formatNode = ({ level, key, hash }: Node) => `[${level} ${formatKey(key)} ${hex(hash)}]`

debug.formatters.h = hex
debug.formatters.k = formatKey
debug.formatters.n = formatNode

export { debug }
