function renderTable(items, columns, emptyMessage) {
    if (!items.length) {
        return `<div class="ui placeholder segment">
          <div class="ui icon header">
            <i class="inbox icon"></i>
            ${escapeHtml(emptyMessage)}
          </div>
        </div>`;
    }

    return `<table class="ui selectable celled striped inverted small compact table">
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
    return `<div class="ui inverted relaxed divided list">
      ${entries.map(([key, value]) => `
        <div class="item">
          <div class="content">
            <div class="header">${escapeHtml(key)}</div>
            <div class="description">${escapeHtml(String(value || "—"))}</div>
          </div>
        </div>
      `).join("")}
    </div>`;
}

function pill(value) {
    const text = String(value || "unknown");
    const color = statusPillColor(text);
    return `<span class="ui tiny ${escapeHtml(color)} label">${escapeHtml(text)}</span>`;
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

function canDiscardItem(item) {
    const status = String(item && item.status || "");
    return ["pending", "queued", "rejected", "failed", "cancelled"].includes(status);
}

function getDiscardBlockedReason(item) {
    const status = String(item && item.status || "");

    if (status === "encoding") {
        return "Cannot discard while encoding.";
    }

    if (status === "paused") {
        return "Cannot discard while paused.";
    }

    if (status === "review") {
        return "Review items must be approved or rejected.";
    }

    if (status === "approved" || status === "exported") {
        return "Already approved/exported.";
    }

    if (status === "discarded") {
        return "Already discarded.";
    }

    return "Discard is not available for this item state.";
}

function renderDiscardButton(item, { basic = false, compact = false, iconOnly = false } = {}) {
    const allowed = canDiscardItem(item);
    const buttonClasses = [
        "ui",
        compact ? "compact" : "",
        basic ? "basic" : "",
        iconOnly ? "icon" : "",
        "button"
    ].filter(Boolean).join(" ");
    const title = allowed
        ? "Discard source"
        : getDiscardBlockedReason(item);
    const label = iconOnly
        ? `<i class="large red fitted trash alternate outline icon"></i>`
        : "Discard Source";

    if (!allowed) {
        return `<button type="button" class="${escapeHtml(buttonClasses)} disabled" disabled title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${label}</button>`;
    }

    return `<form method="post" action="/api/encoding/items/${encodeURIComponent(item.id)}/discard" data-api-form data-confirm="Discard this item from the active encoder flow? The source file path will remain recorded.">
      <button type="submit" class="${escapeHtml(buttonClasses)}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${label}</button>
    </form>`;
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
      <form method="post" action="/api/encoding/items/${encodeURIComponent(item.id)}/approve" data-api-form data-confirm="Approve this encode and apply the selected source handling?">
        <input type="hidden" name="reviewer" value="operator" />
        <button type="submit" class="ui green button">Approve Output</button>
      </form>
      <form method="post" action="/api/encoding/items/${encodeURIComponent(item.id)}/reject" data-api-form data-confirm="Reject this encode? The output will be moved to Outbox/rejected and the source receipt will stay available for requeue.">
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

function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.round(Number(ms || 0) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

function formatBitrate(bps) {
    const value = Number(bps || 0);
    if (!Number.isFinite(value) || value <= 0) {
        return "—";
    }

    return `${Math.round(value / 1000).toLocaleString()} kbps`;
}

function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
}

function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric"
    }).replace(/\//g, "-");
}

function formatAspectRatio(widthOrMetadata, height) {
    const metadata = widthOrMetadata && typeof widthOrMetadata === "object" && height == null
        ? widthOrMetadata
        : null;
    const displayAspectRatio = getDisplayAspectRatio(metadata);
    if (displayAspectRatio) {
        return displayAspectRatio;
    }

    const safeWidth = Number(metadata ? metadata.width : widthOrMetadata || 0);
    const safeHeight = Number(metadata ? metadata.height : height || 0);
    if (!Number.isFinite(safeWidth) || !Number.isFinite(safeHeight) || safeWidth <= 0 || safeHeight <= 0) {
        return "—";
    }

    const wholeWidth = Math.round(safeWidth);
    const wholeHeight = Math.round(safeHeight);
    const divisor = gcd(wholeWidth, wholeHeight);
    return `${wholeWidth / divisor}:${wholeHeight / divisor}`;
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

function statusPillColor(value) {
    const status = String(value || "").toLowerCase().trim().split(/\s+/)[0];

    return {
        pending: "grey",
        queued: "blue",
        encoding: "green",
        paused: "yellow",
        review: "violet",
        approved: "teal",
        exported: "teal",
        rejected: "red",
        failed: "red",
        cancelled: "grey",
        discarded: "black",
        cooldown: "brown",
        resting: "orange",
        idle: "grey"
    }[status] || "grey";
}

function gcd(left, right) {
    let a = Math.abs(Math.round(left));
    let b = Math.abs(Math.round(right));

    while (b !== 0) {
        const next = a % b;
        a = b;
        b = next;
    }

    return a || 1;
}

function getDisplayAspectRatio(metadata) {
    const probeJson = metadata && metadata.probeJson ? metadata.probeJson : null;
    const streams = Array.isArray(probeJson && probeJson.streams) ? probeJson.streams : [];
    const videoStream = streams.find(stream => stream.codec_type === "video") || null;
    const value = videoStream && videoStream.display_aspect_ratio ? String(videoStream.display_aspect_ratio).trim() : "";
    return value && value !== "0:1" ? value : null;
}

module.exports = {
    buildOutboxDisplayPath,
    canDiscardItem,
    escapeHtml,
    formatAspectRatio,
    formatBitrate,
    formatBytes,
    formatDate,
    formatDateTime,
    formatDuration,
    formatProgress,
    getDiscardBlockedReason,
    pill,
    renderDiscardButton,
    renderKeyValue,
    renderQueueAction,
    renderReviewActions,
    renderTable,
    statefulValue
};
