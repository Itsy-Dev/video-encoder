const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const EventEmitter = require("events");
const { spawn, spawnSync } = require("child_process");
const encodingProfiles = require("./encoding-profiles");
const { buildSafeScaleFilter } = require("./scale-policy");

const FFMPEG_BIN = process.env.ENCODER_FFMPEG_BIN || "ffmpeg";
const ENCODER_FFMPEG_SAFETY = Object.freeze({
    PROCESS_PRIORITY: parseOptionalNumber(process.env.ENCODER_CPU_NICE, 15),
    THREADS: parseOptionalNumber(process.env.ENCODER_THREADS, 1),
    FILTER_THREADS: parseOptionalNumber(process.env.ENCODER_FILTER_THREADS, 2)
});

(function ensureFfmpeg() {
    const result = spawnSync(FFMPEG_BIN, ["-version"], { stdio: "ignore" });
    if (result.status !== 0) {
        throw new Error(`ffmpeg not found at '${FFMPEG_BIN}'. Install ffmpeg or set ENCODER_FFMPEG_BIN.`);
    }
})();

module.exports = class FfmpegService {
    startEncodeFile({ inputAbsPath, outputAbsPath, profileId }) {
        if (!inputAbsPath) throw new Error("FfmpegService.startEncodeFile: inputAbsPath is required");
        if (!outputAbsPath) throw new Error("FfmpegService.startEncodeFile: outputAbsPath is required");

        return createEncodingHandle({
            command: FFMPEG_BIN,
            args: this._buildArgs(inputAbsPath, outputAbsPath, profileId),
            outputAbsPath,
            profileId: profileId || "browser_compatibility",
            processPriority: ENCODER_FFMPEG_SAFETY.PROCESS_PRIORITY
        });
    }

    async encodeFile({ inputAbsPath, outputAbsPath, profileId }) {
        const handle = this.startEncodeFile({ inputAbsPath, outputAbsPath, profileId });
        return handle.done;
    }

    _buildArgs(inputAbsPath, _outputAbsPath, profileId) {
        const profile = encodingProfiles.getProfileById(profileId) || encodingProfiles.getProfileById("browser_compatibility");
        if (!profile) {
            throw new Error(`Encoding profile not found: ${profileId}`);
        }

        return [
            "-hide_banner",
            "-y",
            "-v", "error",
            "-nostats",
            "-filter_threads", String(ENCODER_FFMPEG_SAFETY.FILTER_THREADS),
            "-filter_complex_threads", String(ENCODER_FFMPEG_SAFETY.FILTER_THREADS),
            "-i", inputAbsPath
        ].concat(buildProfileArgs(profile));
    }
};

class EncodingProcessHandle extends EventEmitter {
    constructor({ child, done, outputAbsPath, tempOutputAbsPath, profileId }) {
        super();
        this.child = child;
        this.done = done;
        this.outputAbsPath = outputAbsPath;
        this.tempOutputAbsPath = tempOutputAbsPath;
        this.profileId = profileId;
        this.state = "running";
        this.stopRequested = false;
        this.progress = {
            frame: null,
            fps: null,
            bitrateKbps: null,
            totalSizeBytes: null,
            outTimeMs: null,
            speed: null,
            progress: "continue"
        };
    }

    attachProgress(chunk) {
        const nextProgress = parseProgressChunk(chunk, this.progress);
        this.progress = nextProgress;
        this.emit("progress", nextProgress);
    }

    getProgress() {
        return {
            state: this.state,
            stopRequested: this.stopRequested,
            ...this.progress
        };
    }

    pause() {
        if (!this.child || this.child.exitCode != null || this.state === "paused") {
            return false;
        }

        process.kill(this.child.pid, "SIGSTOP");
        this.state = "paused";
        this.emit("state", this.state);
        return true;
    }

    resume() {
        if (!this.child || this.child.exitCode != null || this.state !== "paused") {
            return false;
        }

        process.kill(this.child.pid, "SIGCONT");
        this.state = "running";
        this.emit("state", this.state);
        return true;
    }

    stop() {
        if (!this.child || this.child.exitCode != null) {
            return false;
        }

        this.stopRequested = true;
        if (this.state === "paused") {
            this.resume();
        }
        this.state = "stopping";
        this.emit("state", this.state);
        this.child.kill("SIGTERM");
        return true;
    }

    kill() {
        if (!this.child || this.child.exitCode != null) {
            return false;
        }

        this.stopRequested = true;
        this.state = "killed";
        this.emit("state", this.state);
        this.child.kill("SIGKILL");
        return true;
    }
}

