const std = @import("std");
const allocator = std.heap.c_allocator;

const lmdb = @import("lmdb");
const okra = @import("okra");

const c = @import("./c.zig");
const n = @import("./n.zig");

pub fn openDB(env: c.napi_env, name_value: c.napi_value, txn_ptr: *lmdb.Transaction) !lmdb.Database {
    switch (try n.typeOf(env, name_value)) {
        c.napi_null, c.napi_undefined => {
            return txn_ptr.database(null, .{});
        },
        c.napi_string => {
            const name = try n.parseStringAlloc(env, name_value, allocator);
            defer allocator.free(name);
            return try txn_ptr.database(name, .{ .create = true });
        },
        else => {
            return n.throwTypeError(env, "could not open database: expected string, null, or undefined");
        },
    }
}

pub fn parseKey(env: c.napi_env, key_value: c.napi_value) !?[]const u8 {
    return switch (try n.typeOf(env, key_value)) {
        c.napi_null => null,
        else => try n.parseTypedArray(u8, env, key_value),
    };
}

pub fn createKey(env: c.napi_env, key: ?[]const u8) !c.napi_value {
    if (key) |bytes| {
        return n.createTypedArray(u8, env, bytes);
    } else {
        return n.getNull(env);
    }
}

pub fn createNode(env: c.napi_env, node: okra.Node) !c.napi_value {
    const object = try n.createObject(env);

    const property_level = try n.createString(env, "level");
    const property_key = try n.createString(env, "key");
    const property_hash = try n.createString(env, "hash");
    try n.setProperty(env, object, property_level, try n.createUint32(env, node.level));
    try n.setProperty(env, object, property_key, try createKey(env, node.key));
    try n.setProperty(env, object, property_hash, try n.createTypedArray(u8, env, node.hash));

    if (node.value) |value| {
        const property_value = try n.createString(env, "value");
        try n.setProperty(env, object, property_value, try n.createTypedArray(u8, env, value));
    }

    return object;
}
