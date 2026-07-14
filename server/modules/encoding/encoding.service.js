const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");

const profiles = require("./encoding-profiles");
const EncodingRepository = require("./encoding.repository");
const FfmpegService = require("./ffmpeg.service");
const FfprobeService = require("./ffprobe.service");
const { getEncoderPaths } = require("../filesystem/handoff-paths");

const PENDING_STATES = new Set(["pending"]);
const ACTIONABLE_STATES = new Set(["pending", "rejected", "failed", "cancelled"]);
const REVIEW_STATES = new Set(["review"]);
const HISTORY_STATES = new Set(["approved", "rejected", "failed", "exported", "cancelled", "discarded"]);
const DISCARDABLE_STATES = new Set(["pending", "queued", "rejected", "failed", "cancelled"]);
const VIDEO_EXTENSIONS = new Set([
    ".avi",
    ".flv",
    ".m4v",
    ".mkv",
    ".mov",
    ".mp4",
    ".mpeg",
    ".mpg",
    ".ts",
    ".webm",
    ".wmv"
]);
const STABILITY_WINDOW_MS = Number(process.env.ENCODER_INBOX_STABILITY_WINDOW_MS || 30000);
const SIZE_RECHECK_DELAY_MS = Number(process.env.ENCODER_INBOX_RECHECK_DELAY_MS || 1500);
const INBOX_SCAN_INTERVAL_MS = Number(process.env.ENCODER_INBOX_SCAN_INTERVAL_MS || 30000);
const ENCODING_JOB_SAFETY = Object.freeze({
    POST_ITEM_COOLDOWN_MS: Number(process.env.ENCODER_POST_ITEM_COOLDOWN_MS || 20 * 60 * 1000),
    CONTINUOUS_RUN_LIMIT_MS: Number(process.env.ENCODER_CONTINUOUS_RUN_LIMIT_MS || 20 * 60 * 1000),
    PROCESS_REST_MS: Number(process.env.ENCODER_PROCESS_REST_MS || 5 * 60 * 1000),
    MONITOR_INTERVAL_MS: Number(process.env.ENCODER_MONITOR_INTERVAL_MS || 30 * 1000)
});

