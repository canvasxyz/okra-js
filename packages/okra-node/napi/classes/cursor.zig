const std = @import("std");
const allocator = std.heap.c_allocator;

const lmdb = @import("lmdb");

const c = @import("../c.zig");
const n = @import("../n.zig");
const utils = @import("../utils.zig");

const Transaction = @import("transaction.zig");

pub const TypeTag = c.napi_type_tag{
    .lower = 0xB157A970FCCF4AD5,
    .upper = 0x8C511AD237C64B55,
};

pub const methods = [_]n.Method{
    n.createMethod("close", 0, close),
    n.createMethod("getCurrentEntry", 0, getCurrentEntry),
    n.createMethod("getCurrentKey", 0, getCurrentKey),
    n.createMethod("getCurrentValue", 0, getCurrentValue),
    n.createMethod("setCurrentValue", 1, setCurrentValue),
    n.createMethod("deleteCurrentKey", 0, deleteCurrentKey),
    n.createMethod("goToNext", 0, goToNext),
    n.createMethod("goToPrevious", 0, goToPrevious),
    n.createMethod("goToLast", 0, goToLast),
    n.createMethod("goToFirst", 0, goToFirst),
    n.createMethod("goToKey", 1, goToKey),
    n.createMethod("seek", 1, seek),
};

pub const argc = 2;

/// `new Cursor(txn, dbi)`
pub fn create(env: c.napi_env, this: c.napi_value, args: *const [2]c.napi_value) !c.napi_value {
    const txn_ptr = try n.unwrap(lmdb.Transaction, &Transaction.TypeTag, env, args[0]);
    const dbi = try utils.parseDatabase(env, args[1], txn_ptr);

    const cursor_ptr = try allocator.create(lmdb.Cursor);
    cursor_ptr.* = try lmdb.Cursor.open(txn_ptr.*, dbi);
    try n.wrap(lmdb.Cursor, env, this, cursor_ptr, destroy, &TypeTag);

    return null;
}

pub fn destroy(_: c.napi_env, finalize_data: ?*anyopaque, _: ?*anyopaque) callconv(.C) void {
    if (finalize_data) |ptr| {
        const cursor_ptr = @as(*lmdb.Cursor, @ptrCast(@alignCast(ptr)));
        allocator.destroy(cursor_ptr);
    }
}

pub fn close(env: c.napi_env, this: c.napi_value, _: *const [0]c.napi_value) !c.napi_value {
    const cursor_ptr = try n.unwrap(lmdb.Cursor, &TypeTag, env, this);
    cursor_ptr.close();
    return null;
}

pub fn getCurrentEntry(env: c.napi_env, this: c.napi_value, _: *const [0]c.napi_value) !c.napi_value {
    const cursor_ptr = try n.unwrap(lmdb.Cursor, &TypeTag, env, this);

    const entry = try cursor_ptr.getCurrentEntry();
    const key = try n.createTypedArray(u8, env, entry.key);
    const value = try n.createTypedArray(u8, env, entry.value);
    const array = try n.createArrayWithLength(env, 2);
    try n.setElement(env, array, 0, key);
    try n.setElement(env, array, 1, value);
    return array;
}

pub fn getCurrentKey(env: c.napi_env, this: c.napi_value, _: *const [0]c.napi_value) !c.napi_value {
    const cursor_ptr = try n.unwrap(lmdb.Cursor, &TypeTag, env, this);
    const key = try cursor_ptr.getCurrentKey();
    return try n.createTypedArray(u8, env, key);
}

pub fn getCurrentValue(env: c.napi_env, this: c.napi_value, _: *const [0]c.napi_value) !c.napi_value {
    const cursor_ptr = try n.unwrap(lmdb.Cursor, &TypeTag, env, this);
    const value = try cursor_ptr.getCurrentValue();
    return try n.createTypedArray(u8, env, value);
}

pub fn setCurrentValue(env: c.napi_env, this: c.napi_value, args: *const [1]c.napi_value) !c.napi_value {
    const cursor_ptr = try n.unwrap(lmdb.Cursor, &TypeTag, env, this);
    const value = try n.parseTypedArray(u8, env, args[0]);
    try cursor_ptr.setCurrentValue(value);
    return null;
}

pub fn deleteCurrentKey(env: c.napi_env, this: c.napi_value, _: *const [0]c.napi_value) !c.napi_value {
    const cursor_ptr = try n.unwrap(lmdb.Cursor, &TypeTag, env, this);
    try cursor_ptr.deleteCurrentKey();
    return null;
}

pub fn goToNext(env: c.napi_env, this: c.napi_value, _: *const [0]c.napi_value) !c.napi_value {
    const cursor_ptr = try n.unwrap(lmdb.Cursor, &TypeTag, env, this);
    if (try cursor_ptr.goToNext()) |key| {
        return try n.createTypedArray(u8, env, key);
    } else {
        return try n.getNull(env);
    }
}

pub fn goToPrevious(env: c.napi_env, this: c.napi_value, _: *const [0]c.napi_value) !c.napi_value {
    const cursor_ptr = try n.unwrap(lmdb.Cursor, &TypeTag, env, this);
    if (try cursor_ptr.goToPrevious()) |key| {
        return try n.createTypedArray(u8, env, key);
    } else {
        return try n.getNull(env);
    }
}

pub fn goToLast(env: c.napi_env, this: c.napi_value, _: *const [0]c.napi_value) !c.napi_value {
    const cursor_ptr = try n.unwrap(lmdb.Cursor, &TypeTag, env, this);
    if (try cursor_ptr.goToLast()) |key| {
        return try n.createTypedArray(u8, env, key);
    } else {
        return try n.getNull(env);
    }
}

pub fn goToFirst(env: c.napi_env, this: c.napi_value, _: *const [0]c.napi_value) !c.napi_value {
    const cursor_ptr = try n.unwrap(lmdb.Cursor, &TypeTag, env, this);
    if (try cursor_ptr.goToFirst()) |key| {
        return try n.createTypedArray(u8, env, key);
    } else {
        return try n.getNull(env);
    }
}

pub fn goToKey(env: c.napi_env, this: c.napi_value, args: *const [1]c.napi_value) !c.napi_value {
    const cursor_ptr = try n.unwrap(lmdb.Cursor, &TypeTag, env, this);
    const key = try n.parseTypedArray(u8, env, args[0]);
    try cursor_ptr.goToKey(key);
    return null;
}

pub fn seek(env: c.napi_env, this: c.napi_value, args: *const [1]c.napi_value) !c.napi_value {
    const cursor_ptr = try n.unwrap(lmdb.Cursor, &TypeTag, env, this);
    const needle = try n.parseTypedArray(u8, env, args[0]);
    if (try cursor_ptr.seek(needle)) |key| {
        return try n.createTypedArray(u8, env, key);
    } else {
        return try n.getNull(env);
    }
}
