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

    var options = lmdb.Environment.Options{ .no_tls = true };
    // map_size: usize
    // max_dbs: u32
    // max_readers: u32
    // read_only: bool
    // write_map: bool
    // no_tls: bool
    // no_lock: bool
    // mode: u16

    {
        const map_size_property = try n.createString(env, "mapSize");
        const map_size_value = try n.getProperty(env, options_arg, map_size_property);
        const map_size_value_type = try n.typeOf(env, map_size_value);
        if (map_size_value_type != c.napi_undefined) {
            options.map_size = try n.parseUint32(env, map_size_value);
        }
    }

    {
        const max_dbs_property = try n.createString(env, "maxDbs");
        const max_dbs_value = try n.getProperty(env, options_arg, max_dbs_property);
        const max_dbs_value_type = try n.typeOf(env, max_dbs_value);
        options.max_dbs = switch (max_dbs_value_type) {
            c.napi_undefined => 0,
            c.napi_null => 0,
            else => try n.parseUint32(env, max_dbs_value),
        };
    }

    {
        const max_readers_property = try n.createString(env, "maxReaders");
        const max_readers_value = try n.getProperty(env, options_arg, max_readers_property);
        const max_readers_value_type = try n.typeOf(env, max_readers_value);
        if (max_readers_value_type != c.napi_undefined) {
            options.max_readers = try n.parseUint32(env, max_readers_value);
        }
    }

    {
        const read_only_property = try n.createString(env, "readOnly");
        const read_only_value = try n.getProperty(env, options_arg, read_only_property);
        const read_only_value_type = try n.typeOf(env, read_only_value);
        if (read_only_value_type != c.napi_undefined) {
            options.read_only = try n.parseBoolean(env, read_only_value);
        }
    }

    {
        const write_map_property = try n.createString(env, "writeMap");
        const write_map_value = try n.getProperty(env, options_arg, write_map_property);
        const write_map_value_type = try n.typeOf(env, write_map_value);
        if (write_map_value_type != c.napi_undefined) {
            options.write_map = try n.parseBoolean(env, write_map_value);
        }
    }

    // {
    //     const no_tls_property = try n.createString(env, "noTls");
    //     const no_tls_value = try n.getProperty(env, options_arg, no_tls_property);
    //     const no_tls_value_type = try n.typeOf(env, no_tls_value);
    //     if (no_tls_value_type != c.napi_undefined) {
    //         options.no_tls = try n.parseBoolean(env, no_tls_value);
    //     }
    // }

    // {
    //     const no_lock_property = try n.createString(env, "noLock");
    //     const no_lock_value = try n.getProperty(env, options_arg, no_lock_property);
    //     const no_lock_value_type = try n.typeOf(env, no_lock_value);
    //     if (no_lock_value_type != c.napi_undefined) {
    //         options.no_lock = try n.parseBoolean(env, no_lock_value);
    //     }
    // }

    {
        const mode_property = try n.createString(env, "mode");
        const mode_value = try n.getProperty(env, options_arg, mode_property);
        const mode_value_type = try n.typeOf(env, mode_value);
        if (mode_value_type != c.napi_undefined) {
            const mode = try n.parseUint32(env, mode_value);
            options.mode = @truncate(mode);
        }
    }

    const env_ptr = try allocator.create(lmdb.Environment);
    env_ptr.* = try lmdb.Environment.init(path, options);

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
