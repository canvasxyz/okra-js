const std = @import("std");
const FileSource = std.build.FileSource;
const LazyPath = std.build.LazyPath;

const lmdb_source_files = [_][]const u8{
    "libs/okra/libs/zig-lmdb/libs/openldap/libraries/liblmdb/mdb.c",
    "libs/okra/libs/zig-lmdb/libs/openldap/libraries/liblmdb/midl.c",
};

const lmdb_include_path = LazyPath{ .path = "libs/okra/libs/zig-lmdb/libs/openldap/libraries/liblmdb" };

pub fn build(b: *std.build.Builder) void {
    const target = std.build.standardTargetOptions(b, .{});
    const optimize = std.build.standardOptimizeOption(b, .{});

    const lmdb = b.anonymousDependency("libs/okra/libs/zig-lmdb/", @import("libs/okra/libs/zig-lmdb/build.zig"), .{});
    const okra = b.addModule("okra", .{
        .source_file = FileSource.relative("libs/okra/src/lib.zig"),
        .dependencies = &.{.{ .name = "lmdb", .module = lmdb.module("lmdb") }},
    });

    const okra_node = b.addStaticLibrary(.{
        .name = "okra-node",
        .root_source_file = LazyPath.relative("napi/lib.zig"),
        .target = target,
        .optimize = optimize,
    });

    okra_node.addSystemIncludePath(.{ .cwd_relative = "/usr/local/include/node" });
    okra_node.addIncludePath(lmdb_include_path);
    okra_node.addCSourceFiles(&lmdb_source_files, &.{});
    okra_node.addModule("lmdb", lmdb.module("lmdb"));
    okra_node.addModule("okra", okra);
    b.installArtifact(okra_node);
}
