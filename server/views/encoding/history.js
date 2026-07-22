const { buildOriginUrl } = require("../../modules/encoding/navigation");
const { escapeHtml, formatDateTime, pill } = require("./helpers");

module.exports = function renderHistory(items) {
    const rows = Array.isArray(items) ? items.slice().sort(compareHistoryItems) : [];

    if (!rows.length) {
        return `<section class="ui inverted segment">
          <div class="ui placeholder segment">
            <div class="ui icon header">
              <i class="history icon"></i>
              No historical items yet.
            </div>
          </div>
        </section>`;
    }

    return `<section class="ui inverted segment">
      <table class="ui striped celled inverted compact small table">
        <thead>
          <tr>
            <th class="one wide">Status</th>
            <th class="five wide">File</th>
            <th class="two wide">Source</th>
            <th class="two wide">Profile</th>
            <th class="two wide right aligned">Completed</th>
            <th class="two wide right aligned">Updated</th>
            <th class="two wide center aligned">Action</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(renderRow).join("")}
        </tbody>
      </table>
    </section>`;
};

function renderRow(item) {
    const status = String(item && item.status || "").toLowerCase();
    const detail = historyDetail(item, status);

    return `<tr>
      <td>${pill(status || "unknown")}</td>
      <td title="${escapeHtml(item.outputAbsPath || item.inputAbsPath || "")}">
        <div>${escapeHtml(item.originalFilename || "—")}</div>
        <span class="ui grey text">${escapeHtml(detail)}</span>
      </td>
      <td>${renderSourceLabel(item)}</td>
      <td>${escapeHtml(item.profileId || "—")}</td>
      <td class="right aligned">${escapeHtml(formatDateTime(item.completedAt || item.approvedAt || item.rejectedAt || item.updatedAt))}</td>
      <td class="right aligned">${escapeHtml(formatDateTime(item.updatedAt))}</td>
      <td class="center aligned">${renderAction(item, status)}</td>
    </tr>`;
}

function renderSourceLabel(item) {
    const value = item && item.inboxRelativeDir ? item.inboxRelativeDir : "/";
    return `<span class="ui grey small label">${escapeHtml(value)}</span>`;
}

function renderAction(item, status) {
    if (["review", "rejected", "exported", "approved"].includes(status)) {
        return `<a class="ui small basic compact icon button" href="${escapeHtml(buildOriginUrl("/encoding/review/item", { id: item.id, source: "history" }))}" title="Open detail" aria-label="Open detail">
          <i class="blue eye icon"></i>
        </a>`;
    }

    if (["rejected", "failed", "cancelled"].includes(status)) {
        return `<div class="ui mini basic buttons">
          <a class="ui compact icon button" href="${escapeHtml(buildOriginUrl("/encoding/setup", { id: item.id, source: "history" }))}" title="Open setup" aria-label="Open setup">
            <i class="teal redo icon"></i>
          </a>
        </div>`;
    }

    if (status === "discarded") {
        return "—";
    }

    return "—";
}

function historyDetail(item, status) {
    if (status === "exported" || status === "approved") {
        return "Exported to outbox";
    }

    if (status === "discarded") {
        return "Discarded from active flow";
    }

    return item.lastError || "—";
}

function compareHistoryItems(left, right) {
    return compareDates(
        right.updatedAt || right.completedAt || right.approvedAt || right.rejectedAt || right.createdAt,
        left.updatedAt || left.completedAt || left.approvedAt || left.rejectedAt || left.createdAt
    );
}

function compareDates(left, right) {
    const leftMs = new Date(left || 0).getTime();
    const rightMs = new Date(right || 0).getTime();
    if (leftMs === rightMs) return 0;
    return leftMs < rightMs ? -1 : 1;
}
