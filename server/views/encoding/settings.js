const { escapeHtml, renderKeyValue } = require("./helpers");

module.exports = function renderSettings(paths, profiles) {
    return `<section class="ui inverted segment">
      <div class="ui warning inverted message">
        <div class="header">Under Construction</div>
        <p>This area will become the encoder control surface for adjustable service settings, worker timing, and operational toggles.</p>
      </div>

      <div class="ui hidden divider"></div>

      <div class="ui two column stackable grid">
        <div class="column">
          <div class="ui inverted charcoal segment">
            <h3 class="ui inverted header">Current Directory Contract</h3>
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
        </div>

        <div class="column">
          <div class="ui inverted charcoal segment">
            <h3 class="ui inverted header">Installed Profiles</h3>
            <div class="ui inverted relaxed divided list">
              ${profiles.map(profile => `
                <div class="item">
                  <div class="content">
                    <div class="header">${escapeHtml(profile.label || profile.id)}</div>
                    <div class="description">
                      <span class="ui grey text">${escapeHtml(profile.id)}</span>
                    </div>
                  </div>
                </div>
              `).join("")}
            </div>
          </div>
        </div>
      </div>
    </section>`;
};
