const { buildOutboxDisplayPath, escapeHtml, pill, renderReviewActions, renderTable } = require("./helpers");

module.exports = function renderReview(items) {
    return `<section class="ui segment encoder-panel">
      ${renderTable(items, [
          ["State", item => pill(item.status)],
          ["File", item => escapeHtml(item.originalFilename)],
          ["Profile", item => escapeHtml(item.profileId || "—")],
          ["Output", item => escapeHtml(item.outputFilename || "pending output name")],
          ["Outbox", item => escapeHtml(buildOutboxDisplayPath(item))],
          ["Review", item => renderReviewActions(item)]
      ], "Nothing is ready for review yet.")}
    </section>`;
};
