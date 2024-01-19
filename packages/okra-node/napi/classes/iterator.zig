const std = @import("std");
const allocator = std.heap.c_allocator;

const lmdb = @import("lmdb");
const okra = @import("okra");

const c = @import("../c.zig");
const n = @import("../n.zig");
const utils = @import("../utils.zig");

const Tree = @import("tree.zig");

pub const TypeTag = c.napi_type_tag{
    .lower = 0xCDC2ADD450A84D10,
    .upper = 0xA0369ECDAE7CED9D,
};

pub const methods = [_]n.Method{
    n.createMethod("close", 0, close),
    n.createMethod("next", 0, next),
};

pub const argc = 5;

/// `new Iterator(tree, level, lowerBound, upperBound)`
pub fn create(env: c.napi_env, this: c.napi_value, args: *const [5]c.napi_value) !c.napi_value {
    const tree_ptr = try n.unwrap(okra.Tree, &Tree.TypeTag, env, args[0]);

    const level = try n.parseUint32(env, args[1]);
    if (level >= 0xFF) {
        return n.throwRangeError(env, "invalid level (expected level < 255)");
    }

    const lower_bound_arg = args[2];
    const lower_bound = switch (try n.typeOf(env, lower_bound_arg)) {
        c.napi_null => null,
        else => try parseBound(env, lower_bound_arg),
    };

    const upper_bound_arg = args[3];
    const upper_bound = switch (try n.typeOf(env, upper_bound_arg)) {
        c.napi_null => null,
        else => try parseBound(env, upper_bound_arg),
    };

    const reverse = try n.parseBoolean(env, args[4]);

    const iter_ptr = try allocator.create(okra.Iterator);
    iter_ptr.* = try okra.Iterator.init(allocator, tree_ptr.db, .{
        .level = @intCast(level),
        .lower_bound = lower_bound,
        .upper_bound = upper_bound,
        .reverse = reverse,
    });

    try n.wrap(okra.Iterator, env, this, iter_ptr, destroy, &TypeTag);

    return null;
}

fn parseBound(env: c.napi_env, value: c.napi_value) !okra.Iterator.Bound {
    const property_key = try n.createString(env, "key");
    const property_inclusive = try n.createString(env, "inclusive");
    const key = try n.getProperty(env, value, property_key);
    const inclusive = try n.getProperty(env, value, property_inclusive);
    return .{
        .key = try utils.parseKey(env, key),
        .inclusive = try n.parseBoolean(env, inclusive),
    };
}

pub fn destroy(_: c.napi_env, finalize_data: ?*anyopaque, _: ?*anyopaque) callconv(.C) void {
    if (finalize_data) |ptr| {
        const iter_ptr = @as(*okra.Iterator, @ptrCast(@alignCast(ptr)));
        allocator.destroy(iter_ptr);
    }
}

pub fn close(env: c.napi_env, this: c.napi_value, _: *const [0]c.napi_value) !c.napi_value {
    const iter_ptr = try n.unwrap(okra.Iterator, &TypeTag, env, this);
    iter_ptr.deinit();
    return null;
}

pub fn next(env: c.napi_env, this: c.napi_value, _: *const [0]c.napi_value) !c.napi_value {
    const iter_ptr = try n.unwrap(okra.Iterator, &TypeTag, env, this);
    if (try iter_ptr.next()) |node| {
        return try utils.createNode(env, node);
    } else {
        return n.getNull(env);
    }
}
