const EncodingService = require("../modules/encoding/encoding.service");
const { getEncoderPaths } = require("../modules/filesystem/handoff-paths");
const renderPage = require("../views/encoding/layout");
const renderPending = require("../views/encoding/pending");
const renderSetup = require("../views/encoding/setup");
const renderQueue = require("../views/encoding/queue");
const renderReview = require("../views/encoding/review");
const renderHistory = require("../views/encoding/history");
const renderSettings = require("../views/encoding/settings");

module.exports = function encodingApi(app, database) {
    const encodingService = new EncodingService(database);

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
            reviewer: req.body.reviewer || "operator"
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

    app.get("/encoding/pending", async function (_req, res) {
        const state = await encodingService.getDashboardState();
        res.send(renderPage({
            title: "Pending",
            heading: "Actionable Items",
            description: "Discovered, stopped, failed, and rejected items awaiting profile selection and queue decisions.",
            state,
            body: renderPending(state.actionableItems)
        }));
    });

    app.get("/encoding/setup", async function (req, res) {
        const state = await encodingService.getDashboardState();
        const selectedId = String(req.query.id || "");
        const selected = state.items.find(item => item.id === selectedId) || state.actionableItems[0] || null;

        res.send(renderPage({
            title: "Setup",
            heading: "Encoding Setup",
            description: "Choose a profile, keep the discovered inbox subdirectory if needed, and send the item into the automated queue.",
            state,
            body: renderSetup(selected, state.profiles)
        }));
    });

    app.get("/encoding/queue", async function (_req, res) {
        const state = await encodingService.getDashboardState();
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
        res.send(renderPage({
            title: "Review",
            heading: "Review Completed Encodes",
            description: "Approve or reject completed outputs before placing them into outbox.",
            state,
            body: renderReview(state.reviewItems)
        }));
    });

    app.get("/encoding/history", async function (_req, res) {
        const state = await encodingService.getDashboardState();
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
        const paths = getEncoderPaths();

        res.send(renderPage({
            title: "Settings",
            heading: "Settings",
            description: "Configured directories and profile options for the standalone encoder.",
            state,
            body: renderSettings(paths, state.profiles)
        }));
    });
};
