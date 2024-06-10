import { Mode, Metadata } from "./interface.js"

export const OKRA_VERSION = 3

export const DEFAULT_K = 16
export const DEFAULT_Q = 32
export const DEFAULT_METADATA: Metadata = { K: DEFAULT_K, Q: DEFAULT_Q, mode: Mode.Store }
