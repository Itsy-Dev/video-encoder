const { escapeHtml, formatProgress, pill, renderQueueAction, renderTable, statefulValue } = require("./helpers");

module.exports = function renderQueue(state) {
    const items = state.items || [];
    const rows = items.filter(item => ["ready", "queued", "encoding", "paused", "completed", "review"].includes(item.status));

    return `<section class="panel">
      <div class="note" style="margin-bottom: 16px;">
        <strong>Worker</strong><br />
        Active Item: ${escapeHtml(statefulValue(state, "worker.activeItemId"))}<br />
        Started: ${escapeHtml(statefulValue(state, "worker.activeStartedAt"))}<br />
        Progress: ${escapeHtml(formatProgress(state && state.worker ? state.worker.activeProgress : null))}<br />
        <div class="actions" style="margin-top: 12px;">
          <form method="post" action="/api/encoding/control/wake" data-api-form>
            <button type="submit">Wake Queue</button>
          </form>
          <form method="post" action="/api/encoding/control/pause" data-api-form>
            <button type="submit" class="button-warn">Pause</button>
          </form>
          <form method="post" action="/api/encoding/control/resume" data-api-form>
            <button type="submit" class="button-secondary">Resume</button>
          </form>
          <form method="post" action="/api/encoding/control/stop" data-api-form>
            <button type="submit" class="button-bad">Stop</button>
          </form>
        </div>
      </div>
      ${renderTable(rows, [
          ["State", item => pill(item.status)],
          ["File", item => escapeHtml(item.originalFilename)],
          ["Profile", item => escapeHtml(item.profileId || "—")],
          ["Inbox Dir", item => escapeHtml(item.inboxRelativeDir || "/")],
          ["Updated", item => escapeHtml(item.updatedAt)],
          ["Path", item => escapeHtml(item.inputAbsPath)],
          ["Action", item => renderQueueAction(item)]
      ], "Queue state will appear here once items move beyond discovery.")}
    </section>`;
};
