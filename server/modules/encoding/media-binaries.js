function getFfmpegBin() {
    return resolveBinaryPath(process.env.ENCODER_FFMPEG_BIN, () => require("ffmpeg-static"));
}

function getFfprobeBin() {
    return resolveBinaryPath(process.env.ENCODER_FFPROBE_BIN, () => {
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

module.exports = {
    getFfmpegBin,
    getFfprobeBin,
    useAsarUnpackedPath
};
