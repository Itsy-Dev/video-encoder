const { escapeHtml, pill, renderTable } = require("./helpers");

module.exports = function renderPending(items) {
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
};