module.exports = class EncodingService {
    constructor(database) {
        this.repository = new EncodingRepository(database);
        this.ffmpegService = new FfmpegService();
        this.ffprobeService = new FfprobeService();
        this.activeHandle = null;
        this.activeItemId = null;
        this.activeProgress = null;
        this.activeStartedAt = null;
        this.activeRunStartedAt = null;
        this.workerPromise = null;
        this.scanTimer = null;
        this.scanLoopRunning = false;
        this.safety = {
            cooldownUntil: null,
            cooldownReason: null,
            coolingDown: false,
            restUntil: null,
            restReason: null,
            resting: false,
            lastItemFinishedAt: null,
            config: ENCODING_JOB_SAFETY
        };
        this.ready = this._initialize();
    }

    async getDashboardState() {
        await this.ready;
        const items = await this.repository.list();

        return {
            items,
            pendingItems: items.filter(item => PENDING_STATES.has(item.status)),
            actionableItems: items.filter(item => ACTIONABLE_STATES.has(item.status)),
            reviewItems: items.filter(item => REVIEW_STATES.has(item.status)),
            historyItems: items.filter(item => HISTORY_STATES.has(item.status)),
            profiles,
            worker: this.getWorkerStatus(),
            counts: {
                pending: items.filter(item => PENDING_STATES.has(item.status)).length,
                queued: items.filter(item => ["queued"].includes(item.status)).length,
                encoding: items.filter(item => ["encoding", "paused"].includes(item.status)).length,
                review: items.filter(item => REVIEW_STATES.has(item.status)).length,
                approved: items.filter(item => ["approved", "exported"].includes(item.status)).length
            }
        };
    }

    async getItem(id) {
        await this.ready;
        return this._requireItem(id);
    }

    async scanInbox() {
        await this.ready;
        return this._scanInboxInternal();
    }

    async _scanInboxInternal() {
        const paths = getEncoderPaths();
        await this._ensureManagedDirectories(paths);
        const inboxFiles = await this._findInboxVideoFiles(paths.inbox);
        console.log(`[encoder] Scan started. inbox=${paths.inbox} files=${inboxFiles.length}`);
        const results = {
            discovered: 0,
            duplicates: 0,
            invalid: 0,
            ingested: 0,
            unstable: 0,
            files: inboxFiles.length
        };

        for (const inboxInputAbsPath of inboxFiles) {
            try {
                this._assertWithinRoot(inboxInputAbsPath, paths.inbox, "Input file must be inside the encoder inbox");

                const inboxRelativeDir = getInboxRelativeDir(inboxInputAbsPath, paths.inbox);
                const inboxRelativePath = getInboxRelativePath(inboxInputAbsPath, paths.inbox);

                const isStable = await this._isStableInboxFile(inboxInputAbsPath);
                if (!isStable) {
                    results.unstable += 1;
                    continue;
                }

                const itemId = buildItemId(inboxRelativePath);
                const existing = await this.repository.get(itemId);
                if (existing) {
                    results.duplicates += 1;
                    continue;
                }

                const item = await this._ingestDiscoveredItem({
                    inboxInputAbsPath,
                    inboxRelativeDir,
                    inboxRelativePath,
                    itemId,
                    paths
                });
                if (item) results.discovered += 1;
                if (item && item.managedInputAbsPath) results.ingested += 1;
            }
            catch (_error) {
                results.invalid += 1;
            }
        }

        console.log("[encoder] Scan finished.", results);
        return results;
    }

    async queueItem(id, { profileId, inboxRelativeDir } = {}) {
        await this.ready;
        const item = await this._requireItem(id);
        const selectedProfileId = profiles.some(profile => profile.id === profileId)
            ? profileId
            : (item.requestedProfileId || "browser_compatibility");

        const queued = await this.repository.upsert({
            ...item,
            profileId: selectedProfileId,
            inboxRelativeDir: normalizeRelativeDir(inboxRelativeDir, item.inboxRelativeDir),
            status: "queued",
            queuedAt: new Date().toISOString(),
            pausedAt: null,
            completedAt: null,
            approvedAt: null,
            rejectedAt: null,
            outboxOutputAbsPath: null,
            lastError: null,
            outputFilename: buildOutputFilename(item.originalFilename, selectedProfileId)
        });
        console.log(`[encoder] Item queued. id=${queued.id} profile=${selectedProfileId} inboxDir=${queued.inboxRelativeDir || "/"}`);
        this._ensureWorkerRunning();
        return queued;
    }

    async completeItem(id, { reviewer } = {}) {
        await this.ready;
        const item = await this._requireItem(id);
        if (item.status === "review" || item.status === "encoding" || item.status === "paused") {
            return item;
        }

        return this.queueItem(id, {
            profileId: item.profileId || item.requestedProfileId || "browser_compatibility",
            inboxRelativeDir: item.inboxRelativeDir
        });
    }

    async approveItem(id, { reviewer } = {}) {
        await this.ready;
        const item = await this._requireItem(id);
        const paths = getEncoderPaths();
        await this._ensureManagedDirectories(paths);

        if (!item.encodedOutputAbsPath) {
            const error = new Error("No encoded output is available to export.");
            error.statusCode = 400;
            throw error;
        }

        const outboxDirAbs = path.join(paths.outbox, normalizeRelativeDir(item.inboxRelativeDir));
        const outboxOutputAbsPath = path.join(outboxDirAbs, item.outputFilename || path.basename(item.encodedOutputAbsPath));

        await fsp.mkdir(outboxDirAbs, { recursive: true });
        await moveFileIntoPlace(item.encodedOutputAbsPath, outboxOutputAbsPath);

        const exported = await this.repository.upsert({
            ...item,
            status: "exported",
            approvedAt: new Date().toISOString(),
            outboxOutputAbsPath
        });

        await this._cleanupItemFiles(exported, paths);
        console.log(`[encoder] Item approved and exported. id=${exported.id} outbox=${outboxOutputAbsPath}`);
        return exported;
    }

    async rejectItem(id, { reviewer, notes } = {}) {
        await this.ready;
        const item = await this._requireItem(id);
        await this._cleanupEncodedFiles(item);

        const rejected = await this.repository.upsert({
            ...item,
            status: "rejected",
            encodedOutputAbsPath: null,
            completedAt: null,
            lastError: notes || `Rejected by ${reviewer || "operator"}`,
            rejectedAt: new Date().toISOString()
        });
        console.log(`[encoder] Item rejected. id=${rejected.id}`);
        return rejected;
    }

    async discardItem(id, { reviewer } = {}) {
        await this.ready;
        const item = await this._requireItem(id);
        const paths = getEncoderPaths();
        await this._ensureManagedDirectories(paths);

        if (!DISCARDABLE_STATES.has(item.status)) {
            const error = new Error(getDiscardBlockedMessage(item.status));
            error.statusCode = 409;
            throw error;
        }

        const discardedDirAbs = path.join(
            paths.outbox,
            "_sources",
            "discarded",
            normalizeRelativeDir(item.inboxRelativeDir)
        );
        const discardedSourceAbsPath = path.join(discardedDirAbs, item.originalFilename);

        await fsp.mkdir(discardedDirAbs, { recursive: true });
        await moveFileIntoPlace(item.inputAbsPath, discardedSourceAbsPath);
        await this._cleanupEncodedFiles(item, paths);
        await removeIfExists(getPendingItemRoot(paths, item.id));

        const discarded = await this.repository.upsert({
            ...item,
            status: "discarded",
            inputAbsPath: discardedSourceAbsPath,
            encodedOutputAbsPath: null,
            outboxOutputAbsPath: discardedSourceAbsPath,
            queuedAt: null,
            encodingStartedAt: null,
            pausedAt: null,
            completedAt: null,
            approvedAt: null,
            rejectedAt: null,
            lastError: `Discarded by ${reviewer || "operator"}`,
            sourceMetadata: item.sourceMetadata ? {
                ...item.sourceMetadata,
                absPath: discardedSourceAbsPath
            } : null
        });

        console.log(`[encoder] Item discarded. id=${discarded.id} destination=${discardedSourceAbsPath}`);
        return discarded;
    }

    getWorkerStatus() {
        const now = Date.now();
        return {
            activeItemId: this.activeItemId,
            activeStartedAt: this.activeStartedAt,
            activeProgress: this.activeProgress,
            isRunning: Boolean(this.workerPromise),
            isActive: Boolean(this.activeHandle),
            safety: {
                ...this.safety,
                cooldownRemainingMs: this.safety.cooldownUntil
                    ? Math.max(0, new Date(this.safety.cooldownUntil).getTime() - now)
                    : 0,
                restRemainingMs: this.safety.restUntil
                    ? Math.max(0, new Date(this.safety.restUntil).getTime() - now)
                    : 0
            }
        };
    }

    async pauseActive(reason = "manual") {
        await this.ready;
        if (!this.activeHandle || !this.activeItemId) return false;

        const paused = this.activeHandle.pause();
        if (!paused) return false;

        const item = await this._requireItem(this.activeItemId);
        await this.repository.upsert({
            ...item,
            status: "paused",
            pausedAt: new Date().toISOString()
        });

        this.safety.resting = reason !== "manual";
        this.safety.restReason = reason;
        console.log(`[encoder] Active item paused. id=${item.id} reason=${reason}`);
        return true;
    }

    async resumeActive() {
        await this.ready;
        if (!this.activeHandle || !this.activeItemId) return false;

        const resumed = this.activeHandle.resume();
        if (!resumed) return false;

        const item = await this._requireItem(this.activeItemId);
        await this.repository.upsert({
            ...item,
            status: "encoding",
            pausedAt: null
        });

        this.activeRunStartedAt = new Date().toISOString();
        this.safety.resting = false;
        this.safety.restUntil = null;
        this.safety.restReason = null;
        console.log(`[encoder] Active item resumed. id=${item.id}`);
        return true;
    }

    async stopActive() {
        await this.ready;
        if (!this.activeHandle) return false;
        const stopped = this.activeHandle.stop();
        if (stopped && this.activeItemId) {
            console.log(`[encoder] Active item stop requested. id=${this.activeItemId}`);
        }
        return stopped;
    }

    async _initialize() {
        const paths = getEncoderPaths();
        await this._ensureManagedDirectories(paths);
        await this._cleanupTemporaryArtifacts(paths);
        await this._cleanupEmptyWorkingDirectories(paths);
        await this.repository.failInterrupted(
            "Encoding interrupted because the encoder service stopped before the job completed"
        );
        console.log("[encoder] Startup recovery completed.");

        const nextQueued = await this.repository.getNextQueued();
        if (nextQueued) {
            console.log(`[encoder] Resuming queued work on startup. nextItem=${nextQueued.id}`);
            this._ensureWorkerRunning();
        }

        this._startInboxPolling();
    }

    async wakeQueue() {
        await this.ready;
        console.log("[encoder] Manual queue wake requested.");
        this._ensureWorkerRunning();
        return this.getWorkerStatus();
    }

    _startInboxPolling() {
        if (INBOX_SCAN_INTERVAL_MS <= 0 || this.scanLoopRunning || this.scanTimer) {
            return;
        }

        const runNext = async () => {
            this.scanTimer = null;
            this.scanLoopRunning = true;

            try {
                await this._scanInboxInternal();
            }
            catch (error) {
                console.error("[encoder] Inbox polling scan failed", error);
            }
            finally {
                this.scanLoopRunning = false;
                this.scanTimer = setTimeout(runNext, INBOX_SCAN_INTERVAL_MS);
            }
        };

        runNext().catch(error => {
            console.error("[encoder] Inbox polling loop failed", error);
        });
    }

    _ensureWorkerRunning() {
        if (this.workerPromise) {
            return this.workerPromise;
        }

        this.workerPromise = (async () => {
            try {
                await this._workLoop();
            }
            finally {
                this.workerPromise = null;

                const nextQueued = await this.repository.getNextQueued();
                if (nextQueued) {
                    this._ensureWorkerRunning();
                }
            }
        })();

        return this.workerPromise;
    }

    async _workLoop() {
        while (true) {
            if (this.safety.cooldownUntil) {
                const remainingMs = new Date(this.safety.cooldownUntil).getTime() - Date.now();
                if (remainingMs > 0) {
                    await sleep(remainingMs);
                }
                this.safety.coolingDown = false;
                this.safety.cooldownUntil = null;
                this.safety.cooldownReason = null;
            }

            const item = await this.repository.getNextQueued();
            if (!item) {
                console.log("[encoder] Worker idle. No queued items remain.");
                return;
            }

            await this._processQueuedItem(item);

            const nextQueued = await this.repository.getNextQueued();
            if (nextQueued) {
                await this._cooldown("post-item");
            }
        }
    }

    async _processQueuedItem(item) {
        const paths = getEncoderPaths();
        await this._ensureManagedDirectories(paths);

        const profileId = item.profileId || item.requestedProfileId || "browser_compatibility";
        const outputFilename = item.outputFilename || buildOutputFilename(item.originalFilename, profileId);
        const workingDirAbs = getWorkingItemRoot(paths, item.id);
        const workingOutputAbsPath = path.join(workingDirAbs, outputFilename);
        const encodedDirAbs = getEncodedItemRoot(paths, item);
        const encodedOutputAbsPath = path.join(encodedDirAbs, outputFilename);
        const encodingStartedAt = new Date().toISOString();
        const nextAttemptCount = Number(item.attemptCount || 0) + 1;
        console.log(`[encoder] Worker picked up item. id=${item.id} profile=${profileId} attempt=${nextAttemptCount}`);

        await removeIfExists(workingDirAbs);
        await fsp.mkdir(encodedDirAbs, { recursive: true });
        await fsp.mkdir(workingDirAbs, { recursive: true });
        await removeIfExists(encodedOutputAbsPath);

        const encodingItem = await this.repository.upsert({
            ...item,
            profileId,
            outputFilename,
            encodedOutputAbsPath,
            status: "encoding",
            encodingStartedAt,
            pausedAt: null,
            completedAt: null,
            attemptCount: nextAttemptCount,
            lastError: null
        });

        this.activeItemId = encodingItem.id;
        this.activeStartedAt = encodingStartedAt;
        this.activeRunStartedAt = encodingStartedAt;
        this.activeProgress = null;
        this.activeHandle = this.ffmpegService.startEncodeFile({
            inputAbsPath: encodingItem.inputAbsPath,
            outputAbsPath: workingOutputAbsPath,
            profileId
        });

        this.activeHandle.on("progress", progress => {
            this.activeProgress = progress;
        });

        const restLoop = this._runRestLoop(encodingItem.id, this.activeHandle).catch(error => {
            console.error("[encoder] Rest loop failed", error);
        });

        try {
            await this.activeHandle.done;
            await restLoop;
            await moveFileIntoPlace(workingOutputAbsPath, encodedOutputAbsPath);

            const encodedStat = await fsp.stat(encodedOutputAbsPath);
            const encodedMetadata = await this.ffprobeService.probeFile(encodedOutputAbsPath, encodedStat);

            await this.repository.upsert({
                ...encodingItem,
                profileId,
                outputFilename,
                encodedOutputAbsPath,
                status: "review",
                encodingStartedAt,
                pausedAt: null,
                completedAt: new Date().toISOString(),
                attemptCount: nextAttemptCount,
                encodedMetadata
            });

            this.safety.lastItemFinishedAt = new Date().toISOString();
            console.log(`[encoder] Worker completed item. id=${encodingItem.id} encoded=${encodedOutputAbsPath}`);
        }
        catch (error) {
            const latest = await this._requireItem(encodingItem.id);
            const stopped = error && error.code === "ENCODE_STOPPED";
            await this._cleanupEncodedFiles(latest);
            await this.repository.upsert({
                ...latest,
                profileId,
                outputFilename,
                encodedOutputAbsPath: null,
                status: stopped ? "cancelled" : "failed",
                pausedAt: null,
                completedAt: null,
                attemptCount: nextAttemptCount,
                lastError: error.message
            });
            console.error(`[encoder] Worker failed item. id=${encodingItem.id} stopped=${Boolean(stopped)}`, error);
        }
        finally {
            this.activeHandle = null;
            this.activeItemId = null;
            this.activeProgress = null;
            this.activeStartedAt = null;
            this.activeRunStartedAt = null;
            this.safety.resting = false;
            this.safety.restUntil = null;
            this.safety.restReason = null;
            await removeIfExists(workingDirAbs);
        }
    }

    async _runRestLoop(itemId, handle) {
        while (this.activeHandle === handle && handle.child && handle.child.exitCode == null) {
            await sleep(ENCODING_JOB_SAFETY.MONITOR_INTERVAL_MS);

            if (this.activeHandle !== handle || !this.activeRunStartedAt || handle.state !== "running") {
                continue;
            }

            const continuousMs = Date.now() - new Date(this.activeRunStartedAt).getTime();
            if (continuousMs < ENCODING_JOB_SAFETY.CONTINUOUS_RUN_LIMIT_MS) {
                continue;
            }

            const paused = await this.pauseActive("rest-cycle");
            if (!paused) {
                continue;
            }

            this.safety.resting = true;
            this.safety.restReason = "rest-cycle";
            this.safety.restUntil = new Date(Date.now() + ENCODING_JOB_SAFETY.PROCESS_REST_MS).toISOString();

            await sleep(ENCODING_JOB_SAFETY.PROCESS_REST_MS);

            if (this.activeHandle !== handle || handle.child.exitCode != null || handle.stopRequested) {
                return;
            }

            await this.resumeActive();
        }
    }

    async _cooldown(reason) {
        this.safety.coolingDown = true;
        this.safety.cooldownReason = reason;
        this.safety.cooldownUntil = new Date(Date.now() + ENCODING_JOB_SAFETY.POST_ITEM_COOLDOWN_MS).toISOString();
        console.log(`[encoder] Worker cooldown started. reason=${reason} ms=${ENCODING_JOB_SAFETY.POST_ITEM_COOLDOWN_MS}`);
        await sleep(ENCODING_JOB_SAFETY.POST_ITEM_COOLDOWN_MS);
        this.safety.coolingDown = false;
        this.safety.cooldownUntil = null;
        this.safety.cooldownReason = null;
        console.log("[encoder] Worker cooldown finished.");
    }

    async _requireItem(id) {
        const item = await this.repository.get(id);
        if (!item) {
            const error = new Error(`Encoding item not found: ${id}`);
            error.statusCode = 404;
            throw error;
        }
        return item;
    }

    async _ingestDiscoveredItem({
        inboxInputAbsPath,
        inboxRelativeDir,
        inboxRelativePath,
        itemId,
        paths
    }) {
        const inputStat = await fsp.stat(inboxInputAbsPath);
        if (!inputStat.isFile()) {
            throw new Error(`Input file missing: ${inboxInputAbsPath}`);
        }

        const pendingItemRoot = path.join(paths.pending, sanitizeSegment(itemId));
        const managedInputAbsPath = path.join(pendingItemRoot, path.basename(inboxInputAbsPath));

        await fsp.mkdir(pendingItemRoot, { recursive: true });
        await moveFileIntoPlace(inboxInputAbsPath, managedInputAbsPath);

        const item = this._buildDiscoveredItem({
            id: itemId,
            inboxRelativeDir,
            inboxRelativePath,
            inboxInputAbsPath,
            managedInputAbsPath,
            fileSizeBytes: inputStat.size
        });
        const sourceMetadata = await this.ffprobeService.probeFile(managedInputAbsPath, inputStat);
        console.log(`[encoder] Ingested inbox file. id=${itemId} source=${managedInputAbsPath}`);

        return this.repository.upsert({
            ...item,
            sourceMetadata
        });
    }

    async _cleanupItemFiles(item, paths = getEncoderPaths()) {
        const pendingItemRoot = getPendingItemRoot(paths, item.id);
        const encodedItemRoot = getEncodedItemRoot(paths, item);
        const workingItemRoot = getWorkingItemRoot(paths, item.id);

        await this._cleanupTemporaryArtifacts(paths);
        await removeIfExists(pendingItemRoot);
        await removeIfExists(encodedItemRoot);
        await removeIfExists(workingItemRoot);
    }

    async _cleanupEncodedFiles(item, paths = getEncoderPaths()) {
        const encodedItemRoot = getEncodedItemRoot(paths, item);
        const workingItemRoot = getWorkingItemRoot(paths, item.id);

        await this._cleanupTemporaryArtifacts(paths);
        await removeIfExists(encodedItemRoot);
        await removeIfExists(workingItemRoot);
    }

    async _cleanupTemporaryArtifacts(paths = getEncoderPaths()) {
        await removeTempArtifacts(paths.working);
        await removeTempArtifacts(paths.encoded);
    }

    _buildDiscoveredItem({
        id,
        inboxRelativeDir,
        inboxRelativePath,
        inboxInputAbsPath,
        managedInputAbsPath,
        fileSizeBytes
    }) {
        const now = new Date().toISOString();
        const inputAbsPath = inboxInputAbsPath;

        return {
            id,
            status: "pending",
            inboxRelativeDir,
            inboxRelativePath,
            requestedAt: now,
            requestedBy: null,
            originalFilename: path.basename(inputAbsPath),
            requestedProfileId: "browser_compatibility",
            videoUuid: null,
            entityType: "video",
            entityId: null,
            inboxInputAbsPath: inputAbsPath,
            inputAbsPath: managedInputAbsPath,
            managedInputAbsPath,
            fileSizeBytes,
            createdAt: now,
            updatedAt: now
        };
    }

    async _findInboxVideoFiles(rootAbs) {
        const files = [];
        await walk(rootAbs, function onFile(fileAbs) {
            if (!isSupportedVideoFile(fileAbs)) return;
            files.push(fileAbs);
        });
        return files;
    }

    async _ensureManagedDirectories(paths) {
        const required = [
            paths.handoffRoot,
            paths.inbox,
            paths.outbox,
            paths.internalRoot,
            paths.pending,
            paths.working,
            paths.encoded,
            paths.logs
        ];

        for (const dirAbs of required) {
            await fsp.mkdir(dirAbs, { recursive: true });
        }
    }

    async _cleanupEmptyWorkingDirectories(paths = getEncoderPaths()) {
        await pruneEmptyDirectories(paths.pending);
        await pruneEmptyDirectories(paths.working);
        await pruneEmptyDirectories(paths.encoded);
    }

    _assertWithinRoot(targetAbsPath, rootAbsPath, message) {
        const resolvedTarget = path.resolve(targetAbsPath);
        const resolvedRoot = path.resolve(rootAbsPath);
        const relative = path.relative(resolvedRoot, resolvedTarget);
        if (relative.startsWith("..") || path.isAbsolute(relative)) {
            throw new Error(message);
        }
    }

    async _isStableInboxFile(fileAbsPath) {
        const first = await fsp.stat(fileAbsPath);
        if (!first.isFile()) return false;

        const ageMs = Date.now() - first.mtimeMs;
        if (ageMs < STABILITY_WINDOW_MS) {
            return false;
        }

        await sleep(SIZE_RECHECK_DELAY_MS);

        const second = await fsp.stat(fileAbsPath);
        return second.isFile()
            && first.size === second.size
            && Math.floor(first.mtimeMs) === Math.floor(second.mtimeMs);
    }

};

