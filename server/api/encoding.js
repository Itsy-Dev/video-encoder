const path = require("path");

const EncodingService = require("../modules/encoding/encoding.service");
const { getEncoderPaths } = require("../modules/filesystem/handoff-paths");

const encodingService = new EncodingService();

module.exports = function encodingApi(app) {
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
            sourceClass: req.body.sourceClass
        });
        res.json({ ok: true, item });
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
            heading: "Pending Inbox Files",
            description: "Discovered request packages awaiting setup and queue decisions.",
            state,
            body: renderPendingTable(state.pendingItems)
        }));
    });

    app.get("/encoding/setup", async function (req, res) {
        const state = await encodingService.getDashboardState();
        const selectedId = String(req.query.id || "");
        const selected = state.items.find(item => item.id === selectedId) || state.pendingItems[0] || null;
        res.send(renderPage({
            title: "Setup",
            heading: "Encoding Setup",
            description: "Choose a profile and destination class before queueing work.",
            state,
            body: renderSetup(selected, state.profiles)
        }));
    });

    app.get("/encoding/queue", async function (_req, res) {
        const state = await encodingService.getDashboardState();
        res.send(renderPage({
            title: "Queue",
            heading: "Queue Status",
            description: "Track ready, queued, encoding, and completed items.",
            state,
            body: renderQueue(state.items)
        }));
    });

    app.get("/encoding/review", async function (_req, res) {
        const state = await encodingService.getDashboardState();
        res.send(renderPage({
            title: "Review",
            heading: "Review Completed Encodes",
            description: "Approve or reject encoded files before placing them into outbox.",
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

function renderPage({ title, heading, description, state, body }) {
    const nav = [
        ["Pending", "/encoding/pending"],
        ["Setup", "/encoding/setup"],
        ["Queue", "/encoding/queue"],
        ["Review", "/encoding/review"],
        ["History", "/encoding/history"],
        ["Settings", "/encoding/settings"]
    ];

    const cards = [
        ["Pending", state.counts.pending],
        ["Queued", state.counts.queued],
        ["Encoding", state.counts.encoding],
        ["Review", state.counts.review],
        ["Approved", state.counts.approved]
    ];

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Encoder · ${escapeHtml(title)}</title>
  <style>
    :root {
      --bg: #f5f1e8;
      --surface: #fffdf8;
      --ink: #1f2a2e;
      --muted: #6b7478;
      --line: #d9cfbf;
      --accent: #1d6b57;
      --accent-soft: #d7ebe5;
      --warn: #9c5b1a;
      --good: #2f6a3a;
      --bad: #8b3431;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(29,107,87,.10), transparent 35%),
        linear-gradient(180deg, #f8f4ec 0%, var(--bg) 100%);
    }
    a { color: var(--accent); text-decoration: none; }
    .shell { max-width: 1200px; margin: 0 auto; padding: 24px; }
    .hero, .panel, table {
      background: rgba(255,253,248,.92);
      border: 1px solid var(--line);
      box-shadow: 0 10px 35px rgba(43, 54, 58, .08);
      border-radius: 18px;
    }
    .hero { padding: 24px; margin-bottom: 20px; }
    .eyebrow {
      display: inline-block;
      text-transform: uppercase;
      letter-spacing: .12em;
      font-size: 12px;
      color: var(--accent);
      margin-bottom: 12px;
    }
    h1 { margin: 0 0 8px; font-size: 40px; }
    p { margin: 0; color: var(--muted); line-height: 1.5; }
    .nav {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin: 16px 0 0;
    }
    .nav a {
      padding: 10px 14px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: white;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
      margin: 20px 0;
    }
    .card {
      padding: 16px;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 16px;
    }
    .card .label {
      font-size: 12px;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 6px;
    }
    .card .value { font-size: 28px; }
    .panel { padding: 18px; margin-bottom: 20px; }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    button, .button {
      border: 0;
      cursor: pointer;
      background: var(--accent);
      color: white;
      padding: 10px 14px;
      border-radius: 999px;
      font: inherit;
    }
    .button-secondary { background: #6f7d7a; }
    .button-bad { background: var(--bad); }
    table {
      width: 100%;
      border-collapse: collapse;
      overflow: hidden;
    }
    th, td {
      text-align: left;
      padding: 14px 16px;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
    }
    th {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .08em;
      color: var(--muted);
      background: rgba(215, 235, 229, .35);
    }
    tr:last-child td { border-bottom: 0; }
    .pill {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .08em;
    }
    .split {
      display: grid;
      grid-template-columns: 1.2fr .8fr;
      gap: 20px;
    }
    .stack { display: grid; gap: 12px; }
    .kv {
      display: grid;
      grid-template-columns: 160px 1fr;
      gap: 8px;
      padding: 8px 0;
      border-bottom: 1px solid var(--line);
    }
    .kv:last-child { border-bottom: 0; }
    .kv .k { color: var(--muted); }
    .note {
      padding: 14px;
      border-radius: 14px;
      background: #f0ece3;
      color: var(--muted);
    }
    .empty {
      padding: 24px;
      border: 1px dashed var(--line);
      border-radius: 16px;
      color: var(--muted);
      background: rgba(255,255,255,.45);
    }
    code {
      background: rgba(215, 235, 229, .5);
      padding: 2px 5px;
      border-radius: 6px;
      font-size: .95em;
    }
    @media (max-width: 900px) {
      .split { grid-template-columns: 1fr; }
      h1 { font-size: 32px; }
      .shell { padding: 16px; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <div class="eyebrow">Standalone Encoder</div>
      <h1>${escapeHtml(heading)}</h1>
      <p>${escapeHtml(description)}</p>
      <div class="nav">
        ${nav.map(([label, href]) => `<a href="${href}">${escapeHtml(label)}</a>`).join("")}
      </div>
    </section>
    <section class="cards">
      ${cards.map(([label, value]) => `
        <div class="card">
          <div class="label">${escapeHtml(label)}</div>
          <div class="value">${escapeHtml(String(value))}</div>
        </div>
      `).join("")}
    </section>
    ${body}
  </div>
</body>
</html>`;
}

function renderPendingTable(items) {
    return `<section class="panel">
      <div class="toolbar">
        <div>
          <strong>Inbox Discovery</strong>
          <p>Use <code>POST /api/encoding/scan</code> to populate this list from the inbox contract.</p>
        </div>
        <a class="button" href="/encoding/setup">Open Setup</a>
      </div>
      ${renderTable(items, [
          ["State", item => pill(item.status)],
          ["File", item => escapeHtml(item.originalFilename)],
          ["Source", item => escapeHtml(item.sourceClass)],
          ["Requested Profile", item => escapeHtml(item.requestedProfileId || "browser_compatibility")],
          ["Request ID", item => escapeHtml(item.requestId)],
          ["Action", item => `<a href="/encoding/setup?id=${encodeURIComponent(item.id)}">Configure</a>`]
      ], "No pending items yet. Scan the inbox or seed test manifests to start the flow.")}
    </section>`;
}

function renderSetup(item, profiles) {
    if (!item) {
        return `<section class="panel"><div class="empty">No discovered item is available for setup yet.</div></section>`;
    }

    return `<section class="split">
      <div class="panel stack">
        <div>
          <strong>${escapeHtml(item.originalFilename)}</strong>
          <p>Choose the initial profile and confirm the destination class before the item enters the queue.</p>
        </div>
        ${renderKeyValue([
            ["Request ID", item.requestId],
            ["Current State", item.status],
            ["Source Class", item.sourceClass],
            ["Selected Profile", item.profileId || "not set"],
            ["Manifest Path", item.manifestAbsPath],
            ["Input Path", item.inputAbsPath]
        ])}
        <div class="note">Queue action is available through <code>POST /api/encoding/items/${escapeHtml(item.id)}/queue</code> with <code>profileId</code> and <code>sourceClass</code>.</div>
      </div>
      <div class="panel stack">
        <strong>Available Profiles</strong>
        ${profiles.map(profile => `
          <div class="note">
            <strong>${escapeHtml(profile.id)}</strong><br />
            ${escapeHtml(profile.label)}<br />
            <small>${escapeHtml(profile.description)}</small>
          </div>
        `).join("")}
      </div>
    </section>`;
}

function renderQueue(items) {
    const rows = items.filter(item => ["ready", "queued", "encoding", "paused", "completed", "review"].includes(item.status));
    return `<section class="panel">
      ${renderTable(rows, [
          ["State", item => pill(item.status)],
          ["File", item => escapeHtml(item.originalFilename)],
          ["Profile", item => escapeHtml(item.profileId || "—")],
          ["Source", item => escapeHtml(item.sourceClass)],
          ["Updated", item => escapeHtml(item.updatedAt)],
          ["Path", item => escapeHtml(item.inputAbsPath)]
      ], "Queue state will appear here once items move beyond discovery.")}
    </section>`;
}

function renderReview(items) {
    return `<section class="panel">
      ${renderTable(items, [
          ["State", item => pill(item.status)],
          ["File", item => escapeHtml(item.originalFilename)],
          ["Profile", item => escapeHtml(item.profileId || "—")],
          ["Output", item => escapeHtml(item.outputFilename || "pending output name")],
          ["Review", item => `Approve: <code>POST /api/encoding/items/${escapeHtml(item.id)}/approve</code><br />Reject: <code>POST /api/encoding/items/${escapeHtml(item.id)}/reject</code>`]
      ], "Nothing is ready for review yet.")}
    </section>`;
}

function renderHistory(items) {
    return `<section class="panel">
      ${renderTable(items, [
          ["State", item => pill(item.status)],
          ["File", item => escapeHtml(item.originalFilename)],
          ["Profile", item => escapeHtml(item.profileId || "—")],
          ["Updated", item => escapeHtml(item.updatedAt)],
          ["Notes", item => escapeHtml(item.reviewNotes || "—")]
      ], "No historical items yet.")}
    </section>`;
}

function renderSettings(paths, profiles) {
    return `<section class="split">
      <div class="panel stack">
        <strong>Directory Contract</strong>
        ${renderKeyValue([
            ["Handoff Root", paths.handoffRoot],
            ["Internal Root", paths.internalRoot],
            ["Inbox", paths.inbox],
            ["Outbox", paths.outbox],
            ["Pending", paths.pending],
            ["Working", paths.working],
            ["Encoded", paths.encoded],
            ["Review", paths.review],
            ["Rejected", paths.rejected],
            ["Failed", paths.failed]
        ])}
      </div>
      <div class="panel stack">
        <strong>Profiles</strong>
        ${profiles.map(profile => `<div class="note"><strong>${escapeHtml(profile.id)}</strong><br />${escapeHtml(profile.label)}</div>`).join("")}
      </div>
    </section>`;
}

function renderTable(items, columns, emptyMessage) {
    if (!items.length) {
        return `<div class="empty">${escapeHtml(emptyMessage)}</div>`;
    }

    return `<table>
      <thead>
        <tr>${columns.map(([label]) => `<th>${escapeHtml(label)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${items.map(item => `
          <tr>${columns.map(([, render]) => `<td>${render(item)}</td>`).join("")}</tr>
        `).join("")}
      </tbody>
    </table>`;
}

function renderKeyValue(entries) {
    return entries.map(([key, value]) => `
      <div class="kv">
        <div class="k">${escapeHtml(key)}</div>
        <div>${escapeHtml(String(value || "—"))}</div>
      </div>
    `).join("");
}

function pill(value) {
    return `<span class="pill">${escapeHtml(String(value || "unknown"))}</span>`;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
