const { escapeHtml, formatBytes, formatDuration, pill } = require("./helpers");

const QUEUE_ROW_STATES = new Set(["encoding", "paused", "queued", "failed", "cancelled"]);

module.exports = function renderQueue(state) {
    const items = Array.isArray(state && state.items) ? state.items : [];
    const worker = state && state.worker ? state.worker : {};
    const queueRows = buildQueueRows(items, worker.activeItemId);
    const activeItem = queueRows.find(item => item.id === worker.activeItemId) || null;
    const hasQueuedWork = items.some(item => String(item && item.status || "").toLowerCase() === "queued");
    const showForceWakeButton = !activeItem && (hasQueuedWork || isCoolingDown(worker) || isResting(worker));

    return `<section class="ui inverted segment">
      ${renderActiveQueuePanel(state, activeItem, showForceWakeButton)}
      <div class="ui hidden divider"></div>
      <div class="ui inverted segment">
        <h3 class="ui inverted small header">Queued Table</h3>
        ${renderQueuedTable(queueRows)}
      </div>
    </section>`;
};

function renderActiveQueuePanel(state, activeItem, showForceWakeButton) {
    const worker = state && state.worker ? state.worker : {};
    const progress = worker.activeProgress || {};
    const safety = worker.safety || {};
    const statusState = getActiveStatusState(activeItem, worker);
    const statusDetail = getActiveStatusDetail(activeItem, worker);
    const progressPercent = calculateProgressPercent(activeItem, progress);
    const activeTitle = activeItem
        ? escapeHtml(activeItem.originalFilename)
        : "No Active Encode";
    const activePath = activeItem && activeItem.inputAbsPath
        ? escapeHtml(activeItem.inputAbsPath)
        : "Idle";

    return `<div class="ui inverted charcoal segment">
      <div class="ui stackable grid">
        <div class="eight wide column">
          <div class="ui inverted header" style="margin-bottom: 4px;">${activeTitle}</div>
          <div class="ui inverted secondary text" title="${activePath}">${activePath}</div>
        </div>
        <div class="eight wide right aligned column">
          ${renderActiveButtons(activeItem, worker, showForceWakeButton)}
        </div>
      </div>

      <div class="ui middle aligned grid">
        <div class="two wide middle aligned column">
          ${pill(statusDetail ? `${statusState} ${statusDetail}` : statusState)}
        </div>
        <div class="fourteen wide middle aligned column">
          <div class="ui ${escapeHtml(progressColor(statusState))} inverted small progress" style="margin: 0;" data-percent="${escapeHtml(String(Math.round(progressPercent)))}">
            <div class="bar" style="width: ${escapeHtml(String(Math.max(0, Math.min(100, progressPercent))))}%;">
              <div class="progress">${escapeHtml(progressPercent ? `${Math.round(progressPercent)}%` : "")}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="ui eight column inverted stackable compact grid" style="margin-top: 4px;">
        ${renderMetric("Active Time", formatElapsed(worker.activeStartedAt || (activeItem && activeItem.encodingStartedAt)))}
        ${renderMetric("Paused Time", formatElapsed(activeItem && activeItem.pausedAt))}
        ${renderMetric("Remaining", formatRemaining(calculateRemainingMs(activeItem, progress)))}
        ${renderMetric("Speed", progress.speed || "—")}
        ${renderMetric("FPS", progress.fps == null ? "—" : progress.fps)}
        ${renderMetric("Frame", progress.frame == null ? "—" : progress.frame)}
        ${renderMetric("Output Size", progress.totalSizeBytes == null ? "—" : formatBytes(progress.totalSizeBytes))}
        ${renderMetric("Estimated Size", formatEstimatedSize(progressPercent, progress.totalSizeBytes))}
      </div>
    </div>`;
}

