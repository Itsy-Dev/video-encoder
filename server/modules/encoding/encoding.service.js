const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");

const profiles = require("./encoding-profiles");
const EncodingRepository = require("./encoding.repository");
const FfmpegService = require("./ffmpeg.service");
const FfprobeService = require("./ffprobe.service");
const {
    STRATEGY_ID: QUEUE_POSITION_STRATEGY_ID,
    applyQueuePositionStrategy,
    reorderQueueItems
} = require("./queue-ordering");
const { getEncoderPaths } = require("../filesystem/handoff-paths");
const SettingsService = require("../settings/settings.service");

const PENDING_STATES = new Set(["pending"]);
const ACTIONABLE_STATES = new Set(["pending", "rejected", "failed", "cancelled"]);
const RESETUP_SOURCE_REQUIRED_STATES = new Set(["approved"]);
const REVIEW_STATES = new Set(["review"]);
const HISTORY_STATES = new Set(["approved", "rejected", "failed", "cancelled", "discarded"]);
const DISCARDABLE_STATES = new Set(["pending", "queued", "rejected", "failed", "cancelled"]);
const UNQUEUEABLE_STATES = new Set(["queued", "failed", "cancelled", "rejected"]);
const QUEUE_RELATED_STATES = new Set(["encoding", "paused", "queued", "cancelled", "failed"]);
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
const STABILITY_WINDOW_MS = 30000;
const SIZE_RECHECK_DELAY_MS = 1500;
const DEFAULT_RUNTIME_SETTINGS = Object.freeze({
    worker: {
        continuousRunLimitMinutes: 20,
        breakDurationMinutes: 5,
        postItemCooldownMinutes: 20,
        monitorIntervalSeconds: 30,
        autoResumeAfterBreak: true,
        autoStartQueueOnLaunch: true
    },
    performance: {
        ffmpegThreads: 1,
        filterThreads: 2,
        processPriority: 15,
        defaultProfileId: "browser_compatibility"
    },
    storage: {
        inboxRoot: getEncoderPaths().inbox,
        outboxRoot: getEncoderPaths().outbox
    },
    discovery: {
        scanIntervalMinutes: 1,
        watchFolders: []
    },
    recovery: {
        requeueInterruptedItems: false,
        autoPruneEmptyDirectories: true
    }
});

