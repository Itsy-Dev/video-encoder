function renderTable(items, columns, emptyMessage) {
    if (!items.length) {
        return `<div class="ui placeholder segment">
          <div class="ui icon header">
            <i class="inbox icon"></i>
            ${escapeHtml(emptyMessage)}
          </div>
        </div>`;
    }

    return `<table class="ui celled striped inverted small compact table">
      <thead>
        <tr>${columns.map(column => {
            const [label, , options = {}] = column;
            return `<th class="${escapeHtml(buildColumnClassName(options))}">${escapeHtml(label)}</th>`;
        }).join("")}</tr>
      </thead>
      <tbody>
        ${items.map(item => `
          <tr>${columns.map(column => {
            const [, render, options = {}] = column;
            return `<td class="${escapeHtml(buildColumnClassName(options))}">${render(item)}</td>`;
          }).join("")}</tr>
        `).join("")}
      </tbody>
    </table>`;
}

function renderKeyValue(entries) {
    return `<div class="ui relaxed divided list">
      ${entries.map(([key, value]) => `
        <div class="item">
          <div class="content">
            <div class="header">${escapeHtml(key)}</div>
            <div class="description"><code>${escapeHtml(String(value || "—"))}</code></div>
          </div>
        </div>
      `).join("")}
    </div>`;
}

function pill(value) {
    return `<span class="ui tiny label">${escapeHtml(String(value || "unknown"))}</span>`;
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
        return `<div class="ui tiny grey text">Waiting for worker pickup</div>`;
    }

    if (item.status === "encoding") {
        return `<div class="ui tiny green text">Active encode</div>`;
    }

    if (item.status === "paused") {
        return `<div class="ui tiny orange text">Paused</div>`;
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
        <button type="submit" class="ui green button">Approve To Outbox</button>
      </form>
      <form method="post" action="/api/encoding/items/${encodeURIComponent(item.id)}/reject" data-api-form>
        <input type="hidden" name="reviewer" value="operator" />
        <button type="submit" class="ui red button">Reject</button>
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

function formatBytes(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value < 0) {
        return "—";
    }

    if (value < 1024) return `${value} B`;

    const units = ["KB", "MB", "GB", "TB"];
    let size = value / 1024;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }

    const rounded = size >= 100 ? Math.round(size) : size >= 10 ? size.toFixed(1) : size.toFixed(2);
    return `${rounded} ${units[unitIndex]}`;
}

function buildColumnClassName(options = {}) {
    const classes = [];

    if (options.width) {
        classes.push(options.width, "wide");
    }

    if (options.align) {
        classes.push(options.align, "aligned");
    }

    return classes.join(" ").trim();
}

module.exports = {
    buildOutboxDisplayPath,
    escapeHtml,
    formatBytes,
    formatProgress,
    pill,
    renderKeyValue,
    renderQueueAction,
    renderReviewActions,
    renderTable,
    statefulValue
};