function buildProfileArgs(profile) {
    const args = [];

    const videoCodec = profile.videoCodec && profile.videoCodec.ffmpeg ? profile.videoCodec.ffmpeg : null;
    const audioCodec = profile.audioCodec && profile.audioCodec.ffmpeg ? profile.audioCodec.ffmpeg : null;
    const videoFilter = videoCodec && videoCodec !== "copy"
        ? buildSafeScaleFilter({
            targetWidth: profile && profile.resolution ? profile.resolution.width : null,
            targetHeight: profile && profile.resolution ? profile.resolution.height : null,
            scalingAlgorithm: profile.scaling && profile.scaling.id ? profile.scaling.id : null,
            pixelFormatId: profile.pixelFormat && profile.pixelFormat.id ? profile.pixelFormat.id : null
        })
        : null;

    if (videoCodec) {
        args.push("-c:v", videoCodec);
    }

    if (videoCodec && videoCodec !== "copy") {
        args.push("-threads", String(ENCODER_FFMPEG_SAFETY.THREADS));
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

    if (videoFilter) {
        args.push(
            "-vf",
            videoFilter
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
function createEncodingHandle({ command, args, outputAbsPath, profileId, processPriority = null }) {
    const tempOutputAbsPath = buildTempOutputAbsPath(outputAbsPath);
    fs.mkdirSync(path.dirname(outputAbsPath), { recursive: true });
    fs.rmSync(tempOutputAbsPath, { force: true, recursive: true });

    const spawnCommand = processPriority != null ? "nice" : command;
    const spawnArgs = processPriority != null
        ? ["-n", String(processPriority), command].concat(args, ["-progress", "pipe:1", tempOutputAbsPath])
        : args.concat(["-progress", "pipe:1", tempOutputAbsPath]);

    const child = spawn(spawnCommand, spawnArgs, {
        stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let handle = null;

    const done = (async function run() {
        try {
            const result = await new Promise((resolve, reject) => {
                child.stdout.on("data", chunk => {
                    const text = chunk.toString("utf8");
                    stdout += text;
                    if (handle) {
                        handle.attachProgress(text);
                    }
                });

                child.stderr.on("data", chunk => {
                    stderr += chunk.toString("utf8");
                });

                child.on("error", reject);

                child.on("close", code => {
                    if (code === 0) {
                        return resolve({ stdout, stderr });
                    }

                    const stopRequested = Boolean(handle && handle.stopRequested);
                    if (stopRequested) {
                        const error = new Error("ffmpeg stopped before completion");
                        error.code = "ENCODE_STOPPED";
                        return reject(error);
                    }

                    reject(new Error(`ffmpeg failed code ${code}: ${stderr || stdout}`));
                });
            });

            await removeIfExists(outputAbsPath);
            await fsp.rename(tempOutputAbsPath, outputAbsPath);
            if (handle) {
                handle.state = "completed";
                handle.emit("state", handle.state);
            }
            return {
                ...result,
                outputAbsPath,
                profileId
            };
        }
        catch (error) {
            await removeIfExists(tempOutputAbsPath);
            if (handle && handle.state !== "killed") {
                handle.state = handle.stopRequested ? "stopped" : "failed";
                handle.emit("state", handle.state);
            }
            throw error;
        }
    })();

    handle = new EncodingProcessHandle({
        child,
        done,
        outputAbsPath,
        tempOutputAbsPath,
        profileId
    });

    return handle;
}

function parseOptionalNumber(value, fallback) {
    if (value == null || value === "") {
        return fallback;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function buildTempOutputAbsPath(outputAbsPath) {
    const ext = path.extname(outputAbsPath || "");
    if (!ext) {
        return `${outputAbsPath}.tmp`;
    }

    const base = outputAbsPath.slice(0, -ext.length);
    return `${base}.tmp${ext}`;
}

function parseProgressChunk(chunk, previousProgress = {}) {
    const next = { ...previousProgress };
    const lines = String(chunk || "").split(/\r?\n/);

    for (const line of lines) {
        if (!line || !line.includes("=")) continue;
        const separatorIndex = line.indexOf("=");
        const key = line.slice(0, separatorIndex).trim();
        const value = line.slice(separatorIndex + 1).trim();

        if (key === "frame") next.frame = parseNullableNumber(value);
        if (key === "fps") next.fps = parseNullableNumber(value);
        if (key === "bitrate") next.bitrateKbps = parseBitrateKbps(value);
        if (key === "total_size") next.totalSizeBytes = parseNullableNumber(value);
        if (key === "out_time_ms") next.outTimeMs = parseOutTimeMs(value);
        if (key === "speed") next.speed = value || null;
        if (key === "progress") next.progress = value || null;
    }

    return next;
}

function parseNullableNumber(value) {
    if (value == null || value === "" || value === "N/A") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function parseBitrateKbps(value) {
    if (!value || value === "N/A") return null;
    const match = String(value).match(/^([0-9]+(?:\.[0-9]+)?)kbits\/s$/i);
    if (!match) return null;
    return Number(match[1]);
}

function parseOutTimeMs(value) {
    const number = parseNullableNumber(value);
    return number == null ? null : Math.round(number / 1000);
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
