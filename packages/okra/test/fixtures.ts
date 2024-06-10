import { fromString } from "uint8arrays"

const rootNode = (level: number, hash: string) => ({ level, key: null, hash: fromString(hash, "hex") })

// // Sha256
// export const fixtures = [
// 	{ count: 0, root: rootNode(0, "e3b0c44298fc1c149afbf4c8996fb924"), metadata: { K: 16, Q: 4 } },
// 	{ count: 10, root: rootNode(3, "9655685615543e481f05de91209e8349"), metadata: { K: 16, Q: 4 } },
// 	{ count: 100, root: rootNode(6, "eb3bbe6a77319e6e2ec7706e23e77d04"), metadata: { K: 16, Q: 4 } },
// 	{ count: 1000, root: rootNode(5, "82395be228bed500de55345d72089d4a"), metadata: { K: 16, Q: 4 } },
// 	{ count: 10000, root: rootNode(9, "62179fb83c23bb8ef947b9bfe76fa15c"), metadata: { K: 16, Q: 4 } },
// 	// { count: 100000, root: rootNode(10, "97cc2c20b8f043ab3e701074c75e4fbf"), metadata: { K: 16, Q: 4 } },
// ]

// Blake3
export const fixtures = [
	{ count: 0, root: rootNode(0, "af1349b9f5f9a1a6a0404dea36dcc949"), metadata: { K: 16, Q: 4 } },
	{ count: 10, root: rootNode(4, "29f0468d278dc7fc9813a8e4c3613b89"), metadata: { K: 16, Q: 4 } },
	{ count: 100, root: rootNode(4, "b389c726f0afd280f986a11e7f4431c8"), metadata: { K: 16, Q: 4 } },
	{ count: 1000, root: rootNode(7, "42f378b631fcf79634a119887352ef34"), metadata: { K: 16, Q: 4 } },
	{ count: 10000, root: rootNode(9, "f3f553986a83194abca40f120bb7b293"), metadata: { K: 16, Q: 4 } },
	// { count: 100000, root: rootNode(8, "f7fe5a93e1bf0a6a8e93b89cf1fb1e96"), metadata: { K: 16, Q: 4 } },
]
