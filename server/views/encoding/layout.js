const { escapeHtml } = require("./helpers");
const { getAppMeta } = require("./app-meta");

module.exports = function renderPage({ title, heading, description, state, body, autoRefreshMs = 0 }) {
    const appMeta = getAppMeta();

    const nav = [
        ["Pending", "/encoding/pending"],
        ["Setup", "/encoding/setup"],
        ["Queue", "/encoding/queue"],
        ["Review", "/encoding/review"],
        ["History", "/encoding/history"],
        ["Logs", "/encoding/logs"],
        ["Settings", "/encoding/settings"]
    ];

    const cards = [
        ["Pending", state.counts.pending, "/encoding/pending"],
        ["Encoding", state.counts.encoding, "/encoding/queue"],
        ["Queued", state.counts.queued, "/encoding/queue"],
        ["Review", state.counts.review, "/encoding/review"],
        ["Approved", state.counts.approved, "/encoding/history"]
    ];

    return `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Encoder · ${escapeHtml(title)}</title>
  <link rel="icon" type="image/png" href="/assets/icon.png" />
  <link rel="apple-touch-icon" href="/assets/icon.png" />
  <link rel="stylesheet" type="text/css" href="/shared/semantic/semantic.min.css" />
  <style>
    :root {
      --main-bg-color: #112924;
      --secondary-bg-color: #2f6f60;
    }

    body {
      background-color: var(--main-bg-color);
    }

    #main {
      position: relative;
      min-height: 100%;
      background-image: linear-gradient(160deg, var(--secondary-bg-color), var(--main-bg-color));
      padding-top: 8px;
    }

    .ui.segment.encoder-sticky-header {
      position: sticky;
      top: 0;
      z-index: 20;
      background: rgba(27, 28, 29, 0.96);
      padding-bottom: 0 !important;
    }

    .ui.menu.encoder-fixed-nav {
      color: rgba(255, 255, 255, 0.9) !important;
      background: transparent !important;
      backdrop-filter: blur(4px);
      margin: 0 !important;
    }

    .ui.inverted.secondary.menu.encoder-fixed-nav .item {
      color: rgba(255, 255, 255, 0.9) !important;
    }

    .ui.inverted.secondary.menu.encoder-fixed-nav .item:hover,
    .ui.inverted.secondary.menu.encoder-fixed-nav .active.item {
      color: #ffffff !important;
    }

    .segment.inverted.charcoal {
      border: 1px solid rgba(255, 255, 255, 0.2) !important;
      background: rgba(255, 255, 255, 0.055) !important;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 10px 28px rgba(0, 0, 0, 0.22) !important;
    }

    .encoding-metdata-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      column-gap: 1.25rem;
      row-gap: 0.9rem;
    }


    .encoder-settings-panel input[type="number"],
    .encoder-settings-panel input[type="text"],
    .encoder-settings-panel select {
      background: rgba(255, 255, 255, 0.08) !important;
      color: #f5f7f6 !important;
      border: 1px solid rgba(255, 255, 255, 0.16) !important;
      box-shadow: none !important;
    }

    .encoder-settings-panel .ui.basic.label {
      background: rgba(255, 255, 255, 0.08) !important;
      color: rgba(255, 255, 255, 0.8) !important;
      border-color: rgba(255, 255, 255, 0.16) !important;
    }

    .encoder-settings-panel [data-settings-control] {
      border-radius: 0.28571429rem;
      transition: background-color 120ms ease, box-shadow 120ms ease;
    }

    .encoder-settings-panel [data-settings-control].encoder-setting-dirty {
      background: rgba(242, 113, 28, 0.08);
      box-shadow: inset 0 0 0 1px rgba(242, 113, 28, 0.45);
    }



   .video-box {
      overflow: hidden;
      padding-top: 56.25%; /* 16:9*/
      position: relative;
   }

   .video-box iframe, .video-box video, .video-box .video-fill {
      border: 0;
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      padding-bottom: 8px;
   }

   .encoder-setup-compact-player {
      overflow: hidden;
   }

   .encoder-setup-compact-player video {
      display: block;
      width: 100%;
   }

   .encoder-setup-expanded-player {
      margin-bottom: 1rem;
   }

   .encoder-setup-expanded-player[hidden] {
      display: none !important;
   }

  </style>
</head>
<body>
<div id="main">
  <div class="ui inverted segments container">
    <section class="ui segment encoder-sticky-header">
      <h1 class="ui header">
        <i class="file video icon"></i>
        <div class="content">${escapeHtml(heading)}
          <p class="sub header">${escapeHtml(description)}</p>
        </div>
      </h1>
      <div class="ui inverted secondary pointing menu encoder-fixed-nav">
        ${nav.map(([label, href]) => `<a class="item" href="${href}">${escapeHtml(label)}</a>`).join("")}
      </div>
    </section>
    <section class="ui segment">
      <div class="ui stackable five column grid">
        ${cards.map(([label, value, href]) => `
          <div class="column">
              <a class="ui inverted grey raised card" href="${href}">
                <div class="content">
                  <h2 class="header">
                    <div class="meta">${escapeHtml(label)}</div>
                    <div>${escapeHtml(String(value))}</div>
                  </h2>
                </div>
              </a>
          </div>
        `).join("")}
      </div>
    </section>
    ${body}
    <section class="ui basic fitted segment" style="padding-top: 0; text-align: right;">
      <span class="ui small disabled grey text">${escapeHtml(appMeta.versionLabel)}</span>
    </section>
  </div>

  <script src="/shared/jquery/jquery.js"></script>
  <script src="/shared/semantic/semantic.min.js"></script>
  <script>
    const AUTO_REFRESH_MS = ${Number(autoRefreshMs || 0)};
    if (AUTO_REFRESH_MS > 0) {
      window.setTimeout(function () {
        window.location.reload();
      }, AUTO_REFRESH_MS);
    }

    window.reloadSetupProfile = async function (form) {
      if (!(form instanceof HTMLFormElement)) return;
      const root = document.getElementById("encoding-setup-root");
      if (!root) {
        form.submit();
        return;
      }

      const formData = new FormData(form);
      const searchParams = new URLSearchParams();
      for (const [key, value] of formData.entries()) {
        searchParams.set(key, value);
      }

      try {
        const response = await fetch(form.action + "?" + searchParams.toString(), {
          method: "GET",
          headers: {
            "Accept": "text/html"
          }
        });

        if (!response.ok) {
          throw new Error("Failed to refresh setup profile.");
        }

        const html = await response.text();
        const wrapper = document.createElement("div");
        wrapper.innerHTML = html;
        const nextRoot = wrapper.querySelector("#encoding-setup-root");

        if (!nextRoot) {
          throw new Error("Setup fragment was missing its root container.");
        }

        root.replaceWith(nextRoot);
      }
      catch (_error) {
        window.location.href = "/encoding/setup?" + searchParams.toString();
      }
    };

    window.updateSourceActionSwitch = function (checkbox) {
      const root = checkbox && checkbox.closest ? checkbox.closest("section") : null;
      const target = root ? root.querySelector("[data-source-action-input]") : document.querySelector("[data-source-action-input]");
      if (!target) return;
      target.value = checkbox && checkbox.checked ? "retain" : "delete";
    };

    window.expandSetupSourcePlayer = function (compactVideo) {
      if (!(compactVideo instanceof HTMLVideoElement)) return;
      const root = compactVideo.closest("#encoding-setup-root");
      if (!root) return;

      const expandedSection = root.querySelector("[data-setup-expanded-player]");
      const expandedVideo = root.querySelector("[data-setup-expanded-video]");
      if (!(expandedSection instanceof HTMLElement) || !(expandedVideo instanceof HTMLVideoElement)) {
        return;
      }

      expandedSection.hidden = false;
      window.setSetupVideoPlayerPreference(root, true);

      try {
        if (Number.isFinite(compactVideo.currentTime)) {
          expandedVideo.currentTime = compactVideo.currentTime;
        }
      }
      catch (_error) {}

      compactVideo.pause();
      const playPromise = expandedVideo.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(function () {});
      }

      expandedSection.scrollIntoView({
        behavior: "smooth",
        block: "nearest"
      });
    };

    window.collapseSetupSourcePlayer = function (button) {
      const root = button && button.closest ? button.closest("#encoding-setup-root") : document.getElementById("encoding-setup-root");
      if (!root) return;

      const expandedSection = root.querySelector("[data-setup-expanded-player]");
      const expandedVideo = root.querySelector("[data-setup-expanded-video]");
      if (expandedVideo instanceof HTMLVideoElement) {
        expandedVideo.pause();
      }
      if (expandedSection instanceof HTMLElement) {
        expandedSection.hidden = true;
      }
      window.setSetupVideoPlayerPreference(root, false);
    };

    window.setSetupVideoPlayerPreference = function (root, enabled) {
      const setupRoot = root instanceof HTMLElement ? root : document.getElementById("encoding-setup-root");
      if (!setupRoot) return;

      const input = setupRoot.querySelector("[data-setup-show-video-input]");
      if (input instanceof HTMLInputElement) {
        input.value = enabled ? "true" : "false";
      }
    };

    window.syncSetupQueueToFrontPreference = function (checkbox) {
      const root = checkbox && checkbox.closest ? checkbox.closest("#encoding-setup-root") : document.getElementById("encoding-setup-root");
      if (!root) return;

      const input = root.querySelector("[data-setup-queue-front-input]");
      if (input instanceof HTMLInputElement) {
        input.value = checkbox && checkbox.checked ? "true" : "false";
      }
    };

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
</div>
</body>
</html>`;
};
