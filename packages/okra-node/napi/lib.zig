const std = @import("std");
const allocator = std.heap.c_allocator;

const okra = @import("okra");
const lmdb = @import("lmdb");
const c = @import("./c.zig");
const n = @import("./n.zig");

const Environment = @import("classes/environment.zig");
const Transaction = @import("classes/transaction.zig");
const Database = @import("classes/database.zig");
const Cursor = @import("classes/cursor.zig");
const Tree = @import("classes/tree.zig");
const Iterator = @import("classes/iterator.zig");

export fn napi_register_module_v1(env: c.napi_env, exports: c.napi_value) callconv(.C) c.napi_value {
    n.defineClass("Environment", Environment.argc, Environment.create, &Environment.methods, env, exports) catch unreachable;
    n.defineClass("Transaction", Transaction.argc, Transaction.create, &Transaction.methods, env, exports) catch unreachable;
    n.defineClass("Database", Database.argc, Database.create, &Database.methods, env, exports) catch unreachable;
    n.defineClass("Cursor", Cursor.argc, Cursor.create, &Cursor.methods, env, exports) catch unreachable;
    n.defineClass("Tree", Tree.argc, Tree.create, &Tree.methods, env, exports) catch unreachable;
    n.defineClass("Iterator", Iterator.argc, Iterator.create, &Iterator.methods, env, exports) catch unreachable;
    return null;
}
