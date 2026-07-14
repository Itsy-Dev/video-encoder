const { escapeHtml, pill, renderTable } = require("./helpers");

module.exports = function renderHistory(items) {
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
};
