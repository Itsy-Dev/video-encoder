const { escapeHtml } = require("./helpers");

module.exports = function renderPage({ title, heading, description, state, body, autoRefreshMs = 0 }) {
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
};
