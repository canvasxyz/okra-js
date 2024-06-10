import test from "ava"

test("no-op", (t) => t.pass())

// testPlatforms("nodes iterator", async (t, openTree) => {
// 	const tree = openTree(t, {})

// 	await tree.write((txn) => {
// 		txn.set(a.key, a.value)
// 		txn.set(b.key, b.value)
// 		txn.set(c.key, c.value)
// 		txn.set(g.key, g.value)
// 		txn.set(h.key, h.value)
// 	})

// 	const bound = (key: null | string, inclusive: boolean) => ({ key: key === null ? null : fromString(key), inclusive })

// 	await tree.read((txn) => {
// 		t.deepEqual([...txn.nodes(0)], [anchor, a, b, c, g, h])
// 		t.deepEqual([...txn.nodes(0, null, null, { reverse: true })], [h, g, c, b, a, anchor])

// 		t.deepEqual([...txn.nodes(0, bound("b", true), bound("g", true))], [b, c, g])
// 		t.deepEqual([...txn.nodes(0, bound("b", true), bound("g", false))], [b, c])

// 		t.deepEqual([...txn.nodes(0, bound("c", false), bound("g", false))], [])
// 		t.deepEqual([...txn.nodes(0, bound("c", false), bound("h", false))], [g])
// 		t.deepEqual([...txn.nodes(0, bound("c", false), bound("h", true))], [g, h])

// 		t.deepEqual([...txn.nodes(0, bound(null, true), bound("c", false))], [anchor, a, b])
// 		t.deepEqual([...txn.nodes(0, bound(null, false), bound("c", false))], [a, b])
// 	})
// })
