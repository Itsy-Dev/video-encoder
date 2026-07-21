const { escapeHtml, formatDateTime } = require("./helpers");

module.exports = function renderReview(items) {
    const rows = Array.isArray(items) ? items : [];

    if (!rows.length) {
        return `<section class="ui inverted segment">
          <div class="ui placeholder segment">
            <div class="ui icon header">
              <i class="check circle outline icon"></i>
              Nothing is ready for review yet.
            </div>
          </div>
        </section>`;
    }

    return `<section class="ui inverted segment">
      <table class="ui striped celled inverted compact small table">
        <thead>
          <tr>
            <th class="one wide center aligned">Action</th>
            <th class="one wide">Source</th>
            <th class="six wide">File</th>
            <th class="two wide">Profile</th>
            <th class="three wide right aligned">Requested</th>
            <th class="three wide right aligned">Completed</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(renderRow).join("")}
        </tbody>
      </table>
    </section>`;
};

function renderRow(item) {
  const displayFilename = item && item.outputFilename
    ? item.outputFilename
    : item && item.originalFilename
      ? item.originalFilename
      : "—";
  return `<tr>
      <td class="center aligned">
        <a class="ui mini compact basic icon button" href="/encoding/review/item?id=${encodeURIComponent(item.id)}" title="Open review item" aria-label="Open review item">
          <i class="large fitted inverted violet eye icon"></i>
        </a>
      </td>
      <td>${renderSourceLabel(item)}</td>
      <td title="${escapeHtml(item.outputAbsPath || item.inputAbsPath || "")}">
        <div>${escapeHtml(displayFilename)}</div>
      </td>
      <td>${escapeHtml(item.profileId || "—")}</td>
      <td class="right aligned">${escapeHtml(formatDateTime(item.queuedAt || item.requestedAt || item.createdAt))}</td>
      <td class="right aligned">${escapeHtml(formatDateTime(item.completedAt || item.updatedAt))}</td>
    </tr>`;
}

function renderSourceLabel(item) {
    const value = item && item.inboxRelativeDir ? item.inboxRelativeDir : "";
    return `<span class="ui text">/${escapeHtml(value)}</span>`;
}
