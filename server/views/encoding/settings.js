const { escapeHtml } = require("./helpers");

const SETTINGS_LAYOUT = Object.freeze({
    labelColumnClass: "eight wide",
    controlColumnClass: "eight wide",
    fieldHeaderClass: "ui inverted tiny header",
    fieldHeaderStyle: "margin-bottom: 0;"
});

module.exports = function renderSettings(profiles) {
    const mock = buildMockSettings(profiles);

    return `<section class="ui inverted segment encoder-settings-panel">
      <div class="ui info inverted message">
        <div class="header">Settings Prototype</div>
        <p>This page is a disconnected UI mock. Values do not save yet and runtime behavior is unchanged.</p>
      </div>

      <div class="ui inverted charcoal segment">
        <div class="ui stackable grid">
          <div class="ten wide column">
            <h2 class="ui inverted header" style="margin-bottom: 0.35rem;">Encoder App Settings</h2>
            <span class="ui grey text">Tune worker behavior, performance, discovery, and recovery without editing environment files.</span>
          </div>
          <div class="six wide right aligned middle aligned column">
            <span class="ui small orange label">Mock Data</span>
            <button type="button" class="ui small compact button">Reset To Defaults</button>
            <button type="button" class="ui small compact primary button">Save Changes</button>
          </div>
        </div>
      </div>

      <div class="ui two column stackable stretched grid">
        <div class="column">
          ${renderSettingsSection("Worker Behavior", "Control when the encoder pauses, cools down, resumes, and begins work.", [
              renderNumberField("Continuous Run Limit", mock.worker.continuousRunLimitMinutes, "minutes"),
              renderNumberField("Break Duration", mock.worker.breakDurationMinutes, "minutes"),
              renderNumberField("Post-item Cooldown", mock.worker.postItemCooldownMinutes, "minutes"),
              renderNumberField("Safety Monitor Interval", mock.worker.monitorIntervalSeconds, "seconds"),
              renderToggleField("Auto-Resume After Break", mock.worker.autoResumeAfterBreak),
              renderToggleField("Auto-Start Queue On Launch", mock.worker.autoStartQueueOnLaunch)
          ])}
        </div>

        <div class="column">
          ${renderSettingsSection("Performance", "Controls that affect ffmpeg execution and defaults for newly discovered items.", [
              renderNumberField("FFmpeg Threads", mock.performance.ffmpegThreads, "threads"),
              renderNumberField("Filter Threads", mock.performance.filterThreads, "threads"),
              renderNumberField("Process Priority / Nice", mock.performance.processPriority, "nice"),
              renderSelectField("Default Profile For Discovered Items", mock.performance.defaultProfileId, profiles.map(profile => ({
                  value: profile.id,
                  label: profile.label || profile.id
              })))
          ])}
        </div>

        <div class="column">
          ${renderSettingsSection("Automation", "Control background polling and automatic recovery behavior.", [
              renderNumberField("Inbox Scan Interval", mock.discovery.scanIntervalSeconds, "seconds"),
              renderToggleField("Requeue Interrupted Items", mock.recovery.requeueInterruptedItems),
              renderToggleField("Auto-Prune Empty Directories", mock.recovery.autoPruneEmptyDirectories)
          ])}
        </div>

        <div class="column">
          ${renderSettingsSection("Watch Folders", "Manage external folders the app is allowed to scan for videos.", [
              renderFolderList(mock.discovery.sourceFolders)
          ])}
        </div>
      </div>

      <div class="ui hidden divider"></div>

      <div class="ui right aligned basic segment" style="padding-right: 0;">
        <button type="button" class="ui button">Reset To Defaults</button>
        <button type="button" class="ui primary button">Save Changes</button>
      </div>
    </section>`;
};

function renderSettingsSection(title, description, fields) {
    return `<div class="ui inverted charcoal segment">
      <h3 class="ui inverted header" style="margin-bottom: 0.35rem;">${escapeHtml(title)}</h3>
      <span class="ui grey text">${escapeHtml(description)}</span>
      <div class="ui inverted divider"></div>
      <div class="ui inverted small form">
        ${joinWithDividers(fields)}
      </div>
    </div>`;
}

