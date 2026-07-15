const { escapeHtml } = require("./helpers");

const SETTINGS_LAYOUT = Object.freeze({
    labelColumnClass: "five wide",
    controlColumnClass: "eleven wide",
    fieldHeaderClass: "ui inverted tiny header",
    fieldHeaderStyle: "margin-bottom: 0;"
});

module.exports = function renderSettings(profiles, settings) {
    const current = normalizeSettings(settings, profiles);

    return `<section class="ui inverted segment encoder-settings-panel">
      <form method="post" action="/api/encoding/settings" data-api-form>
        <div class="ui inverted charcoal segment">
          <div class="ui stackable grid">
            <div class="ten wide column">
              <h2 class="ui inverted header" style="margin-bottom: 0.35rem;">Encoder App Settings</h2>
              <span class="ui grey text">Tune worker behavior, performance, discovery, and recovery without editing environment files.</span>
            </div>
            <div class="six wide right aligned middle aligned column">
              <button type="button" class="ui small compact button" onclick="window.location.reload()">Discard Changes</button>
              <button type="submit" class="ui small compact primary button">Save Changes</button>
            </div>
          </div>
        </div>

        <div class="ui two column stackable stretched grid">
          <div class="column">
            ${renderSettingsSection("Worker Behavior", "Control when the encoder pauses, cools down, resumes, and begins work.", [
                renderNumberField("Continuous Run Limit", "worker.continuousRunLimitMinutes", current.worker.continuousRunLimitMinutes, "minutes"),
                renderNumberField("Break Duration", "worker.breakDurationMinutes", current.worker.breakDurationMinutes, "minutes"),
                renderNumberField("Post-Item Cooldown", "worker.postItemCooldownMinutes", current.worker.postItemCooldownMinutes, "minutes"),
                renderNumberField("Safety Monitor Interval", "worker.monitorIntervalSeconds", current.worker.monitorIntervalSeconds, "seconds"),
                renderToggleField("Auto-Resume After Break", "worker.autoResumeAfterBreak", current.worker.autoResumeAfterBreak),
                renderToggleField("Auto-Start Queue On Launch", "worker.autoStartQueueOnLaunch", current.worker.autoStartQueueOnLaunch)
            ])}
          </div>

          <div class="column">
            ${renderSettingsSection("Performance", "Controls that affect ffmpeg execution and defaults for newly discovered items.", [
                renderNumberField("FFmpeg Threads", "performance.ffmpegThreads", current.performance.ffmpegThreads, "threads"),
                renderNumberField("Filter Threads", "performance.filterThreads", current.performance.filterThreads, "threads"),
                renderNumberField("Process Priority / Nice", "performance.processPriority", current.performance.processPriority, "nice"),
                renderSelectField("Default Profile For Discovered Items", "performance.defaultProfileId", current.performance.defaultProfileId, profiles.map(profile => ({
                    value: profile.id,
                    label: profile.label || profile.id
                })))
            ])}
          </div>

          <div class="column">
            ${renderSettingsSection("Storage", "Choose the user-facing folders for imports and exports.", [
                renderTextField("Inbox Folder", "storage.inboxRoot", current.storage.inboxRoot),
                renderTextField("Outbox Folder", "storage.outboxRoot", current.storage.outboxRoot)
            ])}
          </div>

          <div class="column">
            ${renderSettingsSection("Watch Folders", "Manage external folders the app is allowed to scan for videos.", [
                renderDisabledNotice("Not implemented yet. Watch folders are planned, but discovery still only uses the primary inbox folder.")
            ])}
          </div>

          <div class="column">
            ${renderSettingsSection("Automation", "Control background polling and automatic recovery behavior.", [
                renderNumberField("Inbox Scan Interval", "discovery.scanIntervalMinutes", current.discovery.scanIntervalMinutes, "minutes"),
                renderToggleField("Requeue Interrupted Items", "recovery.requeueInterruptedItems", current.recovery.requeueInterruptedItems),
                renderToggleField("Auto-Prune Empty Directories", "recovery.autoPruneEmptyDirectories", current.recovery.autoPruneEmptyDirectories)
            ])}
          </div>

        </div>


        <div class="ui right aligned basic segment" style="padding-right: 0;">
          <button type="button" class="ui button" onclick="window.location.reload()">Discard Changes</button>
          <button type="submit" class="ui primary button">Save Changes</button>
        </div>
      </form>
      <script>
        (function () {
          const root = document.currentScript && document.currentScript.parentElement;
          if (!root) return;

          const form = root.querySelector("form");
          const initialValues = new Map();

          function getTrackedInputs() {
            if (!form) return [];
            return Array.from(form.querySelectorAll("input[name], select[name], textarea[name]"));
          }

          function getInputValue(input) {
            if (!(input instanceof HTMLElement)) return "";
            if (input instanceof HTMLInputElement && input.type === "checkbox") {
              return input.checked ? "true" : "false";
            }
            return input.value;
          }

          function fieldForInput(input) {
            return input && input.closest ? input.closest("[data-settings-field]") : null;
          }

          function controlForInput(input) {
            const field = fieldForInput(input);
            return field ? field.querySelector("[data-settings-control]") : null;
          }

          function rememberInitialValue(input) {
            if (!input || !input.name || initialValues.has(input)) return;
            initialValues.set(input, getInputValue(input));
          }

          function syncDirtyState(input) {
            if (!input || !input.name) return;
            const control = controlForInput(input);
            if (!control) return;

            rememberInitialValue(input);
            const initialValue = initialValues.get(input);
            const currentValue = getInputValue(input);
            control.classList.toggle("encoder-setting-dirty", currentValue !== initialValue);
          }

          function trackAllInputs() {
            getTrackedInputs().forEach(function (input) {
              rememberInitialValue(input);
              syncDirtyState(input);
            });
          }

          if (form) {
            form.addEventListener("input", function (event) {
              syncDirtyState(event.target);
            });

            form.addEventListener("change", function (event) {
              syncDirtyState(event.target);
            });

            trackAllInputs();
          }
        })();
      </script>
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

function renderNumberField(label, name, value, unit) {
    return `<div class="field" data-settings-field>
      <div class="ui stackable middle aligned grid">
        <div class="${escapeHtml(SETTINGS_LAYOUT.labelColumnClass)} column">
          <div class="${escapeHtml(SETTINGS_LAYOUT.fieldHeaderClass)}" style="${escapeHtml(SETTINGS_LAYOUT.fieldHeaderStyle)}">${escapeHtml(label)}:</div>
        </div>
        <div class="${escapeHtml(SETTINGS_LAYOUT.controlColumnClass)} column" data-settings-control>
          <div class="ui fluid small right labeled input">
            <input type="number" name="${escapeHtml(name)}" value="${escapeHtml(String(value))}" />
            <div class="ui basic label">${escapeHtml(unit)}</div>
          </div>
        </div>
      </div>
    </div>`;
}

function renderToggleField(label, name, enabled) {
    return `<div class="field" data-settings-field>
      <div class="ui stackable middle aligned grid">
        <div class="${escapeHtml(SETTINGS_LAYOUT.labelColumnClass)} column">
          <div class="${escapeHtml(SETTINGS_LAYOUT.fieldHeaderClass)}" style="${escapeHtml(SETTINGS_LAYOUT.fieldHeaderStyle)}">${escapeHtml(label)}:</div>
        </div>
        <div class="${escapeHtml(SETTINGS_LAYOUT.controlColumnClass)} column" data-settings-control>
          <input type="hidden" name="${escapeHtml(name)}" value="false" />
          <div class="ui fitted toggle checkbox">
            <input type="checkbox" name="${escapeHtml(name)}" value="true"${enabled ? " checked" : ""} />
            <label></label>
          </div>
        </div>
      </div>
    </div>`;
}

function renderSelectField(label, name, selectedValue, options) {
    return `<div class="field" data-settings-field>
      <div class="ui stackable middle aligned grid">
        <div class="${escapeHtml(SETTINGS_LAYOUT.labelColumnClass)} column">
          <div class="${escapeHtml(SETTINGS_LAYOUT.fieldHeaderClass)}" style="${escapeHtml(SETTINGS_LAYOUT.fieldHeaderStyle)}">${escapeHtml(label)}:</div>
        </div>
        <div class="${escapeHtml(SETTINGS_LAYOUT.controlColumnClass)} column" data-settings-control>
          <select class="ui fluid dropdown" name="${escapeHtml(name)}">
            ${options.map(option => `
              <option value="${escapeHtml(option.value)}"${option.value === selectedValue ? " selected" : ""}>${escapeHtml(option.label)}</option>
            `).join("")}
          </select>
        </div>
      </div>
    </div>`;
}

function renderTextField(label, name, value) {
    return `<div class="field" data-settings-field>
      <div class="ui stackable middle aligned grid">
        <div class="${escapeHtml(SETTINGS_LAYOUT.labelColumnClass)} column">
          <div class="${escapeHtml(SETTINGS_LAYOUT.fieldHeaderClass)}" style="${escapeHtml(SETTINGS_LAYOUT.fieldHeaderStyle)}">${escapeHtml(label)}:</div>
        </div>
        <div class="${escapeHtml(SETTINGS_LAYOUT.controlColumnClass)} column" data-settings-control>
          <div class="ui fluid small input">
            <input type="text" name="${escapeHtml(name)}" value="${escapeHtml(String(value || ""))}" />
          </div>
        </div>
      </div>
    </div>`;
}

function renderDisabledNotice(message) {
    return `<div class="field" data-settings-field>
      <div class="ui yellow message" data-settings-control style="opacity: 0.35; margin-bottom: 0;">
        <div class="header">Not Implemented Yet</div>
        <p>${escapeHtml(message)}</p>
      </div>
    </div>`;
}

function joinWithDividers(items) {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    return list.join('<div class="ui inverted divider"></div>');
}

function normalizeSettings(settings, profiles) {
    const defaultProfileId = profiles[0] ? profiles[0].id : "browser_compatibility";
    const source = settings && typeof settings === "object" ? settings : {};

    return {
        worker: {
            continuousRunLimitMinutes: safeNumber(source.worker && source.worker.continuousRunLimitMinutes, 20),
            breakDurationMinutes: safeNumber(source.worker && source.worker.breakDurationMinutes, 5),
            postItemCooldownMinutes: safeNumber(source.worker && source.worker.postItemCooldownMinutes, 20),
            monitorIntervalSeconds: safeNumber(source.worker && source.worker.monitorIntervalSeconds, 30),
            autoResumeAfterBreak: Boolean(source.worker && source.worker.autoResumeAfterBreak),
            autoStartQueueOnLaunch: Boolean(source.worker && source.worker.autoStartQueueOnLaunch)
        },
        performance: {
            ffmpegThreads: safeNumber(source.performance && source.performance.ffmpegThreads, 1),
            filterThreads: safeNumber(source.performance && source.performance.filterThreads, 2),
            processPriority: safeNumber(source.performance && source.performance.processPriority, 15),
            defaultProfileId: String(source.performance && source.performance.defaultProfileId || defaultProfileId)
        },
        storage: {
            inboxRoot: String(source.storage && source.storage.inboxRoot || ""),
            outboxRoot: String(source.storage && source.storage.outboxRoot || "")
        },
        discovery: {
            scanIntervalMinutes: safeNumber(source.discovery && source.discovery.scanIntervalMinutes, 1),
            watchFolders: Array.isArray(source.discovery && source.discovery.watchFolders)
                ? source.discovery.watchFolders.map(folder => ({
                    path: String(folder && folder.path || ""),
                    enabled: Boolean(folder && folder.enabled)
                }))
                : []
        },
        recovery: {
            requeueInterruptedItems: Boolean(source.recovery && source.recovery.requeueInterruptedItems),
            autoPruneEmptyDirectories: Boolean(source.recovery && source.recovery.autoPruneEmptyDirectories)
        }
    };
}

function safeNumber(value, fallback) {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
}
