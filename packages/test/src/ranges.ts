import { fromString } from "uint8arrays"

import { Entry } from "@canvas-js/okra"

export const entries: Entry[] = [
	[fromString("a"), fromString("foo")],
	[fromString("b"), fromString("bar")],
	[fromString("c"), fromString("baz")],
	[fromString("g"), fromString("ooo")],
	[fromString("h"), fromString("aaa")],
]

export const ranges = [
	{ name: "entire range", lowerBound: null, upperBound: null, reverse: false, entries },
	{
		name: "inclusive lower bound",
		lowerBound: { key: fromString("b"), inclusive: true },
		upperBound: null,
		reverse: false,
		entries: [
			[fromString("b"), fromString("bar")],
			[fromString("c"), fromString("baz")],
			[fromString("g"), fromString("ooo")],
			[fromString("h"), fromString("aaa")],
		],
	},
	{
		name: "exclusive lower bound",
		lowerBound: { key: fromString("b"), inclusive: false },
		upperBound: null,
		reverse: false,
		entries: [
			[fromString("c"), fromString("baz")],
			[fromString("g"), fromString("ooo")],
			[fromString("h"), fromString("aaa")],
		],
	},
	{
		name: "inclusive upper bound",
		lowerBound: null,
		upperBound: { key: fromString("b"), inclusive: true },
		reverse: false,
		entries: [
			[fromString("a"), fromString("foo")],
			[fromString("b"), fromString("bar")],
		],
	},
	{
		name: "exclusive upper bound",
		lowerBound: null,
		upperBound: { key: fromString("b"), inclusive: false },
		reverse: false,
		entries: [[fromString("a"), fromString("foo")]],
	},
	{
		name: "upper bound out-of-range",
		lowerBound: null,
		upperBound: { key: fromString("x"), inclusive: false },
		reverse: false,
		entries: entries,
	},
	{
		name: "lower bound out-of-range",
		lowerBound: { key: fromString("7"), inclusive: false },
		upperBound: null,
		reverse: false,
		entries: entries,
	},
	{
		name: "reverse inclusive lower bound",
		lowerBound: { key: fromString("b"), inclusive: true },
		upperBound: null,
		reverse: true,
		entries: [
			[fromString("h"), fromString("aaa")],
			[fromString("g"), fromString("ooo")],
			[fromString("c"), fromString("baz")],
			[fromString("b"), fromString("bar")],
		],
	},
	{
		name: "reverse exclusive lower bound",
		lowerBound: { key: fromString("b"), inclusive: false },
		upperBound: null,
		reverse: true,
		entries: [
			[fromString("h"), fromString("aaa")],
			[fromString("g"), fromString("ooo")],
			[fromString("c"), fromString("baz")],
		],
	},
	{
		name: "reverse inclusive upper bound",
		lowerBound: null,
		upperBound: { key: fromString("b"), inclusive: true },
		reverse: true,
		entries: [
			[fromString("b"), fromString("bar")],
			[fromString("a"), fromString("foo")],
		],
	},
	{
		name: "reverse exclusive upper bound",
		lowerBound: null,
		upperBound: { key: fromString("c"), inclusive: false },
		reverse: true,
		entries: [
			[fromString("b"), fromString("bar")],
			[fromString("a"), fromString("foo")],
		],
	},
]
