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
  <link rel="stylesheet" type="text/css" href="/shared/semantic/semantic.min.css" />
  <style>
    :root {
      --encoder-accent: #2f6f60;
      --encoder-bg: #f4f2eb;
    }
    body {
      background:
        radial-gradient(circle at top left, rgba(47,111,96,.10), transparent 30%),
        linear-gradient(180deg, #faf7f0 0%, var(--encoder-bg) 100%);
      color: #243238;
    }
    .encoder-shell {
      max-width: 1220px;
      margin: 0 auto;
      padding: 2rem 1.5rem 3rem;
    }
    .encoder-hero.ui.segment {
      border-radius: 1.5rem;
      box-shadow: 0 18px 45px rgba(36, 50, 56, 0.10);
      border: 1px solid rgba(47, 111, 96, 0.12);
      background:
        linear-gradient(135deg, rgba(47,111,96,.10), rgba(255,255,255,.95));
    }
    .encoder-eyebrow {
      text-transform: uppercase;
      letter-spacing: .18em;
      font-size: 0.78rem;
      font-weight: 700;
      color: var(--encoder-accent);
      margin-bottom: 0.75rem;
    }
    .encoder-title {
      margin: 0 0 0.5rem;
      font-size: 2.6rem;
      line-height: 1.1;
    }
    .encoder-description {
      color: rgba(36, 50, 56, 0.72);
      font-size: 1rem;
    }
    .encoder-nav.ui.menu {
      margin-top: 1.5rem;
      border-radius: 999px;
      border: 1px solid rgba(47,111,96,.12);
      box-shadow: none;
      overflow-x: auto;
    }
    .encoder-nav.ui.menu .item {
      color: #37534d;
    }
    .encoder-nav.ui.menu .item:hover {
      color: var(--encoder-accent);
    }
    .encoder-cards {
      margin: 1.5rem 0;
    }
    .encoder-stat.ui.segment {
      border-radius: 1.2rem;
      box-shadow: 0 10px 28px rgba(36, 50, 56, 0.08);
      border: 1px solid rgba(47,111,96,.10);
    }
    .encoder-stat-label {
      font-size: 0.78rem;
      letter-spacing: .12em;
      text-transform: uppercase;
      color: rgba(36, 50, 56, 0.6);
      margin-bottom: 0.5rem;
    }
    .encoder-stat-value {
      font-size: 2rem;
      font-weight: 700;
      color: #243238;
    }
    .encoder-panel.ui.segment {
      border-radius: 1.2rem;
      box-shadow: 0 14px 36px rgba(36, 50, 56, 0.08);
      border: 1px solid rgba(47,111,96,.10);
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      align-items: center;
      justify-content: space-between;
    }
    .button-inline {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
    }
    .form-stack {
      display: grid;
      gap: 0.9rem;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.65rem;
    }
    .split {
      display: grid;
      grid-template-columns: 1.2fr .8fr;
      gap: 1.5rem;
    }
    .stack { display: grid; gap: 12px; }
    .ui.table {
      border-radius: 1rem;
      overflow: hidden;
    }
    .ui.table thead th {
      background: #eef4f2;
      color: #49625d;
    }
    .ui.label {
      background: #e0ece9;
      color: #2f6f60;
    }
    .ui.message.encoder-note {
      border-radius: 1rem;
      box-shadow: none;
      border: 1px solid rgba(47,111,96,.10);
    }
    .ui.placeholder.segment {
      border-radius: 1.1rem;
    }
    code {
      background: rgba(224, 236, 233, 0.8);
      padding: 0.15rem 0.45rem;
      border-radius: 0.35rem;
    }
    .ui.form input[disabled] {
      opacity: 1;
    }
    @media (max-width: 900px) {
      .split { grid-template-columns: 1fr; }
      .encoder-title { font-size: 2rem; }
      .encoder-shell { padding: 1rem 1rem 2rem; }
    }
  </style>
</head>
<body>
  <div class="encoder-shell">
    <section class="ui segment encoder-hero">
      <div class="encoder-eyebrow">Standalone Encoder</div>
      <h1 class="encoder-title">${escapeHtml(heading)}</h1>
      <p class="encoder-description">${escapeHtml(description)}</p>
      <div class="ui secondary menu encoder-nav">
        ${nav.map(([label, href]) => `<a class="item" href="${href}">${escapeHtml(label)}</a>`).join("")}
      </div>
    </section>
    <section class="ui stackable five column grid encoder-cards">
      ${cards.map(([label, value]) => `
        <div class="column">
          <div class="ui segment encoder-stat">
            <div class="encoder-stat-label">${escapeHtml(label)}</div>
            <div class="encoder-stat-value">${escapeHtml(String(value))}</div>
          </div>
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
