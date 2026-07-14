const { buildOutboxDisplayPath, escapeHtml, renderKeyValue } = require("./helpers");

module.exports = function renderSetup(item, profiles) {
    if (!item) {
        return `<section class="panel"><div class="empty">No discovered item is available for setup yet.</div></section>`;
    }

    return `<section class="split">
      <div class="panel stack">
        <div>
          <strong>${escapeHtml(item.originalFilename)}</strong>
          <p>Choose the profile and confirm the preserved inbox subdirectory before the item enters the automated single-worker queue.</p>
        </div>
        ${renderKeyValue([
            ["Item ID", item.id],
            ["Current State", item.status],
            ["Inbox Relative Dir", item.inboxRelativeDir || "/"],
            ["Inbox Relative Path", item.inboxRelativePath || item.originalFilename],
            ["Selected Profile", item.profileId || "not set"],
            ["Inbox Input Path", item.inboxInputAbsPath],
            ["Managed Input Path", item.inputAbsPath],
            ["Encoded Output Path", item.encodedOutputAbsPath || "not generated"],
            ["Output Folder", buildOutboxDisplayPath(item)]
        ])}
        <form class="form-stack" method="post" action="/api/encoding/items/${encodeURIComponent(item.id)}/queue" data-api-form>
          <label>
            Profile
            <select name="profileId">
              ${profiles.map(profile => `<option value="${escapeHtml(profile.id)}"${profile.id === (item.profileId || item.requestedProfileId || "browser_compatibility") ? " selected" : ""}>${escapeHtml(profile.label)} (${escapeHtml(profile.id)})</option>`).join("")}
            </select>
          </label>
          <label>
            Inbox Relative Dir
            <input value="${escapeHtml(item.inboxRelativeDir || "")}" disabled />
          </label>
          <input type="hidden" name="inboxRelativeDir" value="${escapeHtml(item.inboxRelativeDir || "")}" />
          <div class="actions">
            <button type="submit">Queue Item</button>
            <a class="button button-secondary button-inline" href="/encoding/pending">Back to Pending</a>
          </div>
        </form>
        <div class="note">Scan ingests the video from inbox into internal pending storage first, preserving its optional subdirectory for outbox routing. Once queued, the worker picks it up automatically when it reaches the front.</div>
      </div>
      <div class="panel stack">
        <strong>Available Profiles</strong>
        ${profiles.map(profile => `
          <div class="note">
            <strong>${escapeHtml(profile.id)}</strong><br />
            ${escapeHtml(profile.label)}<br />
            <small>${escapeHtml(profile.description)}</small>
          </div>
        `).join("")}
      </div>
    </section>`;
};
