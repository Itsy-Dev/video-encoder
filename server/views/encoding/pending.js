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
        ["Size", item => escapeHtml(formatBytes(item && item.sourceMetadata ? item.sourceMetadata.fileSizeBytes : null)), { width: "one", align: "right" }],
        ["File", item => escapeHtml(item.originalFilename)],
        ["Source", item => pill(item.inboxRelativeDir || "/"), { width: "two" }],
        ["Actions", item => `<a class="ui mini compact orange icon button" href="/encoding/setup?id=${encodeURIComponent(item.id)}" title="Open setup" aria-label="Open setup"><i class="cog icon"></i></a>`, { width: "two", align: "center" }],
      ], "No pending items yet. Scan the inbox or drop test videos into inbox with or without subdirectories to start the flow.")}
    </section>`;
};