function renderActiveButtons(activeItem, worker, showForceWakeButton) {
    if (showForceWakeButton) {
        return `<form method="post" action="/api/encoding/control/wake" data-api-form>
          <button type="submit" class="ui small compact inverted secondary button">
            <i class="green play icon"></i>
            <span class="ui green text">Force Wake</span>
          </button>
        </form>`;
    }

    if (!activeItem) {
        return "";
    }

    const isPaused = String(activeItem.status || "").toLowerCase() === "paused";
    const pauseAction = isPaused ? "resume" : "pause";
    const pauseIcon = isPaused ? "play" : "pause";
    const pauseLabel = isPaused ? "Resume" : "Pause";
    const pauseColor = isPaused ? "blue" : "grey";

    return `<div class="ui small compact buttons">
      <form method="post" action="/api/encoding/control/${pauseAction}" data-api-form style="display: inline-block;">
        <button type="submit" class="ui compact inverted secondary button">
          <i class="inverted ${escapeHtml(pauseColor)} ${escapeHtml(pauseIcon)} icon"></i>
          <span class="ui inverted ${escapeHtml(pauseColor)} text">${escapeHtml(pauseLabel)}</span>
        </button>
      </form>
      <form method="post" action="/api/encoding/control/stop" data-api-form data-confirm="Stop the active encode? The current encoded output will be discarded and the source item will need to be queued again." style="display: inline-block;">
        <button type="submit" class="ui compact inverted secondary button">
          <i class="inverted red stop icon"></i>
          <span class="ui inverted red text">Stop</span>
        </button>
      </form>
    </div>`;
}

function renderQueuedTable(items) {
    if (!items.length) {
        return `<div class="ui placeholder segment">
          <div class="ui icon header">
            <i class="tasks icon"></i>
            No queued or queue-related items found.
          </div>
        </div>`;
    }

    return `<table class="ui striped celled inverted compact small table">
      <thead>
        <tr>
          <th class="one wide">Status</th>
          <th class="six wide">File</th>
          <th class="one wide">Source</th>
          <th class="two wide">Profile</th>
          <th class="two wide right aligned">Requested</th>
          <th class="two wide right aligned">Updated</th>
          <th class="one wide center aligned">Action</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(renderQueuedRow).join("")}
      </tbody>
    </table>`;
}

function renderQueuedRow(item) {
    return `<tr>
      <td>${pill(item.status)}</td>
      <td title="${escapeHtml(item.inputAbsPath || "")}">
        <div>${escapeHtml(item.originalFilename)}</div>
        <span class="ui grey text">${escapeHtml(item.id)}</span>
      </td>
      <td>${renderSourceLabel(item)}</td>
      <td>${escapeHtml(item.profileId || "—")}</td>
      <td class="right aligned">${escapeHtml(formatDateTime(item.queuedAt || item.requestedAt || item.createdAt))}</td>
      <td class="right aligned">${escapeHtml(formatDateTime(item.updatedAt))}</td>
      <td class="center aligned">${renderQueueRowActions(item)}</td>
    </tr>`;
}

function renderSourceLabel(item) {
    const value = item && item.inboxRelativeDir ? item.inboxRelativeDir : "/";
    return `<span class="ui grey small label">${escapeHtml(value)}</span>`;
}

function renderQueueRowActions(item) {
    const status = String(item && item.status || "").toLowerCase();

    if (status === "encoding" || status === "paused") {
        return "—";
    }

    if (["queued", "failed", "cancelled"].includes(status)) {
        return `<div class="ui mini compact icon buttons">
          <a class="ui black button" href="/encoding/setup?id=${encodeURIComponent(item.id)}" title="Update queue item" aria-label="Update queue item">
            <i class="orange cogs icon"></i>
          </a>
          <form method="post" action="/api/encoding/items/${encodeURIComponent(item.id)}/unqueue" data-api-form data-confirm="Remove this item from the queue and return it to pending setup?" style="display: inline-block;">
            <button type="submit" class="ui button" title="Remove from queue" aria-label="Remove from queue">
              <i class="${status === "queued" ? "close" : "trash"} icon"></i>
            </button>
          </form>
        </div>`;
    }

    return "—";
}

