const { escapeHtml, renderKeyValue } = require("./helpers");

module.exports = function renderSettings(paths, profiles) {
    return `<section class="split">
      <div class="panel stack">
        <strong>Directory Contract</strong>
        ${renderKeyValue([
            ["Handoff Root", paths.handoffRoot],
            ["Internal Root", paths.internalRoot],
            ["Inbox", paths.inbox],
            ["Outbox", paths.outbox],
            ["Pending", paths.pending],
            ["Working", paths.working],
            ["Encoded", paths.encoded],
            ["Logs", paths.logs]
        ])}
      </div>
      <div class="panel stack">
        <strong>Profiles</strong>
        ${profiles.map(profile => `<div class="note"><strong>${escapeHtml(profile.id)}</strong><br />${escapeHtml(profile.label)}</div>`).join("")}
      </div>
    </section>`;
};
