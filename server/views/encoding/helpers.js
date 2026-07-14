function renderTable(items, columns, emptyMessage) {
    if (!items.length) {
        return `<div class="empty">${escapeHtml(emptyMessage)}</div>`;
    }

    return `<table>
      <thead>
        <tr>${columns.map(([label]) => `<th>${escapeHtml(label)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${items.map(item => `
          <tr>${columns.map(([, render]) => `<td>${render(item)}</td>`).join("")}</tr>
        `).join("")}
      </tbody>
    </table>`;
}

function renderKeyValue(entries) {
    return entries.map(([key, value]) => `
      <div class="kv">
        <div class="k">${escapeHtml(key)}</div>
        <div>${escapeHtml(String(value || "—"))}</div>
      </div>
    `).join("");
}

function pill(value) {
    return `<span class="pill">${escapeHtml(String(value || "unknown"))}</span>`;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function buildOutboxDisplayPath(item) {
    const dir = String(item && item.inboxRelativeDir || "").trim();
    return dir ? `/outbox/${dir}` : "/outbox";
}

function renderQueueAction(item) {
    if (item.status === "queued") {
        return `<div class="hint">Waiting for worker pickup</div>`;
    }

    if (item.status === "encoding") {
        return `<div class="hint">Active encode</div>`;
    }

    if (item.status === "paused") {
        return `<div class="hint">Paused</div>`;
    }

    if (item.status === "review") {
        return `<a href="/encoding/review">Open review</a>`;
    }

    return "—";
}

function renderReviewActions(item) {
    return `<div class="form-stack">
      <form method="post" action="/api/encoding/items/${encodeURIComponent(item.id)}/approve" data-api-form>
        <input type="hidden" name="reviewer" value="operator" />
        <button type="submit">Approve To Outbox</button>
      </form>
      <form method="post" action="/api/encoding/items/${encodeURIComponent(item.id)}/reject" data-api-form>
        <input type="hidden" name="reviewer" value="operator" />
        <button type="submit" class="button-bad">Reject</button>
      </form>
    </div>`;
}

function statefulValue(state, propertyPath) {
    const value = String(propertyPath || "")
        .split(".")
        .filter(Boolean)
        .reduce((current, key) => current && current[key], state);

    return value == null || value === "" ? "—" : String(value);
}

function formatProgress(progress) {
    if (!progress) return "—";

    const parts = [];
    if (progress.state) parts.push(`state ${progress.state}`);
    if (progress.frame != null) parts.push(`frame ${progress.frame}`);
    if (progress.fps != null) parts.push(`fps ${progress.fps}`);
    if (progress.outTimeMs != null) parts.push(`time ${progress.outTimeMs}ms`);
    if (progress.speed) parts.push(`speed ${progress.speed}`);
    return parts.length ? parts.join(", ") : "—";
}

module.exports = {
    buildOutboxDisplayPath,
    escapeHtml,
    formatProgress,
    pill,
    renderKeyValue,
    renderQueueAction,
    renderReviewActions,
    renderTable,
    statefulValue
};
