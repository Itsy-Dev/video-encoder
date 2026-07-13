const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const encodingProfiles = require("./encoding-profiles");

const FFMPEG_BIN = process.env.ENCODER_FFMPEG_BIN || "ffmpeg";

(function ensureFfmpeg() {
    const result = spawnSync(FFMPEG_BIN, ["-version"], { stdio: "ignore" });
    if (result.status !== 0) {
        throw new Error(`ffmpeg not found at '${FFMPEG_BIN}'. Install ffmpeg or set ENCODER_FFMPEG_BIN.`);
    }
})();

module.exports = class FfmpegService {
    async encodeFile({ inputAbsPath, outputAbsPath, profileId }) {
        if (!inputAbsPath) throw new Error("FfmpegService.encodeFile: inputAbsPath is required");
        if (!outputAbsPath) throw new Error("FfmpegService.encodeFile: outputAbsPath is required");

        const args = this._buildArgs(inputAbsPath, outputAbsPath, profileId);
        const tempOutputAbsPath = `${outputAbsPath}.tmp`;

        await fsp.mkdir(path.dirname(outputAbsPath), { recursive: true });
        await removeIfExists(tempOutputAbsPath);

        try {
            await runProcess(FFMPEG_BIN, args.concat(tempOutputAbsPath));
            await removeIfExists(outputAbsPath);
            await fsp.rename(tempOutputAbsPath, outputAbsPath);
        }
        catch (error) {
            await removeIfExists(tempOutputAbsPath);
            throw error;
        }

        return {
            outputAbsPath,
            profileId: profileId || "browser_compatibility"
        };
    }

    _buildArgs(inputAbsPath, _outputAbsPath, profileId) {
        const profile = encodingProfiles.getProfileById(profileId) || encodingProfiles.getProfileById("browser_compatibility");
        if (!profile) {
            throw new Error(`Encoding profile not found: ${profileId}`);
        }

        return [
            "-y",
            "-v", "error",
            "-i", inputAbsPath
        ].concat(buildProfileArgs(profile));
    }
};

function buildProfileArgs(profile) {
    const args = [];

    const videoCodec = profile.videoCodec && profile.videoCodec.ffmpeg ? profile.videoCodec.ffmpeg : null;
    const audioCodec = profile.audioCodec && profile.audioCodec.ffmpeg ? profile.audioCodec.ffmpeg : null;
    const shouldScale = Boolean(
        profile.resolution &&
        profile.resolution.width &&
        profile.resolution.height
    );

    if (videoCodec) {
        args.push("-c:v", videoCodec);
    }

    if (profile.preset && profile.preset.id && videoCodec && videoCodec !== "copy") {
        args.push("-preset", String(profile.preset.id));
    }

    if (profile.crf != null && videoCodec && videoCodec !== "copy") {
        args.push("-crf", String(profile.crf));
    }

    if (profile.tune && profile.tune.id && videoCodec && videoCodec !== "copy") {
        args.push("-tune", String(profile.tune.id));
    }

    if (profile.pixelFormat && profile.pixelFormat.id && videoCodec && videoCodec !== "copy") {
        args.push("-pix_fmt", String(profile.pixelFormat.id));
    }

    if (profile.profile && profile.profile.id && videoCodec === "libx264") {
        args.push("-profile:v", String(profile.profile.id));
    }

    if (profile.level && profile.level.id && videoCodec === "libx264") {
        args.push("-level:v", String(profile.level.id));
    }

    if (shouldScale) {
        args.push(
            "-vf",
            buildScaleFilter(
                Number(profile.resolution.width),
                Number(profile.resolution.height),
                profile.scaling && profile.scaling.id ? profile.scaling.id : null
            )
        );
    }

    if (audioCodec) {
        args.push("-c:a", audioCodec);
    }

    if (profile.audioBitrate && profile.audioBitrate.id != null && audioCodec !== "copy") {
        args.push("-b:a", `${Math.round(Number(profile.audioBitrate.id) / 1000)}k`);
    }

    if (profile.audioChannels && profile.audioChannels.id != null && audioCodec !== "copy") {
        args.push("-ac", String(profile.audioChannels.id));
    }

    if (profile.sampleRate && profile.sampleRate.id != null && audioCodec !== "copy") {
        args.push("-ar", String(profile.sampleRate.id));
    }

    if (profile.fastStart && profile.fastStart.id === true) {
        args.push("-movflags", "+faststart");
    }

    if (profile.metadata && profile.metadata.id === "strip") {
        args.push("-map_metadata", "-1");
    }

    if (profile.chapters && profile.chapters.id === "remove") {
        args.push("-map_chapters", "-1");
    }

    if (profile.subtitleMode && profile.subtitleMode.id === "remove") {
        args.push("-sn");
    }

    return args;
}

function buildScaleFilter(targetWidth, targetHeight, scalingAlgorithm) {
    const scaler = scalingAlgorithm || "lanczos";
    return `scale=w='min(${targetWidth},iw)':h='min(${targetHeight},ih)':force_original_aspect_ratio=decrease:flags=${scaler}`;
}

function runProcess(command, args) {
    return new Promise((resolve, reject) => {
        const processHandle = spawn(command, args, {
            stdio: ["ignore", "pipe", "pipe"]
        });

        let stdout = "";
        let stderr = "";

        processHandle.stdout.on("data", chunk => {
            stdout += chunk.toString("utf8");
        });

        processHandle.stderr.on("data", chunk => {
            stderr += chunk.toString("utf8");
        });

        processHandle.on("error", reject);

        processHandle.on("close", code => {
            if (code === 0) return resolve({ stdout, stderr });
            reject(new Error(`ffmpeg failed code ${code}: ${stderr || stdout}`));
        });
    });
}

async function removeIfExists(targetAbsPath) {
    try {
        await fsp.rm(targetAbsPath, { force: true, recursive: true });
    }
    catch (_error) {
        return;
    }
}
