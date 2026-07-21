const { spawn, spawnSync } = require("child_process");
const { getFfprobeBin } = require("./media-binaries");

const FFPROBE_BIN = getFfprobeBin();

(function ensureFfprobe() {
    const result = spawnSync(FFPROBE_BIN, ["-version"], { stdio: "ignore" });
    if (result.status !== 0) {
        throw new Error(`ffprobe could not be started at '${FFPROBE_BIN}'. Set ENCODER_FFPROBE_BIN to a valid executable or reinstall the app.`);
    }
})();

module.exports = class FfprobeService {
    async probeFile(fileAbsPath, stat = null) {
        const probeJson = await this._ffprobeJson(fileAbsPath);
        const streams = Array.isArray(probeJson && probeJson.streams) ? probeJson.streams : [];
        const format = probeJson && probeJson.format ? probeJson.format : {};
        const videoStream = streams.find(stream => stream.codec_type === "video") || null;
        const audioStream = streams.find(stream => stream.codec_type === "audio") || null;

        return {
            absPath: fileAbsPath,
            fileSizeBytes: stat ? Number(stat.size || 0) : safeNumber(format.size),
            durationMs: durationToMs(videoStream && videoStream.duration, format && format.duration),
            container: firstFormatName(format && format.format_name),
            videoCodec: videoStream && videoStream.codec_name ? videoStream.codec_name : null,
            audioCodec: audioStream && audioStream.codec_name ? audioStream.codec_name : null,
            width: safeNumber(videoStream && videoStream.width),
            height: safeNumber(videoStream && videoStream.height),
            frameRate: parseFrameRate(videoStream && (videoStream.avg_frame_rate || videoStream.r_frame_rate)),
            bitRate: safeNumber((videoStream && videoStream.bit_rate) || (format && format.bit_rate)),
            probeJson,
            probedAt: new Date().toISOString()
        };
    }

    _ffprobeJson(fileAbsPath) {
        return new Promise((resolve, reject) => {
            const args = [
                "-v", "error",
                "-print_format", "json",
                "-show_format",
                "-show_streams",
                fileAbsPath
            ];

            const processHandle = spawn(FFPROBE_BIN, args, {
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
                if (code !== 0) {
                    return reject(new Error(`ffprobe failed code ${code}: ${stderr || stdout}`));
                }

                try {
                    resolve(JSON.parse(stdout));
                }
                catch (error) {
                    reject(new Error(`ffprobe JSON parse failed: ${error.message}`));
                }
            });
        });
    }
};

function safeNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function durationToMs(videoDuration, formatDuration) {
    const durationSec = safeNumber(videoDuration != null ? videoDuration : formatDuration);
    return durationSec == null ? null : Math.round(durationSec * 1000);
}

function parseFrameRate(value) {
    if (!value) return null;

    const text = String(value);
    if (text.includes("/")) {
        const [numerator, denominator] = text.split("/").map(Number);
        if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
        return Number((numerator / denominator).toFixed(4));
    }

    const parsed = Number(text);
    return Number.isFinite(parsed) ? Number(parsed.toFixed(4)) : null;
}

function firstFormatName(formatName) {
    if (!formatName) return null;
    return String(formatName).split(",")[0] || null;
}
