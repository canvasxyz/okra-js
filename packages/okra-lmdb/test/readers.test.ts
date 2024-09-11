import test from "ava"

import pDefer, { DeferredPromise } from "p-defer"
import { openTree } from "./utils.js"

test("max readers", async (t) => {
	const tree = openTree(t, {})

	const handles: DeferredPromise<void>[] = []
	const txns: Promise<void>[] = []

  for (let i = 0; i < 200; i++) {
    const handle = pDefer<void>()
    handles.push(handle)
    txns.push(tree.read((txn) => handle.promise))
  }

  for (const handle of handles) {
    handle.resolve()
  }

  await Promise.all(txns)

  t.pass()
})
