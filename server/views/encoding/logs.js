const { escapeHtml, formatBytes, formatDateTime } = require("./helpers");

module.exports = function renderLogs(logs = {}) {
    const files = Array.isArray(logs.files) ? logs.files : [];
    const recentEntries = Array.isArray(logs.recentEntries) ? logs.recentEntries : [];
    const activeFile = logs.activeFile || "";
    const activeFileLabel = activeFile || "No log file yet";

    return `<section class="ui segment">
      <div class="ui stackable grid">
      <!--
        <div class="four wide column">
          <div class="ui inverted charcoal segment">
            <h3 class="ui inverted header">Log Files</h3>
            <div class="ui inverted relaxed divided list">
              ${files.length ? files.map(file => renderLogFileItem(file, activeFile)).join("") : `
                <div class="item">
                  <div class="content">
                    <div class="header">No log files found yet.</div>
                    <div class="description">Logs will appear here after the app writes its first events.</div>
                  </div>
                </div>
              `}
            </div>
          </div>
        </div>
-->
        <div class=" column">
          <div class="ui inverted charcoal segment">
            <div class="ui stackable middle aligned grid">
              <div class="ten wide column">
                <h3 class="ui inverted header" style="margin-bottom: 0.35rem;">Recent Activity</h3>
                <div class="ui small grey text">Showing newest entries first from <code>${escapeHtml(activeFileLabel)}</code>.</div>
              </div>
              <div class="six wide right aligned column">
                <a class="ui small basic inverted button" href="/encoding/logs${activeFile ? `?file=${encodeURIComponent(activeFile)}` : ""}">
                  <i class="sync alternate icon"></i>
                  Refresh
                </a>
              </div>
            </div>
            ${renderActivityFeed(recentEntries)}
          </div>
        </div>
      </div>
    </section>`;
};

function renderLogFileItem(file, activeFile) {
    const isActive = file && file.name === activeFile;
    return `<div class="item">
      <div class="content">
        <a class="header" href="/encoding/logs?file=${encodeURIComponent(file.name)}">${escapeHtml(file.name)}</a>
        <div class="description" style="margin-top: 0.35rem;">
          <span class="ui tiny ${isActive ? "teal" : "grey"} label">${isActive ? "Open" : "Available"}</span>
          <span>${escapeHtml(formatBytes(file.sizeBytes))}</span>
          <span style="margin-left: 0.75rem;">Updated ${escapeHtml(formatDateTime(file.updatedAt))}</span>
        </div>
      </div>
    </div>`;
}

function renderActivityFeed(entries) {
    if (!entries.length) {
        return `<div class="ui inverted placeholder segment">
          <div class="ui icon header">
            <i class="stream icon"></i>
            No recent log entries found for this file.
          </div>
        </div>`;
    }

    return `<div class="ui inverted relaxed divided list">
      ${entries.map(entry => renderFeedEvent(entry)).join("")}
    </div>`;
}

function renderFeedEvent(entry) {
    const level = String(entry && entry.level || "INFO").toUpperCase();
    const levelColor = ({
        ERROR: "red",
        WARN: "yellow",
        INFO: "teal"
    }[level] || "grey");
    const timestamp = formatDateTime(entry && entry.timestamp);
    const parts = splitSubsystemMessage(String(entry && entry.message || entry && entry.raw || "—"));
    const subsystemColor = "grey";

    return `<div class="item" style="padding: 0.9rem 0;">
      <div class="content">
        <div style="font-size: 0.95rem; color: rgba(255, 255, 255, 0.76); margin-bottom: 0.45rem;">
          ${escapeHtml(timestamp)}
        </div>
        <div style="border-left: 2px solid rgba(255, 255, 255, 0.14); padding-left: 0.9rem;">
          <div style="display: flex; align-items: flex-start; gap: 0.65rem;">
            <span class="ui tiny ${escapeHtml(levelColor)} label" style="margin-top: 0.1rem;">${escapeHtml(level)}</span>
            ${parts.subsystem ? `<span class="ui tiny ${escapeHtml(subsystemColor)} label" style="margin-top: 0.1rem;">${escapeHtml(parts.subsystem)}</span>` : ""}
            <pre style="white-space: pre-wrap; word-break: break-word; margin: 0; color: rgba(255, 255, 255, 0.96); font: 0.95rem/1.45 Menlo, Monaco, Consolas, monospace; flex: 1;">${escapeHtml(parts.message)}</pre>
          </div>
        </div>
      </div>
    </div>`;
}

function splitSubsystemMessage(message) {
    const text = String(message || "—");
    const match = /^\[([A-Z_]+)\]\s*(.*)$/i.exec(text);
    if (!match) {
        return {
            subsystem: "",
            message: text
        };
    }

    return {
        subsystem: String(match[1] || "").toUpperCase(),
        message: match[2] || ""
    };
}