module.exports = class EncodingService {
    constructor(database) {
        this.repository = new EncodingRepository(database);
        this.settingsService = new SettingsService(database);
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
        this.isShuttingDown = false;
        this.safety = {
            cooldownUntil: null,
            cooldownReason: null,
            coolingDown: false,
            restUntil: null,
            restReason: null,
            resting: false,
            pausedStartedAt: null,
            totalPausedMs: 0,
            lastItemFinishedAt: null,
            config: deriveSafetyConfig(DEFAULT_RUNTIME_SETTINGS)
        };
        this.runtimeSettings = cloneSettings(DEFAULT_RUNTIME_SETTINGS);
        this.ready = this._initialize();
    }

    async getDashboardState() {
        await this.ready;
        await this._refreshRuntimeSettings();
        const items = (await this.repository.list()).map(item => ({
            ...item,
            sourceAvailable: hasAvailableSource(item)
        }));
        const historyOutcomeItems = (await this.repository.listOutcomesWithItems()).map(item => ({
            ...item,
            sourceAvailable: hasAvailableSource(item)
        }));
        const worker = this.getWorkerStatus();
        const queuedItems = sortQueuedItems(items, worker.activeItemId);

        return {
            items,
            queuedItems,
            pendingItems: items.filter(item => PENDING_STATES.has(item.status)),
            actionableItems: items.filter(canSetupItem),
            reviewItems: items.filter(item => REVIEW_STATES.has(item.status)),
            historyItems: buildHistoryItems(historyOutcomeItems, items),
            profiles,
            queuePositionStrategy: QUEUE_POSITION_STRATEGY_ID,
            worker,
            counts: {
                pending: items.filter(canSetupItem).length,
                queued: items.filter(item => ["queued"].includes(item.status)).length,
                encoding: items.filter(item => ["encoding", "paused"].includes(item.status)).length,
                review: items.filter(item => REVIEW_STATES.has(item.status)).length,
                approved: items.filter(item => ["approved"].includes(item.status)).length
            }
        };
    }

    async getItem(id) {
        await this.ready;
        return this._requireItem(id);
    }

    async getLatestOutcome(id) {
        await this.ready;
        return this.repository.getLatestOutcomeForItem(id);
    }

    async scanInbox() {
        await this.ready;
        return this._scanInboxInternal();
    }

    async ingestUploadedFiles(files, { inboxRelativeDir = "", onProgress = null } = {}) {
        await this.ready;
        await this._refreshRuntimeSettings().catch(() => this.runtimeSettings);
        const paths = this._getEncoderPaths();
        await this._ensureManagedDirectories(paths);

        const uploads = Array.isArray(files) ? files.filter(Boolean) : [];
        const normalizedInboxRelativeDir = normalizeRelativeDir(inboxRelativeDir, "");
        const results = {
            processed: 0,
            imported: 0,
            duplicates: 0,
            invalid: 0,
            items: []
        };

        for (const file of uploads) {
            try {
                const originalFilename = String(file.originalname || path.basename(file.path || "")).trim();
                if (!originalFilename || !isSupportedVideoFile(originalFilename)) {
                    results.invalid += 1;
                    results.processed += 1;
                    emitUploadProgress(onProgress, uploads.length, results);
                    continue;
                }

                const inboxInputAbsPath = path.join(paths.inbox, normalizedInboxRelativeDir, originalFilename);
                const itemId = buildItemId(inboxInputAbsPath);
                const existing = await this.repository.getByInputAbsPath(inboxInputAbsPath);
                if (existing) {
                    results.duplicates += 1;
                    results.processed += 1;
                    emitUploadProgress(onProgress, uploads.length, results);
                    continue;
                }

                const item = await this._ingestUploadedFile({
                    uploadedFile: file,
                    itemId,
                    inboxRelativeDir: normalizedInboxRelativeDir,
                    originalFilename,
                    paths,
                    defaultProfileId: this._getDefaultProfileId(this.runtimeSettings)
                });

                if (item) {
                    results.imported += 1;
                    results.items.push(item);
                }
                results.processed += 1;
                emitUploadProgress(onProgress, uploads.length, results);
            }
            catch (_error) {
                results.invalid += 1;
                results.processed += 1;
                emitUploadProgress(onProgress, uploads.length, results);
            }
            finally {
                if (file && file.path) {
                    await removeIfExists(file.path);
                }
            }
        }

        return results;
    }

    async checkUploadedFileDuplicates(files, { inboxRelativeDir = "" } = {}) {
        await this.ready;
        await this._refreshRuntimeSettings().catch(() => this.runtimeSettings);
        const paths = this._getEncoderPaths();

        const uploads = Array.isArray(files) ? files.filter(Boolean) : [];
        const normalizedInboxRelativeDir = normalizeRelativeDir(inboxRelativeDir, "");
        const results = {
            total: uploads.length,
            duplicates: [],
            uploadable: [],
            invalid: []
        };

        for (const file of uploads) {
            const originalFilename = String(file && (file.name || file.originalname || path.basename(file.path || "")) || "").trim();
            if (!originalFilename || !isSupportedVideoFile(originalFilename)) {
                results.invalid.push(originalFilename || "(unknown)");
                continue;
            }

            const inboxInputAbsPath = path.join(paths.inbox, normalizedInboxRelativeDir, originalFilename);
            const existing = await this.repository.getByInputAbsPath(inboxInputAbsPath);

            if (existing || await pathExists(inboxInputAbsPath)) {
                results.duplicates.push(originalFilename);
                continue;
            }

            results.uploadable.push(originalFilename);
        }

        return results;
    }

    async _scanInboxInternal() {
        const settings = await this._refreshRuntimeSettings();
        const paths = this._getEncoderPaths();
        await this._ensureManagedDirectories(paths);
        const inboxRoots = this._getDiscoveryRoots(paths, settings);
        const inboxFiles = await this._findDiscoveryVideoFiles(inboxRoots);
        console.log(`[SCAN] Scan started. inbox=${paths.inbox} files=${inboxFiles.length}`);
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

                const isStable = await this._isStableInboxFile(inboxInputAbsPath);
                if (!isStable) {
                    results.unstable += 1;
                    continue;
                }

                const existing = await this.repository.getByInputAbsPath(inboxInputAbsPath);
                if (existing && !this._canReingestScannedItem(existing)) {
                    results.duplicates += 1;
                    continue;
                }
                const itemId = existing ? existing.id : buildItemId(inboxInputAbsPath);

                const item = await this._ingestDiscoveredItem({
                    inboxInputAbsPath,
                    inboxRelativeDir,
                    itemId,
                    existingItem: existing,
                    paths,
                    defaultProfileId: this._getDefaultProfileId(settings)
                });
                if (item) results.discovered += 1;
                if (item) results.ingested += 1;
            }
            catch (_error) {
                results.invalid += 1;
            }
        }

        console.log("[SCAN] Scan finished.", results);
        return results;
    }

    async queueItem(id, { profileId, inboxRelativeDir, queuePlacement = "back" } = {}) {
        await this.ready;
        const queued = await this.repository.withTransaction(async repo => {
            const item = await this._requireItemWithRepository(repo, id);
            const selectedProfileId = profiles.some(profile => profile.id === profileId)
                ? profileId
                : (item.requestedProfileId || "browser_compatibility");
            const existingQueue = await repo.listQueuedOrdered({ forUpdate: true });
            const currentIndex = existingQueue.findIndex(queueItem => queueItem.id === item.id);
            const nextQueuedAt = currentIndex >= 0
                ? item.queuedAt
                : new Date().toISOString();
            const reordered = [...existingQueue];

            if (currentIndex >= 0) {
                reordered.splice(currentIndex, 1, item);
            }
            else {
                reordered.push(item);
            }

            const placement = String(queuePlacement || "").toLowerCase() === "front"
                ? "front"
                : "back";
            const reorderedQueue = reorderQueueItems(reordered, item.id, placement);

            const normalizedQueue = applyQueuePositionStrategy(reorderedQueue);
            await repo.replaceQueuePositions(normalizedQueue);

            const queueRecord = normalizedQueue.find(queueItem => queueItem.id === item.id);

            return repo.upsert({
                ...item,
                profileId: selectedProfileId,
                inboxRelativeDir: normalizeRelativeDir(inboxRelativeDir, item.inboxRelativeDir),
                status: "queued",
                queuedAt: nextQueuedAt,
                queuePosition: queueRecord ? queueRecord.queuePosition : null,
                encodingStartedAt: null,
                pausedAt: null,
                completedAt: null,
                approvedAt: null,
                rejectedAt: null,
                lastError: null,
                outputFilename: buildOutputFilename(item.originalFilename, selectedProfileId)
            });
        });
        console.log(`[QUEUE] Item queued. id=${queued.id} profile=${queued.profileId || "browser_compatibility"} inboxDir=${queued.inboxRelativeDir || "/"} placement=${String(queuePlacement || "back").toLowerCase() === "front" ? "front" : "back"}`);
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

    async approveItem(id, { reviewer, sourceAction } = {}) {
        await this.ready;
        const item = await this._requireItem(id);
        const paths = this._getEncoderPaths();
        await this._ensureManagedDirectories(paths);
        const normalizedSourceAction = normalizeSourceAction(sourceAction);

        if (!item.outputAbsPath) {
            const error = new Error("No encoded output is available to export.");
            error.statusCode = 400;
            throw error;
        }

        if (normalizedSourceAction === "delete") {
            await removeIfExists(item.inputAbsPath);
        }

        const approved = await this.repository.upsert({
            ...item,
            status: "approved",
            approvedAt: new Date().toISOString(),
            lastError: `Approved by ${reviewer || "operator"} with source ${normalizedSourceAction}`
        });

        await this._cleanupApprovedItemFiles(approved, paths);
        console.log(`[REVIEW] Item approved. id=${approved.id} output=${item.outputAbsPath} sourceAction=${normalizedSourceAction}`);
        return approved;
    }

    async rejectItem(id, { reviewer, notes } = {}) {
        await this.ready;
        const item = await this._requireItem(id);
        const paths = this._getEncoderPaths();
        await this._ensureManagedDirectories(paths);
        const rejectedOutputAbsPath = await this._moveRejectedOutput(item, paths);

        await this._cleanupEncodedFiles(item, paths);

        const rejected = await this.repository.upsert({
            ...item,
            status: "rejected",
            outputAbsPath: rejectedOutputAbsPath || item.outputAbsPath || null,
            completedAt: null,
            lastError: notes || `Rejected by ${reviewer || "operator"}`,
            rejectedAt: new Date().toISOString()
        });
        console.log(`[REVIEW] Item rejected. id=${rejected.id} output=${rejected.outputAbsPath || "missing"}`);
        return rejected;
    }

    async discardItem(id, { reviewer } = {}) {
        await this.ready;
        const item = await this._requireItem(id);
        const paths = this._getEncoderPaths();
        await this._ensureManagedDirectories(paths);

        if (!DISCARDABLE_STATES.has(item.status)) {
            const error = new Error(getDiscardBlockedMessage(item.status));
            error.statusCode = 409;
            throw error;
        }

        await this._cleanupEncodedFiles(item, paths);

        const discarded = await this.repository.withTransaction(async repo => {
            const current = await this._requireItemWithRepository(repo, id);
            const discardedItem = await repo.upsert({
                ...current,
                status: "discarded",
                outputAbsPath: null,
                queuedAt: null,
                queuePosition: null,
                encodingStartedAt: null,
                pausedAt: null,
                completedAt: null,
                approvedAt: null,
                rejectedAt: null,
                lastError: `Discarded by ${reviewer || "operator"}`
            });

            await this._normalizeQueuedItemsWithRepository(repo);
            return discardedItem;
        });

        console.log(`[REVIEW] Item discarded. id=${discarded.id} source=${discarded.inputAbsPath || "missing"}`);
        return discarded;
    }

    async unqueueItem(id, { reviewer } = {}) {
        await this.ready;
        const item = await this._requireItem(id);

        if (!UNQUEUEABLE_STATES.has(item.status)) {
            const error = new Error(getUnqueueBlockedMessage(item.status));
            error.statusCode = 409;
            throw error;
        }

        await this._cleanupEncodedFiles(item);

        const pending = await this.repository.withTransaction(async repo => {
            const current = await this._requireItemWithRepository(repo, id);
            const pendingItem = await repo.upsert({
                ...current,
                status: "pending",
                queuedAt: null,
                queuePosition: null,
                encodingStartedAt: null,
                pausedAt: null,
                completedAt: null,
                approvedAt: null,
                rejectedAt: null,
                outputAbsPath: null,
                lastError: `Removed from queue by ${reviewer || "operator"}`
            });

            await this._normalizeQueuedItemsWithRepository(repo);
            return pendingItem;
        });

        console.log(`[QUEUE] Item removed from queue. id=${pending.id}`);
        return pending;
    }

    async moveQueueItem(id, action) {
        await this.ready;

        return this.repository.withTransaction(async repo => {
            const current = await this._requireItemWithRepository(repo, id);
            if (String(current.status || "").toLowerCase() !== "queued") {
                const error = new Error("Only queued items can be reordered.");
                error.statusCode = 409;
                throw error;
            }

            const queue = await repo.listQueuedOrdered({ forUpdate: true });
            const queueIndex = queue.findIndex(item => item.id === id);
            if (queueIndex < 0) {
                const error = new Error("Queued item was not found in the ordered queue.");
                error.statusCode = 404;
                throw error;
            }

            const reordered = reorderQueueItems(queue, id, action);
            const normalizedQueue = applyQueuePositionStrategy(reordered);
            await repo.replaceQueuePositions(normalizedQueue);
            return this._requireItemWithRepository(repo, id);
        });
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
                currentPauseMs: this.safety.pausedStartedAt
                    ? Math.max(0, now - new Date(this.safety.pausedStartedAt).getTime())
                    : 0,
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

        this.safety.pausedStartedAt = new Date().toISOString();
        this.safety.resting = reason !== "manual";
        this.safety.restReason = reason;
        console.log(`[WORKER] Active item paused. id=${item.id} reason=${reason}`);
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

        this._commitPausedDuration();
        this.activeRunStartedAt = new Date().toISOString();
        this.safety.resting = false;
        this.safety.restUntil = null;
        this.safety.restReason = null;
        console.log(`[WORKER] Active item resumed. id=${item.id}`);
        return true;
    }

    async stopActive() {
        await this.ready;
        if (!this.activeHandle) return false;
        const stopped = this.activeHandle.stop();
        if (stopped && this.activeItemId) {
            console.log(`[WORKER] Active item stop requested. id=${this.activeItemId}`);
        }
        return stopped;
    }

    async shutdown() {
        this.isShuttingDown = true;

        if (this.scanTimer) {
            clearTimeout(this.scanTimer);
            this.scanTimer = null;
        }

        if (this.activeHandle) {
            this.activeHandle.stop();
        }

        await this.ready.catch(() => {});
        await this._waitForScanLoopToFinish();
    }

    async _initialize() {
        const settings = await this._refreshRuntimeSettings();
        const paths = this._getEncoderPaths();
        await this._ensureManagedDirectories(paths);
        await this._cleanupTemporaryArtifacts(paths);
        if (settings.recovery && settings.recovery.autoPruneEmptyDirectories) {
            await this._cleanupEmptyWorkingDirectories(paths);
        }
        if (settings.recovery && settings.recovery.requeueInterruptedItems) {
            await this.repository.requeueInterrupted(
                "Encoding requeued because the encoder service stopped before the job completed"
            );
        }
        else {
            await this.repository.failInterrupted(
                "Encoding interrupted because the encoder service stopped before the job completed"
            );
        }
        await this.repository.withTransaction(async repo => {
            await this._normalizeQueuedItemsWithRepository(repo);
        });
        console.log("[RECOVERY] Startup recovery completed.");

        const nextQueued = await this.repository.getNextQueued();
        if (nextQueued && settings.worker && settings.worker.autoStartQueueOnLaunch) {
            console.log(`[RECOVERY] Resuming queued work on startup. nextItem=${nextQueued.id}`);
            this._ensureWorkerRunning();
        }

        this._startInboxPolling();
    }

    async wakeQueue() {
        await this.ready;
        const forcedCooldown = this._clearCooldownState();
        const forcedRest = this._clearRestState();
        console.log(`[QUEUE] Manual queue wake requested. forcedCooldown=${forcedCooldown} forcedRest=${forcedRest}`);
        this._ensureWorkerRunning();
        return this.getWorkerStatus();
    }

    async applyRuntimeSettings(settings = null) {
        await this.ready;
        const nextSettings = settings || await this.settingsService.getSettings();
        this.runtimeSettings = nextSettings;
        this.safety.config = deriveSafetyConfig(nextSettings);
        this._rescheduleInboxPolling(nextSettings);
        return nextSettings;
    }

    _startInboxPolling() {
        if (this.isShuttingDown) {
            return;
        }

        if (this.scanLoopRunning || this.scanTimer) {
            return;
        }

        const runNext = async () => {
            this.scanTimer = null;
            this.scanLoopRunning = true;

            try {
                await this._scanInboxInternal();
            }
            catch (error) {
                console.error("[POLLER] Inbox polling scan failed", error);
            }
            finally {
                this.scanLoopRunning = false;
                if (this.isShuttingDown) {
                    return;
                }
                const settings = await this._refreshRuntimeSettings().catch(() => this.runtimeSettings);
                this._scheduleInboxPoll(runNext, this._getScanIntervalMs(settings));
            }
        };

        runNext().catch(error => {
            console.error("[POLLER] Inbox polling loop failed", error);
        });
    }

    async _waitForScanLoopToFinish() {
        while (this.scanLoopRunning) {
            await sleep(50);
        }
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
                await this._waitForCooldownToFinish();
            }

            const item = await this._claimNextQueuedItem();
            if (!item) {
                console.log("[WORKER] Worker idle. No queued items remain.");
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
        const settings = await this._refreshRuntimeSettings();
        const paths = this._getEncoderPaths();
        await this._ensureManagedDirectories(paths);

        const profileId = item.profileId || item.requestedProfileId || "browser_compatibility";
        const outputFilename = item.outputFilename || buildOutputFilename(item.originalFilename, profileId);
        const workingDirAbs = getWorkingItemRoot(paths, item.id);
        const workingOutputAbsPath = path.join(workingDirAbs, outputFilename);
        const outboxDirAbs = path.join(paths.outbox, normalizeRelativeDir(item.inboxRelativeDir));
        const outputAbsPath = path.join(outboxDirAbs, outputFilename);
        const encodingStartedAt = new Date().toISOString();
        const nextAttemptCount = Number(item.attemptCount || 0) + 1;
        console.log(`[WORKER] Worker picked up item. id=${item.id} profile=${profileId} attempt=${nextAttemptCount}`);

        await removeIfExists(workingDirAbs);
        await fsp.mkdir(outboxDirAbs, { recursive: true });
        await fsp.mkdir(workingDirAbs, { recursive: true });

        const encodingItem = await this.repository.upsert({
            ...item,
            profileId,
            outputFilename,
            status: "encoding",
            encodingStartedAt,
            queuePosition: null,
            pausedAt: null,
            completedAt: null,
            attemptCount: nextAttemptCount,
            lastError: null
        });

        this.activeItemId = encodingItem.id;
        this.activeStartedAt = encodingStartedAt;
        this.activeRunStartedAt = encodingStartedAt;
        this.activeProgress = null;
        this.safety.pausedStartedAt = null;
        this.safety.totalPausedMs = 0;
        this.activeHandle = this.ffmpegService.startEncodeFile({
            inputAbsPath: encodingItem.inputAbsPath,
            outputAbsPath: workingOutputAbsPath,
            profileId,
            sourceMetadata: encodingItem.sourceMetadata || null,
            runtimeOptions: buildFfmpegRuntimeOptions(settings)
        });

        this.activeHandle.on("progress", progress => {
            this.activeProgress = progress;
        });

        const restLoop = this._runRestLoop(encodingItem.id, this.activeHandle).catch(error => {
            console.error("[WORKER] Rest loop failed", error);
        });

        try {
            await this.activeHandle.done;
            await restLoop;
            await moveFileIntoPlace(workingOutputAbsPath, outputAbsPath);

            const encodedStat = await fsp.stat(outputAbsPath);
            const encodedMetadata = await this.ffprobeService.probeFile(outputAbsPath, encodedStat);
            const encodingFinishedAt = new Date().toISOString();
            const pausedMs = this._getTotalPausedMs();
            const wallClockMs = calculateElapsedMs(encodingStartedAt, encodingFinishedAt);
            const activeEncodingMs = wallClockMs == null ? null : Math.max(0, wallClockMs - pausedMs);

            await this.repository.upsert({
                ...encodingItem,
                profileId,
                outputFilename,
                outputAbsPath,
                status: "review",
                encodingStartedAt,
                pausedAt: null,
                completedAt: encodingFinishedAt,
                attemptCount: nextAttemptCount,
                encodedMetadata
            });

            await this.repository.upsertOutcome(buildEncodingOutcomeReceipt({
                item: encodingItem,
                attemptNumber: nextAttemptCount,
                profileId,
                encodingStartedAt,
                encodingFinishedAt,
                activeEncodingMs,
                pausedMs,
                wallClockMs,
                sourceMetadata: encodingItem.sourceMetadata,
                outputMetadata: encodedMetadata,
                outputAbsPath
            }));

            this.safety.lastItemFinishedAt = new Date().toISOString();
            console.log(`[WORKER] Worker completed item. id=${encodingItem.id} output=${outputAbsPath}`);
        }
        catch (error) {
            const stopped = error && error.code === "ENCODE_STOPPED";
            const latest = await this._requireItem(encodingItem.id).catch(() => encodingItem);
            const lastError = formatErrorForStorage(error);

            await this._cleanupEncodedFiles(latest).catch(cleanupError => {
                console.error(`[WORKER] Failed to clean up encoded files after item failure. id=${encodingItem.id}`, cleanupError);
            });

            try {
                await this.repository.upsert({
                    ...latest,
                    profileId,
                    outputFilename,
                    status: stopped ? "cancelled" : "failed",
                    queuePosition: null,
                    pausedAt: null,
                    completedAt: null,
                    attemptCount: nextAttemptCount,
                    lastError
                });
            }
            catch (persistError) {
                console.error(`[WORKER] Failed to persist failed item state. id=${encodingItem.id}`, persistError);
                await this._persistMinimalFailureState({
                    item: latest,
                    status: stopped ? "cancelled" : "failed",
                    fallbackMessage: stopped ? "Encoding was cancelled" : "Encoding failed; see logs for details"
                });
            }

            console.error(`[WORKER] Worker failed item. id=${encodingItem.id} stopped=${Boolean(stopped)}`, error);
        }
        finally {
            this.activeHandle = null;
            this.activeItemId = null;
            this.activeProgress = null;
            this.activeStartedAt = null;
            this.activeRunStartedAt = null;
            this._commitPausedDuration();
            this.safety.pausedStartedAt = null;
            this.safety.totalPausedMs = 0;
            this.safety.resting = false;
            this.safety.restUntil = null;
            this.safety.restReason = null;
            await removeIfExists(workingDirAbs);
        }
    }

    async _persistMinimalFailureState({ item, status, fallbackMessage }) {
        try {
            await this.repository.upsert({
                ...item,
                status,
                queuePosition: null,
                pausedAt: null,
                completedAt: null,
                lastError: fallbackMessage
            });
        }
        catch (error) {
            console.error(`[WORKER] Minimal failure-state persist also failed. id=${item && item.id}`, error);
        }
    }

    async _runRestLoop(itemId, handle) {
        while (this.activeHandle === handle && handle.child && handle.child.exitCode == null) {
            const settings = await this._refreshRuntimeSettings().catch(() => this.runtimeSettings);
            const safetyConfig = deriveSafetyConfig(settings);
            await sleep(safetyConfig.MONITOR_INTERVAL_MS);

            if (this.activeHandle !== handle || !this.activeRunStartedAt || handle.state !== "running") {
                continue;
            }

            const activeRunStartedAtMs = new Date(this.activeRunStartedAt).getTime();
            if (!Number.isFinite(activeRunStartedAtMs) || activeRunStartedAtMs > Date.now()) {
                this.activeRunStartedAt = new Date().toISOString();
                continue;
            }

            const continuousMs = Date.now() - activeRunStartedAtMs;
            if (continuousMs < safetyConfig.CONTINUOUS_RUN_LIMIT_MS) {
                continue;
            }

            const paused = await this.pauseActive("rest-cycle");
            if (!paused) {
                continue;
            }

            this.safety.resting = true;
            this.safety.restReason = "rest-cycle";
            this.safety.restUntil = new Date(Date.now() + safetyConfig.PROCESS_REST_MS).toISOString();

            await this._waitForRestToFinish();

            if (this.activeHandle !== handle || handle.child.exitCode != null || handle.stopRequested) {
                return;
            }

            const latestSettings = await this._refreshRuntimeSettings().catch(() => this.runtimeSettings);
            if (latestSettings.worker && latestSettings.worker.autoResumeAfterBreak) {
                await this.resumeActive();
            }
        }
    }

    async _cooldown(reason) {
        const settings = await this._refreshRuntimeSettings().catch(() => this.runtimeSettings);
        const safetyConfig = deriveSafetyConfig(settings);
        this.safety.coolingDown = true;
        this.safety.cooldownReason = reason;
        this.safety.cooldownUntil = new Date(Date.now() + safetyConfig.POST_ITEM_COOLDOWN_MS).toISOString();
        console.log(`[WORKER] Worker cooldown started. reason=${reason} ms=${safetyConfig.POST_ITEM_COOLDOWN_MS}`);
        await this._waitForCooldownToFinish();
        console.log("[WORKER] Worker cooldown finished.");
    }

    async _waitForCooldownToFinish() {
        await this._waitForSafetyWindow("cooldownUntil");
        this._clearCooldownState();
    }

    async _waitForRestToFinish() {
        await this._waitForSafetyWindow("restUntil");
        this._clearRestState();
    }

    async _waitForSafetyWindow(key) {
        while (this.safety[key]) {
            const remainingMs = new Date(this.safety[key]).getTime() - Date.now();
            if (remainingMs <= 0) {
                return;
            }

            await sleep(Math.min(remainingMs, 1000));
        }
    }

    _clearCooldownState() {
        const hadCooldown = Boolean(this.safety.cooldownUntil || this.safety.coolingDown || this.safety.cooldownReason);
        this.safety.coolingDown = false;
        this.safety.cooldownUntil = null;
        this.safety.cooldownReason = null;
        return hadCooldown;
    }

    _clearRestState() {
        const hadRest = Boolean(this.safety.restUntil || this.safety.resting || this.safety.restReason);
        this.safety.resting = false;
        this.safety.restUntil = null;
        this.safety.restReason = null;
        return hadRest;
    }

    _commitPausedDuration() {
        if (!this.safety.pausedStartedAt) {
            return;
        }

        const pausedMs = Date.now() - new Date(this.safety.pausedStartedAt).getTime();
        if (Number.isFinite(pausedMs) && pausedMs > 0) {
            this.safety.totalPausedMs += pausedMs;
        }

        this.safety.pausedStartedAt = null;
    }

    _getTotalPausedMs() {
        let pausedMs = Number(this.safety.totalPausedMs || 0);

        if (this.safety.pausedStartedAt) {
            const currentPauseMs = Date.now() - new Date(this.safety.pausedStartedAt).getTime();
            if (Number.isFinite(currentPauseMs) && currentPauseMs > 0) {
                pausedMs += currentPauseMs;
            }
        }

        return Math.max(0, pausedMs);
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

    async _requireItemWithRepository(repository, id) {
        const item = await repository.get(id);
        if (!item) {
            const error = new Error(`Encoding item not found: ${id}`);
            error.statusCode = 404;
            throw error;
        }
        return item;
    }

    async _normalizeQueuedItemsWithRepository(repository) {
        const queuedItems = await repository.listQueuedOrdered({ forUpdate: true });
        if (!queuedItems.length) {
            return [];
        }

        const normalized = applyQueuePositionStrategy(queuedItems);
        const needsRewrite = normalized.some((item, index) => {
            const current = queuedItems[index];
            return Number(current && current.queuePosition) !== Number(item.queuePosition);
        });

        if (needsRewrite) {
            await repository.replaceQueuePositions(normalized);
        }

        return normalized;
    }

    async _claimNextQueuedItem() {
        return this.repository.withTransaction(async repo => {
            const queuedItems = await repo.listQueuedOrdered({ forUpdate: true });
            if (!queuedItems.length) {
                return null;
            }

            const normalized = applyQueuePositionStrategy(queuedItems);
            await repo.replaceQueuePositions(normalized);

            const [nextItem, ...remaining] = normalized;
            await repo.upsert({
                ...nextItem,
                status: "encoding",
                queuePosition: null,
                encodingStartedAt: new Date().toISOString(),
                pausedAt: null,
                lastError: null
            });
            await repo.replaceQueuePositions(applyQueuePositionStrategy(remaining));
            return this._requireItemWithRepository(repo, nextItem.id);
        });
    }

    async _ingestDiscoveredItem({
        inboxInputAbsPath,
        inboxRelativeDir,
        itemId,
        existingItem = null,
        paths,
        defaultProfileId
    }) {
        const inputStat = await fsp.stat(inboxInputAbsPath);
        if (!inputStat.isFile()) {
            throw new Error(`Input file missing: ${inboxInputAbsPath}`);
        }

        const item = this._buildDiscoveredItem({
            id: itemId,
            inboxRelativeDir,
            inboxInputAbsPath,
            fileSizeBytes: inputStat.size,
            defaultProfileId
        });
        const sourceMetadata = await this.ffprobeService.probeFile(inboxInputAbsPath, inputStat);
        console.log(`[SCAN] Ingested inbox file. id=${itemId} source=${inboxInputAbsPath}`);

        if (this._canReingestScannedItem(existingItem)) {
            await this.repository.deleteMetadata(itemId, "encoded");
        }

        return this.repository.upsert({
            ...item,
            sourceMetadata
        });
    }

    async _ingestUploadedFile({
        uploadedFile,
        itemId,
        inboxRelativeDir,
        originalFilename,
        paths,
        defaultProfileId
    }) {
        const uploadAbsPath = uploadedFile && uploadedFile.path ? String(uploadedFile.path) : "";
        if (!uploadAbsPath) {
            throw new Error("Uploaded file is missing a temporary path.");
        }

        const uploadStat = await fsp.stat(uploadAbsPath);
        if (!uploadStat.isFile()) {
            throw new Error(`Uploaded file missing: ${uploadAbsPath}`);
        }

        const inboxDirAbs = path.join(paths.inbox, inboxRelativeDir);
        const inboxInputAbsPath = path.join(inboxDirAbs, originalFilename);

        if (await pathExists(inboxInputAbsPath)) {
            throw new Error(`Inbox file already exists: ${inboxInputAbsPath}`);
        }

        await fsp.mkdir(inboxDirAbs, { recursive: true });
        await moveFileIntoPlace(uploadAbsPath, inboxInputAbsPath);

        const item = this._buildDiscoveredItem({
            id: itemId,
            inboxRelativeDir,
            inboxInputAbsPath,
            fileSizeBytes: uploadStat.size,
            defaultProfileId
        });
        const sourceMetadata = await this.ffprobeService.probeFile(inboxInputAbsPath, uploadStat);
        console.log(`[INTAKE] Ingested uploaded file. id=${itemId} source=${inboxInputAbsPath}`);

        return this.repository.upsert({
            ...item,
            originalFilename,
            sourceMetadata
        });
    }

    async _cleanupItemFiles(item, paths = this._getEncoderPaths()) {
        const workingItemRoot = getWorkingItemRoot(paths, item.id);

        await removeIfExists(workingItemRoot);
    }

    async _cleanupEncodedFiles(item, paths = this._getEncoderPaths()) {
        const workingItemRoot = getWorkingItemRoot(paths, item.id);

        await removeIfExists(workingItemRoot);
    }

    async _cleanupApprovedItemFiles(item, paths = this._getEncoderPaths()) {
        await this._cleanupEncodedFiles(item, paths);
    }

    async _moveRejectedOutput(item, paths = this._getEncoderPaths()) {
        if (!item || !item.outputAbsPath || !await pathExists(item.outputAbsPath)) {
            return null;
        }

        const rejectedDirAbs = path.join(paths.outbox, "rejected", normalizeRelativeDir(item.inboxRelativeDir));
        await fsp.mkdir(rejectedDirAbs, { recursive: true });

        const rejectedOutputAbsPath = await buildUniqueRejectedOutputPath(rejectedDirAbs, item.outputAbsPath);
        await moveFileIntoPlace(item.outputAbsPath, rejectedOutputAbsPath);
        return rejectedOutputAbsPath;
    }

    async _cleanupTemporaryArtifacts(paths = this._getEncoderPaths()) {
        await removeTempArtifacts(paths.working);
    }

    _buildDiscoveredItem({
        id,
        inboxRelativeDir,
        inboxInputAbsPath,
        fileSizeBytes,
        defaultProfileId = "browser_compatibility"
    }) {
        const now = new Date().toISOString();
        const inputAbsPath = inboxInputAbsPath;

        return {
            id,
            status: "pending",
            inboxRelativeDir,
            requestedAt: now,
            requestedBy: null,
            originalFilename: path.basename(inputAbsPath),
            requestedProfileId: defaultProfileId,
            videoUuid: null,
            entityType: "video",
            entityId: null,
            inputAbsPath,
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

    _canReingestScannedItem(item) {
        const status = String(item && item.status || "").toLowerCase();
        return status === "rejected" || status === "discarded";
    }

    async _findDiscoveryVideoFiles(rootAbsPaths) {
        const roots = Array.isArray(rootAbsPaths) ? rootAbsPaths : [];
        const files = [];

        for (const rootAbs of roots) {
            const nextFiles = await this._findInboxVideoFiles(rootAbs);
            files.push(...nextFiles);
        }

        return files;
    }

    async _ensureManagedDirectories(paths) {
        const required = [
            paths.handoffRoot,
            paths.inbox,
            paths.outbox,
            paths.internalRoot,
            paths.working,
            paths.uploads,
            paths.logs
        ];

        for (const dirAbs of required) {
            await fsp.mkdir(dirAbs, { recursive: true });
        }
    }

    async _cleanupEmptyWorkingDirectories(paths = this._getEncoderPaths()) {
        await pruneEmptyDirectories(paths.working);
    }

    async _refreshRuntimeSettings() {
        const settings = await this.settingsService.getSettings();
        this.runtimeSettings = settings;
        this.safety.config = deriveSafetyConfig(settings);
        return settings;
    }

    _scheduleInboxPoll(runNext, delayMs) {
        if (typeof runNext !== "function") {
            return false;
        }

        const nextDelayMs = Math.max(0, Math.round(Number(delayMs) || 0));
        if (nextDelayMs <= 0) {
            return false;
        }

        this.scanTimer = setTimeout(runNext, nextDelayMs);
        return true;
    }

    _rescheduleInboxPolling(settings = this.runtimeSettings) {
        if (this.scanLoopRunning) {
            return false;
        }

        const scanIntervalMs = this._getScanIntervalMs(settings);
        if (this.scanTimer) {
            clearTimeout(this.scanTimer);
            this.scanTimer = null;
        }

        if (scanIntervalMs <= 0) {
            return false;
        }

        const runNext = async () => {
            this.scanTimer = null;
            this.scanLoopRunning = true;

            try {
                await this._scanInboxInternal();
            }
            catch (error) {
                console.error("[POLLER] Inbox polling scan failed", error);
            }
            finally {
                this.scanLoopRunning = false;
                const latestSettings = await this._refreshRuntimeSettings().catch(() => this.runtimeSettings);
                this._scheduleInboxPoll(runNext, this._getScanIntervalMs(latestSettings));
            }
        };

        return this._scheduleInboxPoll(runNext, scanIntervalMs);
    }

    _getScanIntervalMs(settings = this.runtimeSettings) {
        return Math.max(0, Math.round(Number(settings && settings.discovery && settings.discovery.scanIntervalMinutes || 0) * 60 * 1000));
    }

    _getDefaultProfileId(settings = this.runtimeSettings) {
        const profileId = settings && settings.performance && settings.performance.defaultProfileId;
        return profiles.some(profile => profile.id === profileId) ? profileId : "browser_compatibility";
    }

    _getEncoderPaths(settings = this.runtimeSettings) {
        const storage = settings && settings.storage ? settings.storage : {};
        return getEncoderPaths({
            inbox: storage.inboxRoot,
            outbox: storage.outboxRoot
        });
    }

    _getDiscoveryRoots(paths, settings = this.runtimeSettings) {
        return [paths.inbox];
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
    const originalFilename = String(filename || "output.mp4");
    const profile = profiles.getProfileById(profileId) || profiles.getProfileById("browser_compatibility");
    const containerExtension = profile && profile.container && profile.container.extension
        ? String(profile.container.extension)
        : ".mp4";
    const sourceExtension = path.extname(originalFilename);
    const basename = sourceExtension
        ? originalFilename.slice(0, -sourceExtension.length)
        : originalFilename;

    return `${basename || "output"}${containerExtension}`;
}

function buildEncodingOutcomeReceipt({
    item,
    attemptNumber,
    profileId,
    encodingStartedAt,
    encodingFinishedAt,
    activeEncodingMs,
    pausedMs,
    wallClockMs,
    sourceMetadata,
    outputMetadata,
    outputAbsPath
}) {
    const sourceSize = Number(sourceMetadata && sourceMetadata.fileSizeBytes || 0);
    const outputSize = Number(outputMetadata && outputMetadata.fileSizeBytes || 0);
    const sourceBitrate = Number(sourceMetadata && sourceMetadata.bitRate || 0);
    const outputBitrate = Number(outputMetadata && outputMetadata.bitRate || 0);
    const sizeDeltaBytes = outputSize - sourceSize;
    const bitrateDeltaBps = outputBitrate - sourceBitrate;

    return {
        encodingItemId: item && item.id,
        attemptNumber,
        profileId,
        requestedAt: item && item.requestedAt,
        queuedAt: item && item.queuedAt,
        encodingStartedAt,
        encodingFinishedAt,
        activeEncodingMs,
        pausedMs,
        wallClockMs,
        sourceMetadata,
        outputMetadata,
        sizeDeltaBytes,
        sizeDeltaPercent: sourceSize > 0 ? (sizeDeltaBytes / sourceSize) * 100 : null,
        bitrateDeltaBps,
        bitrateDeltaPercent: sourceBitrate > 0 ? (bitrateDeltaBps / sourceBitrate) * 100 : null,
        outputAbsPath
    };
}

function calculateElapsedMs(startedAt, finishedAt) {
    const startedMs = new Date(startedAt || 0).getTime();
    const finishedMs = new Date(finishedAt || 0).getTime();
    if (!Number.isFinite(startedMs) || !Number.isFinite(finishedMs) || finishedMs < startedMs) {
        return null;
    }

    return finishedMs - startedMs;
}

function formatErrorForStorage(error) {
    if (!error) return "Unknown encoding error";
    if (error.stack) return String(error.stack);
    if (error.message) return String(error.message);
    return String(error);
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

function buildItemId(inputAbsPath) {
    const normalizedPath = String(inputAbsPath || "").trim();
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

function normalizeSourceAction(value) {
    return String(value || "").toLowerCase() === "delete" ? "delete" : "retain";
}

function deriveSafetyConfig(settings = DEFAULT_RUNTIME_SETTINGS) {
    const worker = settings && settings.worker ? settings.worker : DEFAULT_RUNTIME_SETTINGS.worker;

    return {
        POST_ITEM_COOLDOWN_MS: Math.max(0, Math.round(Number(worker.postItemCooldownMinutes || 0) * 60 * 1000)),
        CONTINUOUS_RUN_LIMIT_MS: Math.max(0, Math.round(Number(worker.continuousRunLimitMinutes || 0) * 60 * 1000)),
        PROCESS_REST_MS: Math.max(0, Math.round(Number(worker.breakDurationMinutes || 0) * 60 * 1000)),
        MONITOR_INTERVAL_MS: Math.max(1000, Math.round(Number(worker.monitorIntervalSeconds || 0) * 1000))
    };
}

function buildFfmpegRuntimeOptions(settings = DEFAULT_RUNTIME_SETTINGS) {
    const performance = settings && settings.performance ? settings.performance : DEFAULT_RUNTIME_SETTINGS.performance;

    return {
        threads: Number(performance.ffmpegThreads),
        filterThreads: Number(performance.filterThreads),
        processPriority: Number(performance.processPriority)
    };
}

function cloneSettings(settings) {
    return JSON.parse(JSON.stringify(settings || DEFAULT_RUNTIME_SETTINGS));
}

function emitUploadProgress(onProgress, totalFiles, results) {
    if (typeof onProgress !== "function") {
        return;
    }

    onProgress({
        totalFiles: Math.max(0, Number(totalFiles) || 0),
        processedFiles: Math.max(0, Number(results && results.processed) || 0),
        importedFiles: Math.max(0, Number(results && results.imported) || 0),
        duplicateFiles: Math.max(0, Number(results && results.duplicates) || 0),
        invalidFiles: Math.max(0, Number(results && results.invalid) || 0)
    });
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

async function pathExists(targetAbsPath) {
    try {
        await fsp.access(targetAbsPath, fs.constants.F_OK);
        return true;
    }
    catch (_error) {
        return false;
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

async function buildUniqueRejectedOutputPath(rejectedDirAbs, outputAbsPath) {
    const ext = path.extname(outputAbsPath || "");
    const base = path.basename(outputAbsPath || "output", ext);

    for (let index = 1; index < Number.MAX_SAFE_INTEGER; index += 1) {
        const candidate = path.join(rejectedDirAbs, `${base}_rejected_${index}${ext}`);
        if (!await pathExists(candidate)) {
            return candidate;
        }
    }

    throw new Error(`Unable to find an available rejected output path in ${rejectedDirAbs}`);
}

function getWorkingItemRoot(paths, itemId) {
    return path.join(paths.working, sanitizeSegment(itemId));
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

    if (status === "approved") {
        return "Item has already been approved and can no longer be discarded.";
    }

    if (status === "discarded") {
        return "Item has already been discarded.";
    }

    return `Item with status "${status}" cannot be discarded.`;
}

function sortQueuedItems(items, activeItemId) {
    return (Array.isArray(items) ? items : [])
        .filter(item => QUEUE_RELATED_STATES.has(String(item && item.status || "").toLowerCase()))
        .sort((left, right) => {
            if (left && left.id === activeItemId && right && right.id !== activeItemId) {
                return -1;
            }

            if (right && right.id === activeItemId && left && left.id !== activeItemId) {
                return 1;
            }

            const leftPriority = getQueueRelatedPriority(left);
            const rightPriority = getQueueRelatedPriority(right);
            if (leftPriority !== rightPriority) {
                return leftPriority - rightPriority;
            }

            const leftPosition = Number.isFinite(Number(left && left.queuePosition))
                ? Number(left.queuePosition)
                : Number.MAX_SAFE_INTEGER;
            const rightPosition = Number.isFinite(Number(right && right.queuePosition))
                ? Number(right.queuePosition)
                : Number.MAX_SAFE_INTEGER;

            if (leftPosition !== rightPosition) {
                return leftPosition - rightPosition;
            }

            const leftTime = new Date(left && (left.queuedAt || left.requestedAt || left.createdAt) || 0).getTime();
            const rightTime = new Date(right && (right.queuedAt || right.requestedAt || right.createdAt) || 0).getTime();
            if (leftTime !== rightTime) {
                return leftTime - rightTime;
            }

            const leftUpdated = new Date(left && left.updatedAt || 0).getTime();
            const rightUpdated = new Date(right && right.updatedAt || 0).getTime();
            return leftUpdated - rightUpdated;
        });
}

function getQueueRelatedPriority(item) {
    const status = String(item && item.status || "").toLowerCase();
    return {
        encoding: 0,
        paused: 0,
        queued: 1,
        cancelled: 2,
        failed: 3
    }[status] ?? Number.MAX_SAFE_INTEGER;
}

function getUnqueueBlockedMessage(status) {
    if (status === "encoding" || status === "paused") {
        return "Active items must be stopped before they can be removed from the queue.";
    }

    if (status === "review") {
        return "Items in review cannot be removed from the queue.";
    }

    if (status === "approved" || status === "discarded") {
        return "Completed items cannot be removed from the queue.";
    }

    return `Item with status "${status}" cannot be removed from the queue.`;
}

function canSetupItem(item) {
    const status = String(item && item.status || "").toLowerCase();
    if (ACTIONABLE_STATES.has(status)) {
        return true;
    }

    if (RESETUP_SOURCE_REQUIRED_STATES.has(status)) {
        return hasAvailableSource(item);
    }

    return false;
}

function hasAvailableSource(item) {
    const inputAbsPath = String(item && item.inputAbsPath || "").trim();
    if (!inputAbsPath) {
        return false;
    }

    try {
        return fs.existsSync(inputAbsPath);
    }
    catch (_error) {
        return false;
    }
}

function buildHistoryItems(historyOutcomeItems, items) {
    const fallbackHistoryItems = (Array.isArray(items) ? items : [])
        .filter(item => ["failed", "cancelled", "discarded"].includes(String(item && item.status || "").toLowerCase()))
        .map(item => ({
            ...item,
            historyRowType: "item"
        }));

    return [
        ...(Array.isArray(historyOutcomeItems) ? historyOutcomeItems : []),
        ...fallbackHistoryItems
    ];
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