async function walk(rootAbs, onFile) {
    let entries = [];
    try {
        entries = await fsp.readdir(rootAbs, { withFileTypes: true });
    }
    catch (_error) {
        return;
    }

    for (const entry of entries) {
        const abs = path.join(rootAbs, entry.name);
        if (entry.isDirectory()) {
            await walk(abs, onFile);
            continue;
        }
        if (entry.isFile()) onFile(abs);
    }
}

function buildOutputFilename(filename, profileId) {
    return String(filename || "output.mp4");
}

function sanitizeSegment(value) {
    return String(value || "item").replace(/[^a-zA-Z0-9._-]/g, "_");
}


function isSupportedVideoFile(fileAbsPath) {
    return VIDEO_EXTENSIONS.has(path.extname(String(fileAbsPath || "")).toLowerCase());
}

function getInboxRelativePath(fileAbsPath, inboxRootAbsPath) {
    const relative = path.relative(path.resolve(inboxRootAbsPath), path.resolve(fileAbsPath));
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
    return relative.split(path.sep).join("/");
}

function getInboxRelativeDir(fileAbsPath, inboxRootAbsPath) {
    const relativePath = getInboxRelativePath(fileAbsPath, inboxRootAbsPath);
    if (!relativePath) return "";
    const relativeDir = path.posix.dirname(relativePath);
    return relativeDir === "." ? "" : relativeDir;
}

