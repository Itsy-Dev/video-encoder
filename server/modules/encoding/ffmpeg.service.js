const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const FFMPEG_BIN = process.env.ENCODER_FFMPEG_BIN || "ffmpeg";

(function ensureFfmpeg() {
    const result = spawnSync(FFMPEG_BIN, ["-version"], { stdio: "ignore" });
    if (result.status !== 0) {
        throw new Error(`ffmpeg not found at '${FFMPEG_BIN}'. Install ffmpeg or set ENCODER_FFMPEG_BIN.`);
    }
})();

const PROFILE_ARGS = Object.freeze({
    browser_compatibility: [
        "-c:v", "libx264",
        "-preset", "slow",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-c:a", "aac",
        "-b:a", "192k"
    ],
    hq_h264: [
        "-c:v", "libx264",
        "-preset", "slow",
        "-crf", "16",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-c:a", "aac",
        "-b:a", "192k"
    ],
    review_proxy: [
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "28",
        "-vf", "scale='min(1280,iw)':-2",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-c:a", "aac",
        "-b:a", "128k"
    ]
});

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
        const profileArgs = PROFILE_ARGS[profileId] || PROFILE_ARGS.browser_compatibility;

        return [
            "-y",
            "-v", "error",
            "-i", inputAbsPath
        ].concat(profileArgs);
    }
};

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
