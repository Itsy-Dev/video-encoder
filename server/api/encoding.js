const path = require("path");

const EncodingService = require("../modules/encoding/encoding.service");
const { getEncoderPaths } = require("../modules/filesystem/handoff-paths");

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
            body: renderPendingTable(state.actionableItems)
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

function renderPage({ title, heading, description, state, body, autoRefreshMs = 0 }) {
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
    .button-warn { background: var(--warn); }
    .button-inline {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
    }
    .form-stack {
      display: grid;
      gap: 12px;
    }
    .form-inline {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
    }
    label {
      display: grid;
      gap: 6px;
      font-size: 14px;
      color: var(--muted);
    }
    input, select, textarea {
      width: 100%;
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: white;
      color: var(--ink);
      font: inherit;
    }
    textarea {
      min-height: 90px;
      resize: vertical;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .hint {
      font-size: 12px;
      color: var(--muted);
    }
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
  <script>
    const AUTO_REFRESH_MS = ${Number(autoRefreshMs || 0)};
    if (AUTO_REFRESH_MS > 0) {
      window.setTimeout(function () {
        window.location.reload();
      }, AUTO_REFRESH_MS);
    }

    document.addEventListener("submit", async function (event) {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (!form.hasAttribute("data-api-form")) return;

      event.preventDefault();

      const submitter = event.submitter instanceof HTMLElement ? event.submitter : null;
      const submitText = submitter ? submitter.textContent : "";
      if (submitter) {
        submitter.disabled = true;
        submitter.textContent = "Working...";
      }

      try {
        const payload = {};
        const formData = new FormData(form);
        for (const [key, value] of formData.entries()) {
          payload[key] = value;
        }

        const response = await fetch(form.action, {
          method: form.method || "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || ("Request failed with status " + response.status));
        }

        window.location.reload();
      }
      catch (error) {
        window.alert(error && error.message ? error.message : "Request failed");
      }
      finally {
        if (submitter) {
          submitter.disabled = false;
          submitter.textContent = submitText;
        }
      }
    });
  </script>
</body>
</html>`;
}

function renderPendingTable(items) {
    return `<section class="panel">
      <div class="toolbar">
        <div>
          <strong>Inbox Discovery</strong>
          <p>Scan discovers stable video files anywhere under <code>/inbox</code>, remembers the file's optional relative subdirectory, and ingests it into internal pending storage.</p>
        </div>
        <div class="actions">
          <form method="post" action="/api/encoding/scan" data-api-form>
            <button type="submit">Scan Inbox</button>
          </form>
          <a class="button button-inline" href="/encoding/setup">Open Setup</a>
        </div>
      </div>
      ${renderTable(items, [
          ["State", item => pill(item.status)],
          ["File", item => escapeHtml(item.originalFilename)],
          ["Reason", item => escapeHtml(item.lastError || "Ready to configure")],
          ["Inbox Dir", item => escapeHtml(item.inboxRelativeDir || "/")],
          ["Requested Profile", item => escapeHtml(item.requestedProfileId || "browser_compatibility")],
          ["Item ID", item => escapeHtml(item.id)],
          ["Action", item => `<div class="actions"><a class="button button-inline" href="/encoding/setup?id=${encodeURIComponent(item.id)}">Configure</a></div>`]
      ], "No pending items yet. Scan the inbox or drop test videos into inbox with or without subdirectories to start the flow.")}
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
          <p>Choose the profile and confirm the preserved inbox subdirectory before the item enters the automated single-worker queue.</p>
        </div>
        ${renderKeyValue([
            ["Item ID", item.id],
            ["Current State", item.status],
            ["Inbox Relative Dir", item.inboxRelativeDir || "/"],
            ["Inbox Relative Path", item.inboxRelativePath || item.originalFilename],
            ["Selected Profile", item.profileId || "not set"],
            ["Inbox Input Path", item.inboxInputAbsPath],
            ["Managed Input Path", item.inputAbsPath],
            ["Encoded Output Path", item.encodedOutputAbsPath || "not generated"],
            ["Output Folder", buildOutboxDisplayPath(item)]
        ])}
        <form class="form-stack" method="post" action="/api/encoding/items/${encodeURIComponent(item.id)}/queue" data-api-form>
          <label>
            Profile
            <select name="profileId">
              ${profiles.map(profile => `<option value="${escapeHtml(profile.id)}"${profile.id === (item.profileId || item.requestedProfileId || "browser_compatibility") ? " selected" : ""}>${escapeHtml(profile.label)} (${escapeHtml(profile.id)})</option>`).join("")}
            </select>
          </label>
          <label>
            Inbox Relative Dir
            <input value="${escapeHtml(item.inboxRelativeDir || "")}" disabled />
          </label>
          <input type="hidden" name="inboxRelativeDir" value="${escapeHtml(item.inboxRelativeDir || "")}" />
          <div class="actions">
            <button type="submit">Queue Item</button>
            <a class="button button-secondary button-inline" href="/encoding/pending">Back to Pending</a>
          </div>
        </form>
        <div class="note">Scan ingests the video from inbox into internal pending storage first, preserving its optional subdirectory for outbox routing. Once queued, the worker picks it up automatically when it reaches the front.</div>
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

function renderQueue(state) {
    const items = state.items || [];
    const rows = items.filter(item => ["ready", "queued", "encoding", "paused", "completed", "review"].includes(item.status));
    return `<section class="panel">
      <div class="note" style="margin-bottom: 16px;">
        <strong>Worker</strong><br />
        Active Item: ${escapeHtml(statefulValue(state, "worker.activeItemId"))}<br />
        Started: ${escapeHtml(statefulValue(state, "worker.activeStartedAt"))}<br />
        Progress: ${escapeHtml(formatProgress(state && state.worker ? state.worker.activeProgress : null))}<br />
        <div class="actions" style="margin-top: 12px;">
          <form method="post" action="/api/encoding/control/wake" data-api-form>
            <button type="submit">Wake Queue</button>
          </form>
          <form method="post" action="/api/encoding/control/pause" data-api-form>
            <button type="submit" class="button-warn">Pause</button>
          </form>
          <form method="post" action="/api/encoding/control/resume" data-api-form>
            <button type="submit" class="button-secondary">Resume</button>
          </form>
          <form method="post" action="/api/encoding/control/stop" data-api-form>
            <button type="submit" class="button-bad">Stop</button>
          </form>
        </div>
      </div>
      ${renderTable(rows, [
          ["State", item => pill(item.status)],
          ["File", item => escapeHtml(item.originalFilename)],
          ["Profile", item => escapeHtml(item.profileId || "—")],
          ["Inbox Dir", item => escapeHtml(item.inboxRelativeDir || "/")],
          ["Updated", item => escapeHtml(item.updatedAt)],
          ["Path", item => escapeHtml(item.inputAbsPath)],
          ["Action", item => renderQueueAction(item)]
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
          ["Outbox", item => escapeHtml(buildOutboxDisplayPath(item))],
          ["Review", item => renderReviewActions(item)]
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
          ["Outbox", item => escapeHtml(item.outboxOutputAbsPath || "—")],
          ["Last Error", item => escapeHtml(item.lastError || "—")]
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
            ["Logs", paths.logs]
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

function buildOutboxDisplayPath(item) {
    const dir = String(item && item.inboxRelativeDir || "").trim();
    return dir ? `/outbox/${dir}` : "/outbox";
}

function renderQueueAction(item) {
    if (item.status === "queued") {
        return `<div class="hint">Waiting for worker pickup</div>`;
    }

    if (item.status === "encoding") {
        return `<div class="hint">Active encode</div>`;
    }

    if (item.status === "paused") {
        return `<div class="hint">Paused</div>`;
    }

    if (item.status === "review") {
        return `<a href="/encoding/review">Open review</a>`;
    }

    return "—";
}

function renderReviewActions(item) {
    return `<div class="form-stack">
      <form method="post" action="/api/encoding/items/${encodeURIComponent(item.id)}/approve" data-api-form>
        <input type="hidden" name="reviewer" value="operator" />
        <button type="submit">Approve To Outbox</button>
      </form>
      <form method="post" action="/api/encoding/items/${encodeURIComponent(item.id)}/reject" data-api-form>
        <input type="hidden" name="reviewer" value="operator" />
        <button type="submit" class="button-bad">Reject</button>
      </form>
    </div>`;
}

function statefulValue(state, propertyPath) {
    const value = String(propertyPath || "")
        .split(".")
        .filter(Boolean)
        .reduce((current, key) => current && current[key], state);

    return value == null || value === "" ? "—" : String(value);
}

function formatProgress(progress) {
    if (!progress) return "—";

    const parts = [];
    if (progress.state) parts.push(`state ${progress.state}`);
    if (progress.frame != null) parts.push(`frame ${progress.frame}`);
    if (progress.fps != null) parts.push(`fps ${progress.fps}`);
    if (progress.outTimeMs != null) parts.push(`time ${progress.outTimeMs}ms`);
    if (progress.speed) parts.push(`speed ${progress.speed}`);
    return parts.length ? parts.join(", ") : "—";
}
