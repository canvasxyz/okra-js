const std = @import("std");
const allocator = std.heap.c_allocator;

const lmdb = @import("lmdb");

const c = @import("../c.zig");
const n = @import("../n.zig");
const utils = @import("../utils.zig");

const Environment = @import("environment.zig");

pub const TypeTag = c.napi_type_tag{
    .lower = 0x227735EAA000401C,
    .upper = 0xA0FAB6EE1BF434F3,
};

pub const methods = [_]n.Method{
    n.createMethod("abort", 0, abort),
    n.createMethod("commit", 0, commit),
    n.createMethod("openDatabase", 1, openDatabase),

    n.createMethod("get", 2, get),
    n.createMethod("set", 3, set),
    n.createMethod("delete", 2, delete),
};

pub const argc = 3;

/// `new Transaction(env, readOnly, parent)`
pub fn create(env: c.napi_env, this: c.napi_value, args: *const [argc]c.napi_value) !c.napi_value {
    const env_arg = args[0];
    const read_only_arg = args[1];
    const parent_arg = args[2];

    const env_ptr = try n.unwrap(lmdb.Environment, &Environment.TypeTag, env, env_arg);

    const read_only = try n.parseBoolean(env, read_only_arg);
    const mode: lmdb.Transaction.Mode = if (read_only) .ReadOnly else .ReadWrite;

    var parent: ?lmdb.Transaction = null;
    switch (try n.typeOf(env, parent_arg)) {
        c.napi_null => {},
        else => {
            const parent_ptr = try n.unwrap(lmdb.Transaction, &TypeTag, env, parent_arg);
            parent = parent_ptr.*;
        },
    }

    const txn_ptr = try allocator.create(lmdb.Transaction);
    txn_ptr.* = try lmdb.Transaction.open(env_ptr.*, .{ .mode = mode, .parent = parent });
    try n.wrap(lmdb.Transaction, env, this, txn_ptr, destroy, &TypeTag);

    return null;
}

pub fn destroy(_: c.napi_env, finalize_data: ?*anyopaque, _: ?*anyopaque) callconv(.C) void {
    if (finalize_data) |ptr| {
        const txn_ptr = @as(*lmdb.Transaction, @ptrCast(@alignCast(ptr)));
        allocator.destroy(txn_ptr);
    }
}

pub fn abort(env: c.napi_env, this: c.napi_value, _: *const [0]c.napi_value) !c.napi_value {
    const txn_ptr = try n.unwrap(lmdb.Transaction, &TypeTag, env, this);
    txn_ptr.abort();
    return null;
}

pub fn commit(env: c.napi_env, this: c.napi_value, _: *const [0]c.napi_value) !c.napi_value {
    const txn_ptr = try n.unwrap(lmdb.Transaction, &TypeTag, env, this);
    try txn_ptr.commit();

    return null;
}

pub fn openDatabase(env: c.napi_env, this: c.napi_value, args: *const [1]c.napi_value) !c.napi_value {
    const txn_ptr = try n.unwrap(lmdb.Transaction, &TypeTag, env, this);
    const dbi = try utils.parseDatabase(env, args[0], txn_ptr.*);
    return try n.createUint32(env, dbi);
}

pub fn get(env: c.napi_env, this: c.napi_value, args: *const [2]c.napi_value) !c.napi_value {
    const txn_ptr = try n.unwrap(lmdb.Transaction, &TypeTag, env, this);
    const dbi = try utils.parseDatabase(env, args[0], txn_ptr.*);
    const key = try n.parseTypedArray(u8, env, args[1]);
    const value = try txn_ptr.get(dbi, key);
    if (value) |bytes| {
        return n.createTypedArray(u8, env, bytes);
    } else {
        return n.getNull(env);
    }
}

pub fn set(env: c.napi_env, this: c.napi_value, args: *const [3]c.napi_value) !c.napi_value {
    const txn_ptr = try n.unwrap(lmdb.Transaction, &TypeTag, env, this);
    const dbi = try utils.parseDatabase(env, args[0], txn_ptr.*);
    const key = try n.parseTypedArray(u8, env, args[1]);
    const value = try n.parseTypedArray(u8, env, args[2]);

    try txn_ptr.set(dbi, key, value);

    return null;
}

pub fn delete(env: c.napi_env, this: c.napi_value, args: *const [2]c.napi_value) !c.napi_value {
    const txn_ptr = try n.unwrap(lmdb.Transaction, &TypeTag, env, this);
    const dbi = try utils.parseDatabase(env, args[0], txn_ptr.*);
    const key = try n.parseTypedArray(u8, env, args[1]);

    try txn_ptr.delete(dbi, key);

    return null;
}
