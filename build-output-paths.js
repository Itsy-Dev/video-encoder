const path = require("path");

const basePackage = require("./package.json");

function getVersion() {
    return String(basePackage.version || "0.0.0");
}

function getProductionCurrentOutputDir(targetPlatform = resolveBuildPlatform()) {
    return path.join("dist", "production", "current", normalizePlatformName(targetPlatform));
}

function getProductionArchiveOutputDir(targetPlatform = resolveBuildPlatform()) {
    return path.join("dist", "production", "archive", normalizePlatformName(targetPlatform), getVersion());
}

function getDevOutputDir(targetPlatform = resolveBuildPlatform()) {
    return path.join("dist", "dev", normalizePlatformName(targetPlatform));
}

function resolveBuildPlatform() {
    const lifecycleEvent = String(process.env.npm_lifecycle_event || "").toLowerCase();

    if (lifecycleEvent.includes(":win") || lifecycleEvent.endsWith("win")) {
        return "windows";
    }

    if (process.platform === "win32") {
        return "windows";
    }

    if (process.platform === "darwin") {
        return "macos";
    }

    return process.platform || "unknown";
}

function normalizePlatformName(targetPlatform) {
    const value = String(targetPlatform || "").trim().toLowerCase();

    if (value === "win32" || value === "windows") {
        return "windows";
    }

    if (value === "darwin" || value === "mac" || value === "macos") {
        return "macos";
    }

    return value || "unknown";
}

module.exports = {
    getVersion,
    getProductionCurrentOutputDir,
    getProductionArchiveOutputDir,
    getDevOutputDir,
    resolveBuildPlatform,
    normalizePlatformName
};
