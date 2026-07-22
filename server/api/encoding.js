const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const multer = require("multer");

const EncodingService = require("../modules/encoding/encoding.service");
const SettingsService = require("../modules/settings/settings.service");
const {
    normalizeNavigationSource,
    resolveRedirectUrl
} = require("../modules/encoding/navigation");
const { getEncoderPaths } = require("../modules/filesystem/handoff-paths");
const { readEncoderLogs } = require("../modules/filesystem/log-reader");

const VIEW_ROOT_ABS = path.resolve(__dirname, "..", "views", "encoding");
const IS_DEV_VIEW_HOT_RELOAD = process.env.NODE_ENV !== "production";
const asyncRoute = handler => function wrappedRoute(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
};

module.exports = function encodingApi(app, database, fileIntake) {
    const encodingService = new EncodingService(database);
    const settingsService = new SettingsService(database);
    const upload = multer({
        dest: fileIntake.tempRootAbsPath,
        limits: {
            files: 25
        }
    });

    fileIntake.registerProcessor("encoder_pending", async function processEncoderPendingIntake({ files, metadata, updateProgress }) {
        const result = await encodingService.ingestUploadedFiles(files, {
            inboxRelativeDir: metadata && metadata.inboxRelativeDir,
            onProgress: updateProgress
        });

        return {
            processedFiles: result.processed,
            importedFiles: result.imported,
            duplicateFiles: result.duplicates,
            invalidFiles: result.invalid
        };
    });

    app.get("/", function (_req, res) {
        res.redirect("/encoding/pending");
    });

    function applyFileIntakeSettings(settings) {
        const automation = settings && settings.automation ? settings.automation : {};
        fileIntake.applySettings({
            staleTempFileMs: Math.max(1, Number(automation.uploadTempMaxAgeHours || 0)) * 60 * 60 * 1000
        });
    }

    async function requireBrowserFileIntakeEnabled() {
        const settings = await settingsService.getSettings();
        const enabled = Boolean(settings && settings.intake && settings.intake.browserFileIntakeEnabled);
        if (!enabled) {
            const error = new Error("Browser file intake is disabled.");
            error.statusCode = 403;
            throw error;
        }
        return settings;
    }

    app.get("/api/encoding/summary", asyncRoute(async function (_req, res) {
        const state = await encodingService.getDashboardState();
        res.json({
            ok: true,
            ...state
        });
    }));

    app.get("/api/encoding/settings", asyncRoute(async function (_req, res) {
        const settingsState = await settingsService.getSettingsState();
        res.json({
            ok: true,
            definitions: settingsService.getDefinitions(),
            values: settingsState.values,
            meta: buildSettingsMeta(settingsState)
        });
    }));

    app.get("/api/encoding/logs", asyncRoute(async function (req, res) {
        const logs = await readEncoderLogs(getEncoderPaths().logs, {
            file: req.query.file,
            limit: req.query.limit
        });
        res.json({
            ok: true,
            logs
        });
    }));

    app.post("/api/encoding/settings", asyncRoute(async function (req, res) {
        const payload = req.body && typeof req.body === "object" && req.body.settings
            ? req.body.settings
            : req.body;
        const values = await settingsService.updateSettings(payload || {});
        const settingsState = await settingsService.getSettingsState();
        await encodingService.applyRuntimeSettings(values);
        applyFileIntakeSettings(values);
        res.json({
            ok: true,
            definitions: settingsService.getDefinitions(),
            values,
            meta: buildSettingsMeta(settingsState)
        });
    }));

    app.post("/api/encoding/scan", asyncRoute(async function (_req, res) {
        const result = await encodingService.scanInbox();
        const state = await encodingService.getDashboardState();
        res.json({
            ok: true,
            result,
            ...state
        });
    }));

    app.post("/api/encoding/pending/preflight", asyncRoute(async function (req, res) {
        await requireBrowserFileIntakeEnabled();
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const filenames = Array.isArray(body.filenames) ? body.filenames : [];
        const inboxRelativeDir = body.inboxRelativeDir || "";
        const files = filenames.map(name => ({ name }));
        const result = await encodingService.checkUploadedFileDuplicates(files, {
            inboxRelativeDir
        });

        res.json({
            ok: true,
            result
        });
    }));

    app.post("/api/encoding/pending/import", function attachPendingImportCleanup(req, _res, next) {
        req.on("aborted", function onAborted() {
            fileIntake.cleanupStagedFiles(req.files).catch(() => {});
            fileIntake.cleanupStaleTempFiles().catch(() => {});
        });
        next();
    }, upload.array("files"), asyncRoute(async function (req, res) {
        await requireBrowserFileIntakeEnabled();
        const files = Array.isArray(req.files) ? req.files : [];
        const inboxRelativeDir = req.body && typeof req.body === "object"
            ? req.body.inboxRelativeDir
            : "";

        if (!files.length) {
            res.status(400).json({
                ok: false,
                error: "No files were uploaded."
            });
            return;
        }

        if (req.aborted) {
            await fileIntake.cleanupStagedFiles(files);
            res.status(499).json({
                ok: false,
                error: "Upload was aborted."
            });
            return;
        }

        try {
            const job = await fileIntake.enqueue({
                kind: "encoder_pending",
                files,
                metadata: {
                    inboxRelativeDir
                }
            });

            res.status(202).json({
                ok: true,
                job
            });
        }
        catch (error) {
            await fileIntake.cleanupStagedFiles(files).catch(() => {});
            throw error;
        }
    }));

    app.get("/api/encoding/pending/import/:jobId", asyncRoute(async function (req, res) {
        const job = fileIntake.getJob(req.params.jobId);
        if (!job) {
            res.status(404).json({
                ok: false,
                error: "Import job not found."
            });
            return;
        }

        res.json({
            ok: true,
            job
        });
    }));

    app.post("/api/encoding/items/:id/queue", asyncRoute(async function (req, res) {
        const item = await encodingService.queueItem(req.params.id, {
            profileId: req.body.profileId,
            inboxRelativeDir: req.body.inboxRelativeDir,
            queuePlacement: req.body.queueToFront ? "front" : "back"
        });
        const origin = normalizeNavigationSource(req.body && req.body.origin);
        res.json({
            ok: true,
            item,
            redirectUrl: await resolveRedirectUrl({
                flow: "setupSubmit",
                source: origin,
                encodingService
            })
        });
    }));

    app.post("/api/encoding/items/:id/complete", asyncRoute(async function (req, res) {
        const item = await encodingService.completeItem(req.params.id, {
            reviewer: req.body.reviewer || "operator"
        });
        res.json({ ok: true, item });
    }));

    app.post("/api/encoding/control/pause", asyncRoute(async function (_req, res) {
        const paused = await encodingService.pauseActive("manual");
        res.json({
            ok: true,
            paused,
            worker: encodingService.getWorkerStatus()
        });
    }));

    app.post("/api/encoding/control/resume", asyncRoute(async function (_req, res) {
        const resumed = await encodingService.resumeActive();
        res.json({
            ok: true,
            resumed,
            worker: encodingService.getWorkerStatus()
        });
    }));

    app.post("/api/encoding/control/stop", asyncRoute(async function (_req, res) {
        const stopped = await encodingService.stopActive();
        res.json({
            ok: true,
            stopped,
            worker: encodingService.getWorkerStatus()
        });
    }));

    app.post("/api/encoding/control/wake", asyncRoute(async function (_req, res) {
        const worker = await encodingService.wakeQueue();
        res.json({
            ok: true,
            worker
        });
    }));

    app.post("/api/encoding/items/:id/approve", asyncRoute(async function (req, res) {
        const item = await encodingService.approveItem(req.params.id, {
            reviewer: req.body.reviewer || "operator",
            sourceAction: req.body.sourceAction || "retain"
        });
        res.json({ ok: true, item });
    }));

    app.post("/api/encoding/items/:id/reject", asyncRoute(async function (req, res) {
        const item = await encodingService.rejectItem(req.params.id, {
            reviewer: req.body.reviewer || "operator",
            notes: req.body.notes || null
        });
        res.json({ ok: true, item });
    }));

    app.post("/api/encoding/items/:id/discard", asyncRoute(async function (req, res) {
        const item = await encodingService.discardItem(req.params.id, {
            reviewer: req.body.reviewer || "operator"
        });
        res.json({ ok: true, item });
    }));

    app.post("/api/encoding/items/:id/unqueue", asyncRoute(async function (req, res) {
        const item = await encodingService.unqueueItem(req.params.id, {
            reviewer: req.body.reviewer || "operator"
        });
        res.json({ ok: true, item });
    }));

    app.post("/api/encoding/items/:id/queue/move-up", asyncRoute(async function (req, res) {
        const item = await encodingService.moveQueueItem(req.params.id, "up");
        res.json({ ok: true, item });
    }));

    app.post("/api/encoding/items/:id/queue/move-down", asyncRoute(async function (req, res) {
        const item = await encodingService.moveQueueItem(req.params.id, "down");
        res.json({ ok: true, item });
    }));

    app.post("/api/encoding/items/:id/queue/move-front", asyncRoute(async function (req, res) {
        const item = await encodingService.moveQueueItem(req.params.id, "front");
        res.json({ ok: true, item });
    }));

    app.post("/api/encoding/items/:id/queue/move-back", asyncRoute(async function (req, res) {
        const item = await encodingService.moveQueueItem(req.params.id, "back");
        res.json({ ok: true, item });
    }));

    app.get("/api/encoding/items/:id/source", asyncRoute(async function (req, res) {
        const item = await encodingService.getItem(req.params.id);
        const sourceAbsPath = item && item.inputAbsPath ? item.inputAbsPath : null;

        if (!sourceAbsPath || !fs.existsSync(sourceAbsPath)) {
            res.status(404).send("Source video not found.");
            return;
        }

        res.sendFile(sourceAbsPath);
    }));

    app.get("/api/encoding/items/:id/encoded", asyncRoute(async function (req, res) {
        const item = await encodingService.getItem(req.params.id);
        const encodedAbsPath = item && item.outputAbsPath ? item.outputAbsPath : null;

        if (!encodedAbsPath || !fs.existsSync(encodedAbsPath)) {
            res.status(404).send("Encoded video not found.");
            return;
        }

        res.sendFile(encodedAbsPath);
    }));

    app.get("/encoding/pending", asyncRoute(async function (req, res) {
        const state = await encodingService.getDashboardState();
        const settings = await settingsService.getSettings();
        const { renderPage, renderPending } = loadEncodingViews();
        res.send(renderPage({
            title: "Pending",
            heading: "Pending Items",
            description: "Discovered, stopped, failed, and rejected items awaiting profile selection and queue decisions.",
            state,
            body: renderPending(state.actionableItems, {
                enabled: Boolean(settings && settings.intake && settings.intake.browserFileIntakeEnabled)
            })
        }));
    }));

    app.get("/encoding/setup", asyncRoute(async function (req, res) {
        const state = await encodingService.getDashboardState();
        const settings = await settingsService.getSettings();
        const selectedId = String(req.query.id || "");
        const origin = normalizeNavigationSource(req.query.origin);
        const selected = state.items.find(item => item.id === selectedId) || state.actionableItems[0] || null;
        const selectedProfileId = String(req.query.profileId || (selected && (selected.profileId || selected.requestedProfileId)) || "browser_compatibility");
        const { renderPage, renderSetup } = loadEncodingViews();

        res.send(renderPage({
            title: "Setup",
            heading: "Encoding Setup",
            description: "Choose a profile, keep the discovered inbox subdirectory if needed, and send the item into the automated queue.",
            state,
            body: renderSetup(selected, state.profiles, {
                selectedProfileId,
                origin,
                sourcePreviewUrl: buildPendingSourceUrl(selected),
                showVideoPlayerByDefault: resolveSetupToggle(req.query.showVideoPlayer, settings && settings.setup && settings.setup.showVideoPlayerByDefault),
                queueToFrontByDefault: resolveSetupToggle(req.query.queueToFront, settings && settings.setup && settings.setup.queueToFrontByDefault)
            })
        }));
    }));

    app.get("/encoding/setup/fragment", asyncRoute(async function (req, res) {
        const state = await encodingService.getDashboardState();
        const settings = await settingsService.getSettings();
        const selectedId = String(req.query.id || "");
        const origin = normalizeNavigationSource(req.query.origin);
        const selected = state.items.find(item => item.id === selectedId) || state.actionableItems[0] || null;
        const selectedProfileId = String(req.query.profileId || (selected && (selected.profileId || selected.requestedProfileId)) || "browser_compatibility");
        const { renderSetup } = loadEncodingViews();

        res.send(renderSetup(selected, state.profiles, {
            selectedProfileId,
            origin,
            sourcePreviewUrl: buildPendingSourceUrl(selected),
            showVideoPlayerByDefault: resolveSetupToggle(req.query.showVideoPlayer, settings && settings.setup && settings.setup.showVideoPlayerByDefault),
            queueToFrontByDefault: resolveSetupToggle(req.query.queueToFront, settings && settings.setup && settings.setup.queueToFrontByDefault)
        }));
    }));

    app.get("/encoding/queue", asyncRoute(async function (_req, res) {
        const state = await encodingService.getDashboardState();
        const { renderPage, renderQueue } = loadEncodingViews();
        res.send(renderPage({
            title: "Queue",
            heading: "Queue Status",
            description: "Track the single active worker, automatic queue pickup, cooldowns, and rest cycles.",
            state,
            body: renderQueue(state),
            autoRefreshMs: 5000
        }));
    }));

    app.get("/encoding/review", asyncRoute(async function (_req, res) {
        const state = await encodingService.getDashboardState();
        const { renderPage, renderReview } = loadEncodingViews();
        res.send(renderPage({
            title: "Review",
            heading: "Review Completed Encodes",
            description: "Approve completed encoded outputs, reject them into Outbox/rejected, or redo with a new profile.",
            state,
            body: renderReview(state.reviewItems)
        }));
    }));

    app.get("/encoding/review/item", asyncRoute(async function (req, res) {
        const state = await encodingService.getDashboardState();
        const settings = await settingsService.getSettings();
        const selectedId = String(req.query.id || "");
        const selected = state.items.find(item => item.id === selectedId) || state.reviewItems[0] || null;
        const outcome = selected ? await encodingService.getLatestOutcome(selected.id) : null;
        const { renderPage, renderReviewItem } = loadEncodingViews();
        const encodedPreviewUrl = selected && selected.outputAbsPath && fs.existsSync(selected.outputAbsPath)
            ? `/api/encoding/items/${encodeURIComponent(selected.id)}/encoded`
            : null;
        const canReview = selected && String(selected.status || "").toLowerCase() === "review";

        res.send(renderPage({
            title: "Review Item",
            heading: "Review Completed Encodes",
            description: canReview
                ? "Review the encoded output, compare it against the source, then commit, reject, or redo."
                : "Review the saved encode outcome and timing data captured when the encode finished.",
            state,
            body: renderReviewItem(selected, {
                encodedPreviewUrl,
                outcome,
                retainSourceByDefault: Boolean(settings && settings.review && settings.review.retainSourceByDefault)
            })
        }));
    }));

    app.get("/encoding/history", asyncRoute(async function (_req, res) {
        const state = await encodingService.getDashboardState();
        const { renderPage, renderHistory } = loadEncodingViews();
        res.send(renderPage({
            title: "History",
            heading: "History",
            description: "Approved, rejected, failed, and exported records.",
            state,
            body: renderHistory(state.historyItems)
        }));
    }));

    app.get("/encoding/logs", asyncRoute(async function (req, res) {
        const state = await encodingService.getDashboardState();
        const logs = await readEncoderLogs(getEncoderPaths().logs, {
            file: req.query.file,
            limit: req.query.limit
        });
        const { renderPage, renderLogs } = loadEncodingViews();

        res.send(renderPage({
            title: "Logs",
            heading: "Logs",
            description: "Inspect recent operation and error logs without opening the filesystem.",
            state,
            body: renderLogs(logs),
            autoRefreshMs: 20_000
        }));
    }));

    app.get("/encoding/settings", asyncRoute(async function (_req, res) {
        const state = await encodingService.getDashboardState();
        const settingsState = await settingsService.getSettingsState();
        const settings = settingsState.values;
        const storageStatus = await getStorageStatus(settings);
        applyFileIntakeSettings(settings);
        const { renderPage, renderSettings } = loadEncodingViews();

        res.send(renderPage({
            title: "Settings",
            heading: "Settings",
            description: "Configured directories and profile options for the standalone encoder.",
            state,
            body: renderSettings(state.profiles, settings, {
                settingsState,
                storageStatus
            })
        }));
    }));

    const startupReady = settingsService.getSettings()
        .then(applyFileIntakeSettings)
        .catch(error => {
            console.error("[SETTINGS] Failed to apply file intake settings on startup", error);
        });

    return {
        encodingService,
        settingsService,
        ready: Promise.all([encodingService.ready, startupReady])
    };
};

