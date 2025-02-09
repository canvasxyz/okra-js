const std = @import("std");

pub fn build(b: *std.Build) void {
    const include = b.option([]const u8, "include", "Absolute path to NodeJS include directory") orelse
        "/usr/local/include/node";

    addTarget(b, include, "x64-linux-glibc/lmdb.node", .{ .cpu_arch = .x86_64, .os_tag = .linux, .abi = .gnu });
    addTarget(b, include, "x64-linux-musl/lmdb.node", .{ .cpu_arch = .x86_64, .os_tag = .linux, .abi = .musl });
    addTarget(b, include, "arm64-linux-glibc/lmdb.node", .{ .cpu_arch = .aarch64, .os_tag = .linux, .abi = .gnu });
    addTarget(b, include, "arm64-linux-musl/lmdb.node", .{ .cpu_arch = .aarch64, .os_tag = .linux, .abi = .musl });
    addTarget(b, include, "x64-darwin/lmdb.node", .{ .cpu_arch = .x86_64, .os_tag = .macos });
    addTarget(b, include, "arm64-darwin/lmdb.node", .{ .cpu_arch = .aarch64, .os_tag = .macos });
    // addTarget(b, "x64-win32/okra.node", .{ .cpu_arch = .x86_64, .os_tag = .windows });
}

fn addTarget(b: *std.Build, include: []const u8, name: []const u8, target: std.Target.Query) void {
    const lmdb = b.dependency("lmdb", .{});

    const lib = b.addSharedLibrary(.{
        .name = "okra-lmdb",
        .root_source_file = b.path("napi/lib.zig"),
        .target = b.resolveTargetQuery(target),
        .optimize = .ReleaseSafe,
    });

    lib.linkLibC();
    lib.linker_allow_shlib_undefined = true;

    lib.addSystemIncludePath(.{ .cwd_relative = include });
    lib.root_module.addImport("lmdb", lmdb.module("lmdb"));
    const artifact = b.addInstallArtifact(lib, .{ .dest_sub_path = name });
    b.getInstallStep().dependOn(&artifact.step);
}
