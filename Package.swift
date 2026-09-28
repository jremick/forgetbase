// swift-tools-version: 5.9
import PackageDescription

// Build metadata for the existing macOS Keychain helper, including CodeQL autobuild.
// The pnpm build continues to compile the same source through build-native.mjs.
let package = Package(
    name: "ForgetBaseKeychain",
    platforms: [.macOS(.v13)],
    products: [.executable(name: "forgetbase-keychain", targets: ["ForgetBaseKeychain"])],
    targets: [.executableTarget(
        name: "ForgetBaseKeychain",
        path: "packages/local-runtime/src/native",
        sources: ["keychain.swift"]
    )]
)
