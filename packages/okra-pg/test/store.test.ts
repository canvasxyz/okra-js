import test from "ava"
import pg from "pg"
import { PostgresStore } from "@canvas-js/okra-pg"

const getStore = async (table: string): Promise<[PostgresStore, pg.Client]> => {
	const path = "postgresql://localhost:5432/test" // TODO
	const client = new pg.Client(path)
	await client.connect()

	const store = await PostgresStore.initialize(client, { table, clear: true })
	return [store, client]
}

test.serial("test get, set, delete on multiple pg stores", async (t) => {
	const [fooStore, fooClient] = await getStore("foos")
	const [barStore, barClient] = await getStore("bars")

	const enc = (str: string) => new TextEncoder().encode(str)
	const dec = (bytes: Uint8Array | null) => bytes && new TextDecoder().decode(bytes)

	await fooStore.set(enc("foo"), enc("foo"))
	await fooStore.set(enc("baz"), enc(""))
	await fooStore.set(enc("bar"), enc("bar"))
	await fooStore.set(enc("bar"), enc("qux"))

	await barStore.set(enc("bar"), enc("boo"))

	t.deepEqual(dec(await fooStore.get(enc("foo"))), "foo")
	t.deepEqual(dec(await fooStore.get(enc("baz"))), "")
	t.deepEqual(dec(await fooStore.get(enc("bar"))), "qux")

	t.deepEqual(dec(await barStore.get(enc("foo"))), null)
	t.deepEqual(dec(await barStore.get(enc("baz"))), null)
	t.deepEqual(dec(await barStore.get(enc("bar"))), "boo")

	await fooStore.delete(enc("bar"))
	await barStore.delete(enc("bar"))

	t.deepEqual(await fooStore.get(enc("bar")), null)
	t.deepEqual(await barStore.get(enc("bar")), null)

	await fooClient.end()
	await barClient.end()

	t.pass()
})