function renderNumberField(label, value, unit) {
    return `<div class="field">
      <div class="ui stackable middle aligned grid">
        <div class="${escapeHtml(SETTINGS_LAYOUT.labelColumnClass)} column">
          <div class="${escapeHtml(SETTINGS_LAYOUT.fieldHeaderClass)}" style="${escapeHtml(SETTINGS_LAYOUT.fieldHeaderStyle)}">${escapeHtml(label)}:</div>
        </div>
        <div class="${escapeHtml(SETTINGS_LAYOUT.controlColumnClass)} column">
          <div class="ui fluid small right labeled input">
          <input type="number" value="${escapeHtml(String(value))}" />
            <div class="ui basic label">${escapeHtml(unit)}</div>
          </div>
        </div>
      </div>
    </div>`;
}

function renderToggleField(label, enabled) {
    return `<div class="field">
      <div class="ui stackable middle aligned grid">
        <div class="${escapeHtml(SETTINGS_LAYOUT.labelColumnClass)} column">
          <div class="${escapeHtml(SETTINGS_LAYOUT.fieldHeaderClass)}" style="${escapeHtml(SETTINGS_LAYOUT.fieldHeaderStyle)}">${escapeHtml(label)}:</div>
        </div>
        <div class="${escapeHtml(SETTINGS_LAYOUT.controlColumnClass)} column">
          <div class="ui fitted toggle checkbox">
          <input type="checkbox"${enabled ? " checked" : ""} />
            <label></label>
          </div>
        </div>
      </div>
    </div>`;
}

function renderSelectField(label, selectedValue, options) {
    return `<div class="field">
      <div class="ui stackable middle aligned grid">
        <div class="${escapeHtml(SETTINGS_LAYOUT.labelColumnClass)} column">
          <div class="${escapeHtml(SETTINGS_LAYOUT.fieldHeaderClass)}" style="${escapeHtml(SETTINGS_LAYOUT.fieldHeaderStyle)}">${escapeHtml(label)}:</div>
        </div>
        <div class="${escapeHtml(SETTINGS_LAYOUT.controlColumnClass)} column">
          <select class="ui fluid dropdown">
            ${options.map(option => `
              <option value="${escapeHtml(option.value)}"${option.value === selectedValue ? " selected" : ""}>${escapeHtml(option.label)}</option>
            `).join("")}
          </select>
        </div>
      </div>
    </div>`;
}

function renderFolderList(folders) {
    return `<div class="field">
      <div class="ui stackable grid">
        <div class="sixteen wide right aligned middle aligned column">
          <button type="button" class="ui small basic inverted black button">
            <i class="plus icon"></i>
            Add Watch Folder
          </button>
        </div>
      </div>
      <table class="ui very compact celled striped inverted small table">
        <thead>
          <tr>
            <th>Path</th>
            <th class="center aligned">On</th>
            <th class="center aligned">Action</th>
          </tr>
        </thead>
        <tbody>
          ${folders.map(folder => `
            <tr>
              <td>${escapeHtml(folder.path)}</td>
              <td class="center aligned">${folder.enabled ? `<i class="green check icon"></i>` : `<i class="grey minus icon"></i>`}</td>
              <td class="center aligned">
                <div class="ui mini compact basic icon buttons">
                  <button type="button" class="ui button" title="Edit folder"><i class="fitted pencil icon"></i></button>
                  <button type="button" class="ui button" title="Remove folder"><i class="fitted red trash icon"></i></button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>`;
}

function joinWithDividers(items) {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    return list.join('<div class="ui inverted divider"></div>');
}

function buildMockSettings(profiles) {
    return {
        worker: {
            continuousRunLimitMinutes: 20,
            breakDurationMinutes: 5,
            postItemCooldownMinutes: 20,
            monitorIntervalSeconds: 30,
            autoResumeAfterBreak: true,
            autoStartQueueOnLaunch: true
        },
        performance: {
            ffmpegThreads: 1,
            filterThreads: 2,
            processPriority: 15,
            defaultProfileId: profiles[0] ? profiles[0].id : "browser_compatibility"
        },
        discovery: {
            scanIntervalSeconds: 30,
            sourceFolders: [
                { path: "/Users/ad/Downloads", enabled: true },
                { path: "/Users/ad/Desktop/To Encode", enabled: false }
            ]
        },
        recovery: {
            requeueInterruptedItems: true,
            autoPruneEmptyDirectories: true
        }
    };
}
