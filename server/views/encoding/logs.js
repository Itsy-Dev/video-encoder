const { escapeHtml, formatDate, formatDateTime } = require("./helpers");

module.exports = function renderLogs(logs = {}) {
    const files = Array.isArray(logs.files) ? logs.files : [];
    const recentEntries = Array.isArray(logs.recentEntries) ? logs.recentEntries : [];
    const activeFile = logs.activeFile || "";
    const activeFileLabel = activeFile || "No log file yet";

    return `<section class="ui segment">
      <div class="ui stackable grid">
        <div class=" column">
          <div class="ui inverted charcoal segment">
            <div class="ui stackable middle aligned grid">
              <div class="eight wide column">
                <h3 class="ui inverted header" style="margin-bottom: 0.35rem;">Recent Activity</h3>
                <div class="ui small grey text">Showing entries from <code>${escapeHtml(activeFileLabel)}</code>.</div>
              </div>
              <div class="eight wide right aligned column">
                ${renderLogFilePicker(files, activeFile)}
                <a class="ui small basic inverted button" href="/encoding/logs${activeFile ? `?file=${encodeURIComponent(activeFile)}` : ""}">
                  <i class="sync alternate icon"></i>
                  Refresh
                </a>
              </div>
            </div>
            <div class="ui inverted divider"></div>
            <div class="ui scrolling basic inverted segment fitted">
              ${renderActivityFeed(recentEntries)}
            </div>
          </div>
        </div>
      </div>
    </section>`;
};

function renderLogFilePicker(files, activeFile) {
    if (!files.length) {
        return `<div class="ui tiny grey text" style="display: inline-block; margin-right: 0.75rem;">No log files yet.</div>`;
    }

    return `<form method="get" action="/encoding/logs" class="ui tiny inverted form encoder-settings-panel" style="display: inline-block; width: 13rem; margin-right: 0.75rem;">
      <div class="field" style="margin: 0;">
        <select name="file" class="ui fluid dropdown" onchange="this.form.submit()">
          ${files.map(file => `
            <option value="${escapeHtml(file.name)}"${file.name === activeFile ? " selected" : ""}>${escapeHtml(formatLogFileLabel(file.name))}</option>
          `).join("")}
        </select>
      </div>
    </form>`;
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
    const subsystemColor = "black";

    return `<div class="item" style="">
      <div class="content">
        <div style="font-size: 0.95rem; color: rgba(255, 255, 255, 0.76); margin-bottom: 0.45rem;">
          ${escapeHtml(timestamp)}
        </div>
        <div>
          <div style="display: flex; align-items: flex-start; gap: 0.65rem;">
            <span class="ui tiny inverted basic ${escapeHtml(levelColor)} label" style="margin-top: 0.1rem;">${escapeHtml(level)}</span>
            ${parts.subsystem ? `<span class="ui tiny inverted basic ${escapeHtml(subsystemColor)} label" style="margin-top: 0.1rem;">${escapeHtml(parts.subsystem)}</span>` : ""}
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

function formatLogFileLabel(filename) {
    const name = String(filename || "");
    const match = /^encoder-(\d{4})-(\d{2})-(\d{2})\.log$/i.exec(name);
    if (!match) {
        return name;
    }

    const isoDate = `${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`;
    return `[${formatDate(isoDate)}]`;
}
