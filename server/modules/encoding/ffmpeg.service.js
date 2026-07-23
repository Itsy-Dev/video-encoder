const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const EventEmitter = require("events");
const { spawn, spawnSync } = require("child_process");
const { suspendProcess, resumeProcess, terminateProcess, applyProcessPriority } = require("../runtime/process-control");
const encodingProfiles = require("./encoding-profiles");
const { buildSafeScaleFilter, resolveScalePlan } = require("./scale-policy");
const { getFfmpegBin } = require("./media-binaries");

const FFMPEG_BIN = getFfmpegBin();
const STOP_GRACE_TIMEOUT_MS = 15000;
const DEFAULT_FFMPEG_RUNTIME = Object.freeze({
    PROCESS_PRIORITY: 15,
    THREADS: 1,
    FILTER_THREADS: 2
});

(function ensureFfmpeg() {
    const result = spawnSync(FFMPEG_BIN, ["-version"], { stdio: "ignore" });
    if (result.status !== 0) {
        throw new Error(`ffmpeg could not be started at '${FFMPEG_BIN}'. Set ENCODER_FFMPEG_BIN to a valid executable or reinstall the app.`);
    }
})();

module.exports = class FfmpegService {
    startEncodeFile({ inputAbsPath, outputAbsPath, profileId, sourceMetadata = null, runtimeOptions = null }) {
        if (!inputAbsPath) throw new Error("FfmpegService.startEncodeFile: inputAbsPath is required");
        if (!outputAbsPath) throw new Error("FfmpegService.startEncodeFile: outputAbsPath is required");
        const runtime = normalizeRuntimeOptions(runtimeOptions);

        return createEncodingHandle({
            command: FFMPEG_BIN,
            args: this._buildArgs(inputAbsPath, outputAbsPath, profileId, sourceMetadata, runtime),
            outputAbsPath,
            profileId: profileId || "browser_compatibility",
            processPriority: runtime.PROCESS_PRIORITY
        });
    }

    async encodeFile({ inputAbsPath, outputAbsPath, profileId, sourceMetadata = null, runtimeOptions = null }) {
        const handle = this.startEncodeFile({ inputAbsPath, outputAbsPath, profileId, sourceMetadata, runtimeOptions });
        return handle.done;
    }

    _buildArgs(inputAbsPath, _outputAbsPath, profileId, sourceMetadata = null, runtime = DEFAULT_FFMPEG_RUNTIME) {
        const profile = encodingProfiles.getProfileById(profileId) || encodingProfiles.getProfileById("browser_compatibility");
        if (!profile) {
            throw new Error(`Encoding profile not found: ${profileId}`);
        }

        return [
            "-hide_banner",
            "-y",
            "-v", "error",
            "-nostats",
            "-filter_threads", String(runtime.FILTER_THREADS),
            "-filter_complex_threads", String(runtime.FILTER_THREADS),
            "-i", inputAbsPath
        ].concat(buildProfileArgs(profile, sourceMetadata, runtime));
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
        this.stopTimer = null;
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

        suspendProcess(this.child.pid);
        this.state = "paused";
        this.emit("state", this.state);
        return true;
    }

    resume() {
        if (!this.child || this.child.exitCode != null || this.state !== "paused") {
            return false;
        }

        resumeProcess(this.child.pid);
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
        if (!requestGracefulStop(this.child)) {
            this.kill();
            return true;
        }

        this.stopTimer = setTimeout(() => {
            if (!this.child || this.child.exitCode != null) {
                return;
            }

            this.kill();
        }, STOP_GRACE_TIMEOUT_MS);

        return true;
    }

    kill() {
        if (!this.child || this.child.exitCode != null) {
            return false;
        }

        this.stopRequested = true;
        this.state = "killed";
        this.emit("state", this.state);
        clearStopTimer(this);
        terminateProcess(this.child.pid);
        return true;
    }
}

