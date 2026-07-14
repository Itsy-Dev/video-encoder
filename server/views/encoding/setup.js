const { buildOutboxDisplayPath, escapeHtml, renderKeyValue } = require("./helpers");

module.exports = function renderSetup(item, profiles) {
    if (!item) {
        return `<section class="ui segment encoder-panel"><div class="ui placeholder segment"><div class="ui header">No discovered item is available for setup yet.</div></div></section>`;
    }

    return `<section class="split">
      <div class="ui segment encoder-panel stack">
        <div>
          <h2 class="ui header">${escapeHtml(item.originalFilename)}</h2>
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
        <form class="ui form form-stack" method="post" action="/api/encoding/items/${encodeURIComponent(item.id)}/queue" data-api-form>
          <div class="field">
            <label>Profile</label>
            <select class="ui dropdown" name="profileId">
              ${profiles.map(profile => `<option value="${escapeHtml(profile.id)}"${profile.id === (item.profileId || item.requestedProfileId || "browser_compatibility") ? " selected" : ""}>${escapeHtml(profile.label)} (${escapeHtml(profile.id)})</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Inbox Relative Dir</label>
            <input value="${escapeHtml(item.inboxRelativeDir || "")}" disabled />
          </div>
          <input type="hidden" name="inboxRelativeDir" value="${escapeHtml(item.inboxRelativeDir || "")}" />
          <div class="actions">
            <button type="submit" class="ui primary button">Queue Item</button>
            <a class="ui button button-inline" href="/encoding/pending">Back to Pending</a>
          </div>
        </form>
        <form method="post" action="/api/encoding/items/${encodeURIComponent(item.id)}/discard" data-api-form>
          <div class="actions">
            <button type="submit" class="ui red basic button">Discard Source</button>
          </div>
        </form>
        <div class="ui message encoder-note">Scan ingests the video from inbox into internal pending storage first, preserving its optional subdirectory for outbox routing. Once queued, the worker picks it up automatically when it reaches the front.</div>
      </div>
      <div class="ui segment encoder-panel stack">
        <h3 class="ui header">Available Profiles</h3>
        ${profiles.map(profile => `
          <div class="ui message encoder-note">
            <div class="header">${escapeHtml(profile.id)}</div>
            <p>${escapeHtml(profile.label)}</p>
            <small>${escapeHtml(profile.description)}</small>
          </div>
        `).join("")}
      </div>
    </section>`;
};
