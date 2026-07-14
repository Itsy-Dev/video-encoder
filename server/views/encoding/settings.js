const { escapeHtml, renderKeyValue } = require("./helpers");

module.exports = function renderSettings(paths, profiles) {
    return `<section class="split">
      <div class="ui segment encoder-panel stack">
        <h3 class="ui header">Directory Contract</h3>
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
      <div class="ui segment encoder-panel stack">
        <h3 class="ui header">Profiles</h3>
        ${profiles.map(profile => `<div class="ui message encoder-note"><div class="header">${escapeHtml(profile.id)}</div><p>${escapeHtml(profile.label)}</p></div>`).join("")}
      </div>
    </section>`;
};
