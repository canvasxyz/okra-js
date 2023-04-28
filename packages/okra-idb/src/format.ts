import debug from "debug"
import { bytesToHex as hex } from "@noble/hashes/utils"

import { formatKey, formatNode } from "@canvas-js/okra"

debug.formatters.h = hex
debug.formatters.k = formatKey
debug.formatters.n = formatNode

export { debug }
