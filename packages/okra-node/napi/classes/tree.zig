const std = @import("std");
const allocator = std.heap.c_allocator;

const lmdb = @import("lmdb");
const okra = @import("okra");

const c = @import("../c.zig");
const n = @import("../n.zig");
const utils = @import("../utils.zig");

const Environment = @import("environment.zig");
const Transaction = @import("transaction.zig");

pub const TypeTag = c.napi_type_tag{
    .lower = 0x07FDF8AFA98446E9,
    .upper = 0xB24BEFAA8D5C6DF0,
};

pub const methods = [_]n.Method{
    n.createMethod("close", 0, close),

    n.createMethod("get", 1, get),
    n.createMethod("set", 2, set),
    n.createMethod("delete", 1, delete),

    n.createMethod("getRoot", 0, getRoot),
    n.createMethod("getNode", 2, getNode),
    n.createMethod("getChildren", 2, getChildren),
};

pub const argc = 2;

/// `new Tree(txn, dbi)`
pub fn create(env: c.napi_env, this: c.napi_value, args: *const [argc]c.napi_value) !c.napi_value {
    const txn_ptr = try n.unwrap(lmdb.Transaction, &Transaction.TypeTag, env, args[0]);
    const dbi = try utils.parseDatabase(env, args[1], txn_ptr.*);

    const tree_ptr = try allocator.create(okra.Tree);
    tree_ptr.* = try okra.Tree.open(allocator, txn_ptr.*, dbi, .{});

    try n.wrap(okra.Tree, env, this, tree_ptr, destroy, &TypeTag);
    return null;
}

pub fn destroy(_: c.napi_env, finalize_data: ?*anyopaque, _: ?*anyopaque) callconv(.C) void {
    if (finalize_data) |ptr| {
        const tree_ptr = @as(*okra.Tree, @ptrCast(@alignCast(ptr)));
        allocator.destroy(tree_ptr);
    }
}

pub fn close(env: c.napi_env, this: c.napi_value, _: *const [0]c.napi_value) !c.napi_value {
    const tree_ptr = try n.unwrap(okra.Tree, &TypeTag, env, this);
    tree_ptr.close();
    return null;
}

pub fn get(env: c.napi_env, this: c.napi_value, args: *const [1]c.napi_value) !c.napi_value {
    const tree_ptr = try n.unwrap(okra.Tree, &TypeTag, env, this);

    const key = try n.parseTypedArray(u8, env, args[0]);

    const value = try tree_ptr.get(key);
    if (value) |bytes| {
        return n.createTypedArray(u8, env, bytes);
    } else {
        return n.getNull(env);
    }
}

pub fn set(env: c.napi_env, this: c.napi_value, args: *const [2]c.napi_value) !c.napi_value {
    const tree_ptr = try n.unwrap(okra.Tree, &TypeTag, env, this);
    const key = try n.parseTypedArray(u8, env, args[0]);
    const value = try n.parseTypedArray(u8, env, args[1]);
    tree_ptr.set(key, value) catch |err| {
        std.log.err("ERROR: {any}", .{err});
    };

    return null;
}

pub fn delete(env: c.napi_env, this: c.napi_value, args: *const [1]c.napi_value) !c.napi_value {
    const key = try n.parseTypedArray(u8, env, args[0]);

    const tree_ptr = try n.unwrap(okra.Tree, &TypeTag, env, this);
    try tree_ptr.delete(key);

    return null;
}

pub fn getRoot(env: c.napi_env, this: c.napi_value, _: *const [0]c.napi_value) !c.napi_value {
    const tree_ptr = try n.unwrap(okra.Tree, &TypeTag, env, this);
    const root = try tree_ptr.getRoot();
    return try utils.createNode(env, root);
}

pub fn getNode(env: c.napi_env, this: c.napi_value, args: *const [2]c.napi_value) !c.napi_value {
    const tree_ptr = try n.unwrap(okra.Tree, &TypeTag, env, this);

    const level = try n.parseUint32(env, args[0]);
    if (level >= 0xFF) {
        return n.throwRangeError(env, "invalid level (expected level < 255)");
    }

    const key = try utils.parseKey(env, args[1]);

    if (try tree_ptr.getNode(@intCast(level), key)) |node| {
        return try utils.createNode(env, node);
    } else {
        return n.getNull(env);
    }
}

pub fn getChildren(env: c.napi_env, this: c.napi_value, args: *const [2]c.napi_value) !c.napi_value {
    const tree_ptr = try n.unwrap(okra.Tree, &TypeTag, env, this);
    const level = try n.parseUint32(env, args[0]);
    const key = try utils.parseKey(env, args[1]);

    if (level == 0) {
        return n.throwRangeError(env, "invalid level (expected level > 0)");
    } else if (level >= 0xFF) {
        return n.throwRangeError(env, "invalid level (expected level < 255)");
    }

    var children = try n.createArray(env);

    var first_child = try tree_ptr.cursor.goToNode(@intCast(level - 1), key);
    try n.setElement(env, children, 0, try utils.createNode(env, first_child));

    var i: u32 = 1;
    while (try tree_ptr.cursor.goToNext()) |next_child| : (i += 1) {
        if (next_child.isBoundary()) {
            break;
        } else {
            try n.setElement(env, children, i, try utils.createNode(env, next_child));
        }
    }

    return children;
}
