const std = @import("std");
const allocator = std.heap.c_allocator;

const lmdb = @import("lmdb");
const c = @import("./c.zig");
const n = @import("./n.zig");

const Environment = @import("classes/environment.zig");
const Transaction = @import("classes/transaction.zig");
const Database = @import("classes/database.zig");
const Cursor = @import("classes/cursor.zig");

export fn napi_register_module_v1(env: c.napi_env, exports: c.napi_value) callconv(.C) c.napi_value {
    n.defineClass("Environment", Environment.argc, Environment.create, &Environment.methods, env, exports) catch unreachable;
    n.defineClass("Transaction", Transaction.argc, Transaction.create, &Transaction.methods, env, exports) catch unreachable;
    n.defineClass("Database", Database.argc, Database.create, &Database.methods, env, exports) catch unreachable;
    n.defineClass("Cursor", Cursor.argc, Cursor.create, &Cursor.methods, env, exports) catch unreachable;
    return null;
}
