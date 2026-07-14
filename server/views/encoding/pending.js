const { escapeHtml, formatBytes, pill, renderTable } = require("./helpers");

module.exports = function renderPending(items) {
  return `<section class="ui segment">
      <div class="ui inverted divider"></div>
      <div>
        <h4 class="ui inverted header">
          <i class="folder open icon"></i>
          <div class="content">Pending Files</div>
        </h4>
        <div class="actions">
          <form method="post" action="/api/encoding/scan" data-api-form>
            <button type="submit" class="ui primary small compact icon button">
              <i class="sync alternate icon"></i>
              Scan Inbox
            </button>
          </form>
        </div>
      </div>
      ${renderTable(items, [
        ["State", item => pill(item.status), { width: "one" }],
        ["Actions", item => `
          <div class="ui tiny icon buttons">
            <a class="ui compact orange button" href="/encoding/setup?id=${encodeURIComponent(item.id)}" title="Open setup" aria-label="Open setup">
              <i class="cog icon"></i>
            </a>
            <form method="post" action="/api/encoding/items/${encodeURIComponent(item.id)}/discard" data-api-form data-confirm="Discard this source file? It will be moved to outbox/_sources/discarded and removed from the active encoder flow.">
              <button type="submit" class="ui compact red button" title="Discard source" aria-label="Discard source">
                <i class="trash alternate outline icon"></i>
              </button>
            </form>
          </div>
        `, { width: "two", align: "center" }],
        ["Size", item => escapeHtml(formatBytes(item && item.sourceMetadata ? item.sourceMetadata.fileSizeBytes : null)), { width: "one", align: "right" }],
        ["File", item => escapeHtml(item.originalFilename)],
        ["Source", item => pill(item.inboxRelativeDir || "/"), { width: "two" }],
      ], "No pending items yet. Scan the inbox or drop test videos into inbox with or without subdirectories to start the flow.")}
    </section>`;
};
