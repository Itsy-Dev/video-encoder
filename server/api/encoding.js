const path = require("path");
const fs = require("fs");

const EncodingService = require("../modules/encoding/encoding.service");
const SettingsService = require("../modules/settings/settings.service");
const { getEncoderPaths } = require("../modules/filesystem/handoff-paths");

const VIEW_ROOT_ABS = path.resolve(__dirname, "..", "views", "encoding");
const IS_DEV_VIEW_HOT_RELOAD = process.env.NODE_ENV !== "production";

module.exports = function encodingApi(app, database) {
    const encodingService = new EncodingService(database);
    const settingsService = new SettingsService(database);

    app.get("/", function (_req, res) {
        res.redirect("/encoding/pending");
    });

    app.get("/api/encoding/summary", async function (_req, res) {
        const state = await encodingService.getDashboardState();
        res.json({
            ok: true,
            ...state
        });
    });

    app.get("/api/encoding/settings", async function (_req, res) {
        const values = await settingsService.getSettings();
        res.json({
            ok: true,
            definitions: settingsService.getDefinitions(),
            values
        });
    });

    app.post("/api/encoding/settings", async function (req, res) {
        const payload = req.body && typeof req.body === "object" && req.body.settings
            ? req.body.settings
            : req.body;
        const values = await settingsService.updateSettings(payload || {});
        res.json({
            ok: true,
            definitions: settingsService.getDefinitions(),
            values
        });
    });

    app.post("/api/encoding/scan", async function (_req, res) {
        const result = await encodingService.scanInbox();
        const state = await encodingService.getDashboardState();
        res.json({
            ok: true,
            result,
            ...state
        });
    });

    app.post("/api/encoding/items/:id/queue", async function (req, res) {
        const item = await encodingService.queueItem(req.params.id, {
            profileId: req.body.profileId,
            inboxRelativeDir: req.body.inboxRelativeDir
        });
        res.json({ ok: true, item });
    });

    app.post("/api/encoding/items/:id/complete", async function (req, res) {
        const item = await encodingService.completeItem(req.params.id, {
            reviewer: req.body.reviewer || "operator"
        });
        res.json({ ok: true, item });
    });

    app.post("/api/encoding/control/pause", async function (_req, res) {
        const paused = await encodingService.pauseActive("manual");
        res.json({
            ok: true,
            paused,
            worker: encodingService.getWorkerStatus()
        });
    });

    app.post("/api/encoding/control/resume", async function (_req, res) {
        const resumed = await encodingService.resumeActive();
        res.json({
            ok: true,
            resumed,
            worker: encodingService.getWorkerStatus()
        });
    });

    app.post("/api/encoding/control/stop", async function (_req, res) {
        const stopped = await encodingService.stopActive();
        res.json({
            ok: true,
            stopped,
            worker: encodingService.getWorkerStatus()
        });
    });

    app.post("/api/encoding/control/wake", async function (_req, res) {
        const worker = await encodingService.wakeQueue();
        res.json({
            ok: true,
            worker
        });
    });

    app.post("/api/encoding/items/:id/approve", async function (req, res) {
        const item = await encodingService.approveItem(req.params.id, {
            reviewer: req.body.reviewer || "operator",
            sourceAction: req.body.sourceAction || "retain"
        });
        res.json({ ok: true, item });
    });

    app.post("/api/encoding/items/:id/reject", async function (req, res) {
        const item = await encodingService.rejectItem(req.params.id, {
            reviewer: req.body.reviewer || "operator",
            notes: req.body.notes || null
        });
        res.json({ ok: true, item });
    });

    app.post("/api/encoding/items/:id/discard", async function (req, res) {
        const item = await encodingService.discardItem(req.params.id, {
            reviewer: req.body.reviewer || "operator"
        });
        res.json({ ok: true, item });
    });

    app.post("/api/encoding/items/:id/unqueue", async function (req, res) {
        const item = await encodingService.unqueueItem(req.params.id, {
            reviewer: req.body.reviewer || "operator"
        });
        res.json({ ok: true, item });
    });

    app.post("/api/encoding/items/:id/queue/move-up", async function (req, res) {
        const item = await encodingService.moveQueueItem(req.params.id, "up");
        res.json({ ok: true, item });
    });

    app.post("/api/encoding/items/:id/queue/move-down", async function (req, res) {
        const item = await encodingService.moveQueueItem(req.params.id, "down");
        res.json({ ok: true, item });
    });

    app.post("/api/encoding/items/:id/queue/move-front", async function (req, res) {
        const item = await encodingService.moveQueueItem(req.params.id, "front");
        res.json({ ok: true, item });
    });

    app.post("/api/encoding/items/:id/queue/move-back", async function (req, res) {
        const item = await encodingService.moveQueueItem(req.params.id, "back");
        res.json({ ok: true, item });
    });

    app.get("/api/encoding/items/:id/source", async function (req, res, next) {
        try {
            const item = await encodingService.getItem(req.params.id);
            const sourceAbsPath = item && item.inputAbsPath ? item.inputAbsPath : null;

            if (!sourceAbsPath || !fs.existsSync(sourceAbsPath)) {
                res.status(404).send("Source video not found.");
                return;
            }

            res.sendFile(sourceAbsPath);
        }
        catch (error) {
            next(error);
        }
    });

    app.get("/api/encoding/items/:id/encoded", async function (req, res, next) {
        try {
            const item = await encodingService.getItem(req.params.id);
            const encodedAbsPath = item && item.encodedOutputAbsPath ? item.encodedOutputAbsPath : null;

            if (!encodedAbsPath || !fs.existsSync(encodedAbsPath)) {
                res.status(404).send("Encoded video not found.");
                return;
            }

            res.sendFile(encodedAbsPath);
        }
        catch (error) {
            next(error);
        }
    });

    app.get("/encoding/pending", async function (_req, res) {
        const state = await encodingService.getDashboardState();
        const { renderPage, renderPending } = loadEncodingViews();
        res.send(renderPage({
            title: "Pending",
            heading: "Pending Items",
            description: "Discovered, stopped, failed, and rejected items awaiting profile selection and queue decisions.",
            state,
            body: renderPending(state.actionableItems)
        }));
    });

    app.get("/encoding/setup", async function (req, res) {
        const state = await encodingService.getDashboardState();
        const selectedId = String(req.query.id || "");
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
                sourcePreviewUrl: buildPendingSourceUrl(selected)
            })
        }));
    });

    app.get("/encoding/setup/fragment", async function (req, res) {
        const state = await encodingService.getDashboardState();
        const selectedId = String(req.query.id || "");
        const selected = state.items.find(item => item.id === selectedId) || state.actionableItems[0] || null;
        const selectedProfileId = String(req.query.profileId || (selected && (selected.profileId || selected.requestedProfileId)) || "browser_compatibility");
        const { renderSetup } = loadEncodingViews();

        res.send(renderSetup(selected, state.profiles, {
            selectedProfileId,
            sourcePreviewUrl: buildPendingSourceUrl(selected)
        }));
    });

    app.get("/encoding/queue", async function (_req, res) {
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
    });

    app.get("/encoding/review", async function (_req, res) {
        const state = await encodingService.getDashboardState();
        const { renderPage, renderReview } = loadEncodingViews();
        res.send(renderPage({
            title: "Review",
            heading: "Review Completed Encodes",
            description: "Approve or reject completed outputs before placing them into outbox.",
            state,
            body: renderReview(state.reviewItems)
        }));
    });

    app.get("/encoding/review/item", async function (req, res) {
        const state = await encodingService.getDashboardState();
        const selectedId = String(req.query.id || "");
        const selected = state.reviewItems.find(item => item.id === selectedId) || state.reviewItems[0] || null;
        const { renderPage, renderReviewItem } = loadEncodingViews();

        res.send(renderPage({
            title: "Review Item",
            heading: "Review Completed Encodes",
            description: "Review the encoded output, compare it against the source, then commit or reject.",
            state,
            body: renderReviewItem(selected, {
                encodedPreviewUrl: selected ? `/api/encoding/items/${encodeURIComponent(selected.id)}/encoded` : null
            })
        }));
    });

    app.get("/encoding/history", async function (_req, res) {
        const state = await encodingService.getDashboardState();
        const { renderPage, renderHistory } = loadEncodingViews();
        res.send(renderPage({
            title: "History",
            heading: "History",
            description: "Approved, rejected, failed, and exported records.",
            state,
            body: renderHistory(state.historyItems)
        }));
    });

    app.get("/encoding/settings", async function (_req, res) {
        const state = await encodingService.getDashboardState();
        const settings = await settingsService.getSettings();
        const { renderPage, renderSettings } = loadEncodingViews();

        res.send(renderPage({
            title: "Settings",
            heading: "Settings",
            description: "Configured directories and profile options for the standalone encoder.",
            state,
            body: renderSettings(state.profiles, settings)
        }));
    });
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

    const pendingRootAbs = path.resolve(getEncoderPaths().pending);
    const inputAbsPath = path.resolve(item.inputAbsPath);
    const relativePath = path.relative(pendingRootAbs, inputAbsPath);

    if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
        return null;
    }

    return `/media/pending-source/${relativePath.split(path.sep).map(encodeURIComponent).join("/")}`;
}
