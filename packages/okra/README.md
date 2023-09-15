# `@canvas-js/okra`

[![NPM version](https://img.shields.io/npm/v/@canvas-js/okra)](https://www.npmjs.com/package/@canvas-js/okra) ![TypeScript types](https://img.shields.io/npm/types/@canvas-js/okra)

## Install

```
npm i @canvas-js/okra
```

## Usage

```ts
import { sync } from "@canvas-js/okra"
import { MemoryTree } from "@canvas-js/okra-memory"

const source = await MemoryTree.open()
const target = await MemoryTree.open()

const hex = (hex: string) => Buffer.from(hex, "hex")

await source.set(hex("00"), hex("aa"))
await target.set(hex("00"), hex("aa"))

await source.set(hex("01"), hex("bb"))

await source.set(hex("02"), hex("cc"))
await target.set(hex("02"), hex("dd"))

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
	const values = []
	for await (const value of iter) {
		values.push(value)
	}
	return values
}

const delta = await collect(sync(source, target))
console.log(delta)
// [
//   { key: <Buffer 01>, source: <Buffer bb>, target: null },
//   { key: <Buffer 02>, source: <Buffer cc>, target: <Buffer dd> }
// ]
```
