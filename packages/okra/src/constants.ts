import type { Metadata } from "./interface.js"

export const OKRA_VERSION = 1

export const DEFAULT_K = 16
export const DEFAULT_Q = 32
export const DEFAULT_METADATA: Metadata = { K: DEFAULT_K, Q: DEFAULT_Q }

export const errors = {
	OKRA_METADATA_CONFLICT: "OKRA_METADATA_CONFLICT",
	OKRA_METADATA_INVLALID: "OKRA_METADATA_INVLALID",
} as const
