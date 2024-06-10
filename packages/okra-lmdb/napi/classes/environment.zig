const std = @import("std");
const allocator = std.heap.c_allocator;

const lmdb = @import("lmdb");

const c = @import("../c.zig");
const n = @import("../n.zig");

pub const TypeTag = c.napi_type_tag{
    .lower = 0x2B4BBF954DB84EF1,
    .upper = 0x9375612C2038DA5B,
};

pub const methods = [_]n.Method{
    n.createMethod("close", 0, close),
    n.createMethod("stat", 0, stat),
    n.createMethod("info", 0, info),
    n.createMethod("resize", 1, resize),
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

    var map_size: usize = 10_485_760;
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
    env_ptr.* = try lmdb.Environment.init(path, .{
        .map_size = map_size,
        .max_dbs = databases,
        .no_tls = true,
    });

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
    env_ptr.deinit();
    return null;
}

pub fn stat(env: c.napi_env, this: c.napi_value, _: *const [0]c.napi_value) !c.napi_value {
    const env_ptr = try n.unwrap(lmdb.Environment, &TypeTag, env, this);
    const env_stat = try env_ptr.stat();

    const result = try n.createObject(env);

    const page_size = try n.createUint32(env, env_stat.psize);
    const depth = try n.createUint32(env, env_stat.depth);
    const branch_pages = try n.createUint32(env, @intCast(env_stat.branch_pages));
    const leaf_pages = try n.createUint32(env, @intCast(env_stat.leaf_pages));
    const overflow_pages = try n.createUint32(env, @intCast(env_stat.overflow_pages));
    const entries = try n.createUint32(env, @intCast(env_stat.entries));

    try n.setProperty(env, result, try n.createString(env, "pageSize"), page_size);
    try n.setProperty(env, result, try n.createString(env, "depth"), depth);
    try n.setProperty(env, result, try n.createString(env, "branchPages"), branch_pages);
    try n.setProperty(env, result, try n.createString(env, "leafPages"), leaf_pages);
    try n.setProperty(env, result, try n.createString(env, "overflowPages"), overflow_pages);
    try n.setProperty(env, result, try n.createString(env, "entries"), entries);

    return result;
}

pub fn info(env: c.napi_env, this: c.napi_value, _: *const [0]c.napi_value) !c.napi_value {
    const env_ptr = try n.unwrap(lmdb.Environment, &TypeTag, env, this);
    const env_info = try env_ptr.info();

    const result = try n.createObject(env);

    const map_size = try n.createUint32(env, @intCast(env_info.map_size));
    const readers = try n.createUint32(env, env_info.num_readers);
    const max_readers = try n.createUint32(env, env_info.max_readers);

    try n.setProperty(env, result, try n.createString(env, "mapSize"), map_size);
    try n.setProperty(env, result, try n.createString(env, "readers"), readers);
    try n.setProperty(env, result, try n.createString(env, "maxReaders"), max_readers);

    return result;
}

pub fn resize(env: c.napi_env, this: c.napi_value, args: *const [1]c.napi_value) !c.napi_value {
    const env_ptr = try n.unwrap(lmdb.Environment, &TypeTag, env, this);
    const map_size = try n.parseUint32(env, args[0]);

    try env_ptr.resize(map_size);
    return null;
}
