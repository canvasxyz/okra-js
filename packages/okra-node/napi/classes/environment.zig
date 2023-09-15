const std = @import("std");
const allocator = std.heap.c_allocator;

const okra = @import("okra");
const lmdb = @import("lmdb");

const c = @import("../c.zig");
const n = @import("../n.zig");

pub const TypeTag = c.napi_type_tag{
    .lower = 0x2B4BBF954DB84EF1,
    .upper = 0x9375612C2038DA5B,
};

pub const methods = [_]n.Method{
    n.createMethod("close", 0, close),
};

pub const argc = 2;

/// `new Environment(path, options)`
pub fn create(env: c.napi_env, this: c.napi_value, args: *const [2]c.napi_value) !c.napi_value {
    const path_arg = args[0];
    const options_arg = args[1];

    const path = try n.parseStringAlloc(env, path_arg, allocator);
    defer allocator.free(path);

    std.fs.cwd().access(path, .{ .mode = .read_write }) catch |err| {
        switch (err) {
            error.FileNotFound => try std.fs.cwd().makeDir(path),
            else => {
                return err;
            },
        }
    };

    var map_size: usize = 10485760;
    const map_size_property = try n.createString(env, "mapSize");
    const map_size_value = try n.getProperty(env, options_arg, map_size_property);
    const map_size_value_type = try n.typeOf(env, map_size_value);
    if (map_size_value_type != c.napi_undefined) {
        map_size = try n.parseUint32(env, map_size_value);
    }

    const databases_property = try n.createString(env, "databases");
    const databases_value = try n.getProperty(env, options_arg, databases_property);
    const databases_value_type = try n.typeOf(env, databases_value);
    const databases = switch (databases_value_type) {
        c.napi_undefined => 0,
        c.napi_null => 0,
        else => try n.parseUint32(env, databases_value),
    };

    const env_ptr = try allocator.create(lmdb.Environment);
    env_ptr.* = try lmdb.Environment.open(path, .{ .map_size = map_size, .max_dbs = databases });
    try n.wrap(lmdb.Environment, env, this, env_ptr, destroy, &TypeTag);

    return null;
}

pub fn destroy(_: c.napi_env, finalize_data: ?*anyopaque, _: ?*anyopaque) callconv(.C) void {
    if (finalize_data) |ptr| {
        const env_ptr = @as(*lmdb.Environment, @ptrCast(@alignCast(ptr)));
        allocator.destroy(env_ptr);
    }
}

pub fn close(env: c.napi_env, this: c.napi_value, _: *const [0]c.napi_value) !c.napi_value {
    const env_ptr = try n.unwrap(lmdb.Environment, &TypeTag, env, this);
    env_ptr.close();
    return null;
}
