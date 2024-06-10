import { SyncSource, SyncTarget, Delta } from "../interface.js"
import { Driver } from "./driver.js"

export async function* sync(source: SyncSource, target: SyncTarget): AsyncIterableIterator<Delta> {
	const driver = new Driver(source, target)
	yield* driver.sync()
}
