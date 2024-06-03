const std = @import("std");

pub fn build(b: *std.Build) void {
    addTarget(b, "x64-linux-glibc/okra.node", .{ .cpu_arch = .x86_64, .os_tag = .linux, .abi = .gnu });
    addTarget(b, "x64-linux-musl/okra.node", .{ .cpu_arch = .x86_64, .os_tag = .linux, .abi = .musl });
    addTarget(b, "arm64-linux-glibc/okra.node", .{ .cpu_arch = .aarch64, .os_tag = .linux, .abi = .gnu });
    addTarget(b, "arm64-linux-musl/okra.node", .{ .cpu_arch = .aarch64, .os_tag = .linux, .abi = .musl });
    addTarget(b, "x64-darwin/okra.node", .{ .cpu_arch = .x86_64, .os_tag = .macos });
    addTarget(b, "arm64-darwin/okra.node", .{ .cpu_arch = .aarch64, .os_tag = .macos });
    // addTarget(b, "x64-win32/okra.node", .{ .cpu_arch = .x86_64, .os_tag = .windows });
}

fn addTarget(b: *std.Build, name: []const u8, target: std.Target.Query) void {
    const lmdb = b.dependency("lmdb", .{});
    const okra = b.dependency("okra", .{});

    const okra_node = b.addSharedLibrary(.{
        .name = "okra-node",
        .root_source_file = b.path("napi/lib.zig"),
        .target = b.resolveTargetQuery(target),
        .optimize = .ReleaseSafe,
    });

    okra_node.linkLibC();
    okra_node.linker_allow_shlib_undefined = true;

    okra_node.addSystemIncludePath(.{ .cwd_relative = "/usr/local/include/node" });
    okra_node.root_module.addImport("lmdb", lmdb.module("lmdb"));
    okra_node.root_module.addImport("okra", okra.module("okra"));
    const artifact = b.addInstallArtifact(okra_node, .{ .dest_sub_path = name });
    b.getInstallStep().dependOn(&artifact.step);
}