function loadEncodingViews() {
    if (IS_DEV_VIEW_HOT_RELOAD) {
        clearEncodingViewCache();
    }

    return {
        renderPage: require("../views/encoding/layout"),
        renderPending: require("../views/encoding/pending"),
        renderSetup: require("../views/encoding/setup"),
        renderQueue: require("../views/encoding/queue"),
        renderReview: require("../views/encoding/review"),
        renderReviewItem: require("../views/encoding/review-item"),
        renderHistory: require("../views/encoding/history"),
        renderLogs: require("../views/encoding/logs"),
        renderSettings: require("../views/encoding/settings")
    };
}

function clearEncodingViewCache() {
    for (const cacheKey of Object.keys(require.cache)) {
        if (cacheKey === VIEW_ROOT_ABS || cacheKey.startsWith(`${VIEW_ROOT_ABS}${path.sep}`)) {
            delete require.cache[cacheKey];
        }
    }
}

function buildPendingSourceUrl(item) {
    if (!item || !item.inputAbsPath) return null;
    return `/api/encoding/items/${encodeURIComponent(item.id)}/source`;
}

function buildSettingsMeta(settingsState) {
    return {
        sources: settingsState && settingsState.sources ? settingsState.sources : {},
        firstRun: Boolean(settingsState && settingsState.firstRun)
    };
}

async function getStorageStatus(settings) {
    const storage = settings && settings.storage ? settings.storage : {};
    return {
        inboxRoot: await getPathStatus(storage.inboxRoot),
        outboxRoot: await getPathStatus(storage.outboxRoot)
    };
}

async function getPathStatus(absPath) {
    const value = String(absPath || "").trim();
    if (!value) {
        return {
            exists: false,
            isDirectory: false,
            message: "No folder configured"
        };
    }

    const stat = await fsp.stat(value).catch(() => null);
    if (!stat) {
        return {
            exists: false,
            isDirectory: false,
            message: "Folder will be created when the app needs it"
        };
    }

    return {
        exists: true,
        isDirectory: stat.isDirectory(),
        message: stat.isDirectory() ? "Folder exists" : "Path exists but is not a folder"
    };
}

function resolveSetupToggle(queryValue, fallbackValue) {
    if (typeof queryValue === "string") {
        const normalized = queryValue.trim().toLowerCase();
        if (["true", "1", "yes", "on"].includes(normalized)) return true;
        if (["false", "0", "no", "off"].includes(normalized)) return false;
    }

    return Boolean(fallbackValue);
}