function buildProfileArgs(profile, sourceMetadata, runtime = DEFAULT_FFMPEG_RUNTIME) {
    const args = [];

    const videoCodec = profile.videoCodec && profile.videoCodec.ffmpeg ? profile.videoCodec.ffmpeg : null;
    const audioCodec = resolveAudioCodec(profile, sourceMetadata);
    const scalePlan = resolveScalePlan(profile, sourceMetadata || {});
    const videoFilter = videoCodec && videoCodec !== "copy"
        ? buildSafeScaleFilter({
            targetWidth: scalePlan.targetWidth,
            targetHeight: scalePlan.targetHeight,
            scalingAlgorithm: profile.scaling && profile.scaling.id ? profile.scaling.id : null,
            pixelFormatId: profile.pixelFormat && profile.pixelFormat.id ? profile.pixelFormat.id : null
        })
        : null;

    if (videoCodec) {
        args.push("-c:v", videoCodec);
    }

    if (videoCodec && videoCodec !== "copy") {
        args.push("-threads", String(runtime.THREADS));
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

    if (profile.x264Params && videoCodec === "libx264") {
        args.push("-x264-params", String(profile.x264Params));
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

function resolveAudioCodec(profile, sourceMetadata) {
    const requestedAudioCodec = profile.audioCodec && profile.audioCodec.ffmpeg ? profile.audioCodec.ffmpeg : null;
    if (requestedAudioCodec !== "copy") {
        return requestedAudioCodec;
    }

    const containerId = String(profile && profile.container && profile.container.id || "").toLowerCase();
    const sourceAudioCodec = String(sourceMetadata && sourceMetadata.audioCodec || "").toLowerCase();
    if (containerId !== "mp4" || !sourceAudioCodec) {
        return requestedAudioCodec;
    }

    if (["aac", "mp3"].includes(sourceAudioCodec)) {
        return requestedAudioCodec;
    }

    return "aac";
}

function normalizeRuntimeOptions(runtimeOptions = null) {
    return {
        PROCESS_PRIORITY: parseOptionalNumber(
            runtimeOptions && runtimeOptions.processPriority,
            DEFAULT_FFMPEG_RUNTIME.PROCESS_PRIORITY
        ),
        THREADS: parseOptionalNumber(
            runtimeOptions && runtimeOptions.threads,
            DEFAULT_FFMPEG_RUNTIME.THREADS
        ),
        FILTER_THREADS: parseOptionalNumber(
            runtimeOptions && runtimeOptions.filterThreads,
            DEFAULT_FFMPEG_RUNTIME.FILTER_THREADS
        )
    };
}
function createEncodingHandle({ command, args, outputAbsPath, profileId, processPriority = null }) {
    const tempOutputAbsPath = buildTempOutputAbsPath(outputAbsPath);
    fs.mkdirSync(path.dirname(outputAbsPath), { recursive: true });
    fs.rmSync(tempOutputAbsPath, { force: true, recursive: true });

    const shouldUseNice = process.platform !== "win32" && processPriority != null;
    const spawnCommand = shouldUseNice ? "nice" : command;
    const spawnArgs = shouldUseNice
        ? ["-n", String(processPriority), command].concat(args, ["-progress", "pipe:1", tempOutputAbsPath])
        : args.concat(["-progress", "pipe:1", tempOutputAbsPath]);

    const child = spawn(spawnCommand, spawnArgs, {
        stdio: ["pipe", "pipe", "pipe"]
    });

    if (process.platform === "win32" && processPriority != null) {
        try {
            applyProcessPriority(child.pid, processPriority);
        }
        catch (error) {
            console.warn(`[FFMPEG] Unable to apply Windows process priority for pid=${child.pid}: ${error.message || error}`);
        }
    }

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
                    clearStopTimer(handle);
                    if (code === 0) {
                        if (handle && handle.stopRequested) {
                            return resolve({ stdout, stderr, stopped: true });
                        }
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
                handle.state = result && result.stopped ? "stopped" : "completed";
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

function requestGracefulStop(child) {
    if (!child || !child.stdin || child.stdin.destroyed || !child.stdin.writable) {
        return false;
    }

    child.stdin.write("q\n");
    return true;
}

function clearStopTimer(handle) {
    if (!handle || !handle.stopTimer) {
        return;
    }

    clearTimeout(handle.stopTimer);
    handle.stopTimer = null;
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
