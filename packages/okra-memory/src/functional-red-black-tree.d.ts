declare module "functional-red-black-tree" {
	export interface Tree<K = string, V = string> {
		keys: K[]
		values: V[]
		length: number

		get(key: K): V | undefined
		insert(key: K, value: V): Tree<K, V>
		remove(key: K): Tree<K, V>

		begin: Iterator<K, V>
		end: Iterator<K, V>
		ge(key: K): Iterator<K, V>
		gt(key: K): Iterator<K, V>
		le(key: K): Iterator<K, V>
		lt(key: K): Iterator<K, V>
	}

	export interface Iterator<K = string, V = string> {
		valid: boolean
		hasNext: boolean
		hasPrev: boolean

		key: K
		value: V

		next(): void
		prev(): void
	}

	export default function createTree<K = string, V = string>(compare?: (a: K, b: K) => number): Tree<K, V>
}
