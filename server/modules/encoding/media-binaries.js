const fs = require("fs");
const path = require("path");

const VENDOR_ROOT = path.resolve(__dirname, "..", "..", "..", "vendor", "ffmpeg");

function getFfmpegBin() {
    return resolveBinaryPath(process.env.ENCODER_FFMPEG_BIN, () => {
        const vendored = getVendoredBinaryPath("ffmpeg");
        if (vendored) {
            return vendored;
        }

        return require("ffmpeg-static");
    });
}

function getFfprobeBin() {
    return resolveBinaryPath(process.env.ENCODER_FFPROBE_BIN, () => {
        const vendored = getVendoredBinaryPath("ffprobe");
        if (vendored) {
            return vendored;
        }

        const ffprobeStatic = require("ffprobe-static");
        return ffprobeStatic && ffprobeStatic.path;
    });
}

function resolveBinaryPath(configuredPath, bundledPathFactory) {
    const configured = String(configuredPath || "").trim();
    if (configured) {
        return configured;
    }

    const bundledPath = bundledPathFactory();
    if (!bundledPath) {
        return null;
    }

    return useAsarUnpackedPath(String(bundledPath));
}

function useAsarUnpackedPath(binaryPath) {
    return binaryPath.includes(".asar")
        ? binaryPath.replace(".asar", ".asar.unpacked")
        : binaryPath;
}

function getVendoredBinaryPath(binaryName) {
    const filename = process.platform === "win32" ? `${binaryName}.exe` : binaryName;
    const platformDir = normalizePlatformName(process.platform);
    const packagedPath = path.join(process.resourcesPath || "", "vendor", "ffmpeg", platformDir, filename);
    const localPath = path.join(VENDOR_ROOT, platformDir, filename);

    if (isReadableFile(packagedPath)) {
        return packagedPath;
    }

    if (isReadableFile(localPath)) {
        return localPath;
    }

    return null;
}

function normalizePlatformName(platform) {
    if (platform === "win32") {
        return "windows";
    }

    if (platform === "darwin") {
        return "macos";
    }

    return String(platform || "");
}

function isReadableFile(targetPath) {
    try {
        return Boolean(targetPath) && fs.statSync(targetPath).isFile();
    }
    catch (_error) {
        return false;
    }
}

module.exports = {
    getFfmpegBin,
    getFfprobeBin,
    useAsarUnpackedPath
};