function buildItemId(inboxRelativePath) {
    const normalizedPath = String(inboxRelativePath || "").trim().replace(/\\/g, "/");
    const hash = crypto.createHash("sha1").update(normalizedPath).digest("hex").slice(0, 16);
    return `enc_${hash}`;
}

function normalizeRelativeDir(value, fallback = "") {
    const next = String(value == null ? fallback : value).trim().replace(/\\/g, "/");
    if (!next || next === ".") return "";

    const cleaned = next.replace(/^\/+|\/+$/g, "");
    const parts = cleaned.split("/").filter(Boolean);
    if (parts.some(part => part === "." || part === "..")) {
        return normalizeRelativeDir(fallback, "");
    }

    return parts.join("/");
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function removeIfExists(targetAbsPath) {
    try {
        await fsp.rm(targetAbsPath, { force: true, recursive: true });
    }
    catch (_error) {
        return;
    }
}

async function moveFileIntoPlace(sourceAbsPath, destinationAbsPath) {
    await removeIfExists(destinationAbsPath);

    try {
        await fsp.rename(sourceAbsPath, destinationAbsPath);
        return;
    }
    catch (error) {
        if (!error || error.code !== "EXDEV") {
            throw error;
        }
    }

    await fsp.copyFile(sourceAbsPath, destinationAbsPath);
    await fsp.unlink(sourceAbsPath);
}

function getPendingItemRoot(paths, itemId) {
    return path.join(paths.pending, sanitizeSegment(itemId));
}

function getEncodedItemRoot(paths, item) {
    return path.join(paths.encoded, sanitizeSegment(item && item.id));
}

function getWorkingItemRoot(paths, itemId) {
    return path.join(paths.working, sanitizeSegment(itemId));
}

function getDiscardedSourceRoot(paths, item) {
    return path.join(
        paths.outbox,
        "_sources",
        "discarded",
        normalizeRelativeDir(item && item.inboxRelativeDir)
    );
}

function getDiscardBlockedMessage(status) {
    if (status === "encoding") {
        return "Item cannot be discarded while encoding.";
    }

    if (status === "paused") {
        return "Item cannot be discarded while paused. Resume or stop it first.";
    }

    if (status === "review") {
        return "Item in review must be approved or rejected instead of discarded.";
    }

    if (status === "approved" || status === "exported") {
        return "Item has already been approved/exported and can no longer be discarded.";
    }

    if (status === "discarded") {
        return "Item has already been discarded.";
    }

    return `Item with status "${status}" cannot be discarded.`;
}

async function pruneEmptyDirectories(rootAbsPath) {
    let entries = [];
    try {
        entries = await fsp.readdir(rootAbsPath, { withFileTypes: true });
    }
    catch (_error) {
        return false;
    }

    let hasContents = false;

    for (const entry of entries) {
        const entryAbsPath = path.join(rootAbsPath, entry.name);

        if (entry.isDirectory()) {
            const childHasContents = await pruneEmptyDirectories(entryAbsPath);
            if (childHasContents) {
                hasContents = true;
            }
            continue;
        }

        hasContents = true;
    }

    if (!hasContents) {
        try {
            await fsp.rmdir(rootAbsPath);
        }
        catch (_error) {
            return false;
        }
        return false;
    }

    return true;
}

async function removeTempArtifacts(rootAbsPath) {
    let entries = [];
    try {
        entries = await fsp.readdir(rootAbsPath, { withFileTypes: true });
    }
    catch (_error) {
        return;
    }

    for (const entry of entries) {
        const entryAbsPath = path.join(rootAbsPath, entry.name);

        if (entry.isDirectory()) {
            await removeTempArtifacts(entryAbsPath);
            continue;
        }

        if (entry.isFile() && isTemporaryArtifact(entry.name)) {
            await removeIfExists(entryAbsPath);
        }
    }
}

function isTemporaryArtifact(filename) {
    return /\.tmp(\.[^./]+)?$/i.test(String(filename || ""));
}