function buildQueueRows(items, activeItemId) {
    return items
        .filter(item => QUEUE_ROW_STATES.has(String(item.status || "").toLowerCase()) || item.id === activeItemId)
        .sort((left, right) => compareQueueRows(left, right, activeItemId));
}

function compareQueueRows(left, right, activeItemId) {
    if (left.id === activeItemId && right.id !== activeItemId) return -1;
    if (right.id === activeItemId && left.id !== activeItemId) return 1;

    const leftPriority = queuePriority(left);
    const rightPriority = queuePriority(right);
    if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
    }

    return compareDates(left.queuedAt || left.requestedAt || left.createdAt, right.queuedAt || right.requestedAt || right.createdAt)
        || compareDates(left.updatedAt, right.updatedAt);
}

function queuePriority(item) {
    const status = String(item && item.status || "").toLowerCase();
    return {
        encoding: 0,
        paused: 1,
        queued: 2,
        failed: 3,
        cancelled: 4
    }[status] ?? 99;
}

function compareDates(left, right) {
    const leftMs = new Date(left || 0).getTime();
    const rightMs = new Date(right || 0).getTime();
    if (leftMs === rightMs) return 0;
    return leftMs < rightMs ? -1 : 1;
}

function isCoolingDown(worker) {
    return Boolean(worker && worker.safety && worker.safety.coolingDown);
}

function isResting(worker) {
    return Boolean(worker && worker.safety && worker.safety.resting);
}

function getActiveStatusState(activeItem, worker) {
    if (isCoolingDown(worker)) return "cooldown";
    if (isResting(worker)) return "resting";
    if (activeItem && activeItem.status) return String(activeItem.status).toLowerCase();
    return "idle";
}

function getActiveStatusDetail(activeItem, worker) {
    const safety = worker && worker.safety ? worker.safety : {};

    if (isCoolingDown(worker)) {
        return formatRemaining(safety.cooldownRemainingMs);
    }

    if (isResting(worker)) {
        return formatRemaining(safety.restRemainingMs);
    }

    if (activeItem && String(activeItem.status || "").toLowerCase() === "paused") {
        return formatElapsed(activeItem.pausedAt);
    }

    return null;
}

function progressColor(state) {
    return {
        encoding: "green",
        paused: "yellow",
        resting: "yellow",
        cooldown: "grey",
        idle: "grey",
        failed: "red",
        cancelled: "red"
    }[String(state || "").toLowerCase()] || "grey";
}

function renderMetric(label, value) {
    return `<div class="middle aligned two wide column">
      <div>
        <div><span class="ui grey text">${escapeHtml(label)}</span></div>
        <div><span class="ui inverted text">${escapeHtml(String(value))}</span></div>
      </div>
    </div>`;
}

function formatRemaining(ms) {
    const value = Number(ms || 0);
    if (!value) return "—";
    return formatDuration(value);
}

function formatElapsed(iso) {
    if (!iso) return "—";
    const ms = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(ms) || ms < 0) return "—";
    return formatDuration(ms);
}

function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
}

function calculateProgressPercent(activeItem, progress) {
    const outTimeMs = Number(progress && progress.outTimeMs || 0);
    const durationMs = Number(activeItem && activeItem.sourceMetadata && activeItem.sourceMetadata.durationMs || 0);

    if (!durationMs || !outTimeMs) {
        return 0;
    }

    return Math.max(0, Math.min(100, (outTimeMs / durationMs) * 100));
}

function calculateRemainingMs(activeItem, progress) {
    const outTimeMs = Number(progress && progress.outTimeMs || 0);
    const durationMs = Number(activeItem && activeItem.sourceMetadata && activeItem.sourceMetadata.durationMs || 0);

    if (!durationMs || !outTimeMs) {
        return 0;
    }

    return Math.max(0, durationMs - outTimeMs);
}

function formatEstimatedSize(progressPercent, totalSizeBytes) {
    const percent = Number(progressPercent || 0);
    const size = Number(totalSizeBytes || 0);

    if (!percent || !size) {
        return "—";
    }

    return formatBytes(size / (percent / 100));
}
