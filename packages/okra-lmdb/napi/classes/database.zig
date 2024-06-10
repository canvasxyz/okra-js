const std = @import("std");
const allocator = std.heap.c_allocator;

const lmdb = @import("lmdb");

const c = @import("../c.zig");
const n = @import("../n.zig");
const utils = @import("../utils.zig");

const Transaction = @import("transaction.zig");

pub const TypeTag = c.napi_type_tag{
    .lower = 0xCE776A69D39E4F74,
    .upper = 0x8AB442EC9E618CA6,
};

pub const methods = [_]n.Method{
    n.createMethod("get", 1, get),
    n.createMethod("set", 2, set),
    n.createMethod("delete", 1, delete),
};

pub const argc = 2;

/// `new Database(txn, name)`
pub fn create(env: c.napi_env, this: c.napi_value, args: *const [2]c.napi_value) !c.napi_value {
    const txn_ptr = try n.unwrap(lmdb.Transaction, &Transaction.TypeTag, env, args[0]);
    const db = try utils.openDB(env, args[1], txn_ptr);

    const db_ptr = try allocator.create(lmdb.Database);
    db_ptr.* = db;

    try n.wrap(lmdb.Database, env, this, db_ptr, destroy, &TypeTag);

    return null;
}

pub fn destroy(_: c.napi_env, finalize_data: ?*anyopaque, _: ?*anyopaque) callconv(.C) void {
    if (finalize_data) |ptr| {
        const db_ptr = @as(*lmdb.Database, @ptrCast(@alignCast(ptr)));
        allocator.destroy(db_ptr);
    }
}

pub fn get(env: c.napi_env, this: c.napi_value, args: *const [1]c.napi_value) !c.napi_value {
    const db_ptr = try n.unwrap(lmdb.Database, &TypeTag, env, this);
    const key = try n.parseTypedArray(u8, env, args[0]);
    if (try db_ptr.get(key)) |value| {
        return n.createTypedArray(u8, env, value);
    } else {
        return n.getNull(env);
    }
}

pub fn set(env: c.napi_env, this: c.napi_value, args: *const [2]c.napi_value) !c.napi_value {
    const db_ptr = try n.unwrap(lmdb.Database, &TypeTag, env, this);
    const key = try n.parseTypedArray(u8, env, args[0]);
    const value = try n.parseTypedArray(u8, env, args[1]);

    try db_ptr.set(key, value);

    return null;
}

pub fn delete(env: c.napi_env, this: c.napi_value, args: *const [1]c.napi_value) !c.napi_value {
    const db_ptr = try n.unwrap(lmdb.Database, &TypeTag, env, this);
    const key = try n.parseTypedArray(u8, env, args[0]);

    try db_ptr.delete(key);

    return null;
}
