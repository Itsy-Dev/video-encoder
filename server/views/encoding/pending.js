const { escapeHtml, formatBytes, pill, renderDiscardButton, renderTable } = require("./helpers");

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
        ["Source", item => escapeHtml(item.inboxRelativeDir || "--"), { width: "two" }],
        ["Actions", item => `
          <div class="ui mini icon buttons">
            <a class="ui compact basic icon button" href="/encoding/setup?id=${encodeURIComponent(item.id)}" title="Open setup" aria-label="Open setup">
              <i class="large fitted orange cog icon"></i>
            </a>
            ${renderDiscardButton(item, { basic: true, compact: true, iconOnly: true })}
          </div>
        `, { width: "one", align: "center" }],
        ["State", item => pill(item.status), { width: "one" }],
        ["File", item => escapeHtml(item.originalFilename)],
        ["Size", item => escapeHtml(formatBytes(item && item.sourceMetadata ? item.sourceMetadata.fileSizeBytes : null)), { width: "one", align: "right" }],
      ], "No pending items yet. Scan the inbox or drop test videos into inbox with or without subdirectories to start the flow.")}
    </section>`;
};
