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
        ["Encoding", state.counts.encoding],
        ["Queued", state.counts.queued],
        ["Review", state.counts.review],
        ["Approved", state.counts.approved]
    ];

    return `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Encoder · ${escapeHtml(title)}</title>
  <link rel="stylesheet" type="text/css" href="/shared/semantic/semantic.min.css" />
  <style>
    :root {
      --encoder-accent: #2f6f60;
      --encoder-bg: #112924;
    }
    body {
      background:
        linear-gradient(180deg, var(--encoder-accent) 0%, var(--encoder-bg) 65%);
      color: #243238;
    }
  </style>
</head>
<body>
  <div class="ui inverted segments container">
    <section class="ui segment">
      <h1 class="ui header">
        <i class="file video icon"></i>
        <div class="content">${escapeHtml(heading)}
          <p class="sub header">${escapeHtml(description)}</p>
        </div>
      </h1>
      <div class="ui inverted secondary menu">
        ${nav.map(([label, href]) => `<a class="item" href="${href}">${escapeHtml(label)}</a>`).join("")}
      </div>
    </section>
    <section class="ui segment">
      <div class="ui stackable five column grid">
        ${cards.map(([label, value]) => `
          <div class="column">
            <div class="ui inverted grey raised card">
              <div class="content">
                <h2 class="header">
                    <div class="meta">${escapeHtml(label)}</div>
                    <div class="">${escapeHtml(String(value))}</div>
                </h2>
              </div>
            </div>
          </div>
        `).join("")}
      </div>
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

      const confirmMessage = form.getAttribute("data-confirm");
      if (confirmMessage && !window.confirm(confirmMessage)) {
        event.preventDefault();
        return;
      }

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
