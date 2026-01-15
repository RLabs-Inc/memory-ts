// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "FoundationModelsTest",
    platforms: [
        .macOS(.v26)
    ],
    targets: [
        .executableTarget(
            name: "FoundationModelsTest",
            path: "Sources"
        )
    ]
)
