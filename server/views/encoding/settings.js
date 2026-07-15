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
      <div class="ui warning inverted message">
        <div class="header">Runtime Wiring In Progress</div>
        <p>Settings now save to the database. Live worker behavior will be wired to these values in the next step.</p>
      </div>

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
            ${renderSettingsSection("Automation", "Control background polling and automatic recovery behavior.", [
                renderNumberField("Inbox Scan Interval", "discovery.scanIntervalMinutes", current.discovery.scanIntervalMinutes, "minutes"),
                renderToggleField("Requeue Interrupted Items", "recovery.requeueInterruptedItems", current.recovery.requeueInterruptedItems),
                renderToggleField("Auto-Prune Empty Directories", "recovery.autoPruneEmptyDirectories", current.recovery.autoPruneEmptyDirectories)
            ])}
          </div>

          <div class="column">
            ${renderSettingsSection("Watch Folders", "Manage external folders the app is allowed to scan for videos.", [
                renderFolderList(current.discovery.watchFolders)
            ])}
          </div>
        </div>


        <div class="ui right aligned basic segment" style="padding-right: 0;">
          <button type="button" class="ui button" onclick="window.location.reload()">Discard Changes</button>
          <button type="submit" class="ui primary button">Save Changes</button>
        </div>
      </form>

      <template id="watch-folder-row-template">
        ${renderFolderRow({ path: "", enabled: true }, "__INDEX__")}
      </template>

      <script>
        (function () {
          const root = document.currentScript && document.currentScript.parentElement;
          if (!root) return;

          const form = root.querySelector("form");
          const addButton = root.querySelector("[data-add-watch-folder]");
          const tableBody = root.querySelector("[data-watch-folder-body]");
          const template = root.querySelector("#watch-folder-row-template");
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

          function syncRowIndices() {
            if (!tableBody) return;
            Array.from(tableBody.querySelectorAll("[data-watch-folder-row]")).forEach(function (row, index) {
              Array.from(row.querySelectorAll("[data-setting-name]")).forEach(function (input) {
                const nameTemplate = input.getAttribute("data-setting-name");
                if (!nameTemplate) return;
                input.setAttribute("name", nameTemplate.replace(/__INDEX__/g, String(index)));
              });
            });
          }

          if (addButton && tableBody && template) {
            addButton.addEventListener("click", function () {
              const wrapper = document.createElement("tbody");
              wrapper.innerHTML = template.innerHTML.trim();
              const row = wrapper.firstElementChild;
              if (!row) return;
              tableBody.appendChild(row);
              syncRowIndices();
              Array.from(row.querySelectorAll("input[name], select[name], textarea[name]")).forEach(function (input) {
                rememberInitialValue(input);
                initialValues.set(input, "");
                syncDirtyState(input);
              });
            });

            tableBody.addEventListener("click", function (event) {
              const button = event.target.closest("[data-remove-watch-folder]");
              if (!button) return;
              const row = button.closest("[data-watch-folder-row]");
              if (!row) return;
              row.remove();
              syncRowIndices();
            });

            syncRowIndices();
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

function renderFolderList(folders) {
    const list = Array.isArray(folders) ? folders : [];

    return `<div class="field" data-settings-field>
      <div class="ui stackable grid">
        <div class="sixteen wide right aligned middle aligned column" data-settings-control>
          <button type="button" class="ui small basic inverted black button" data-add-watch-folder>
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
        <tbody data-watch-folder-body>
          ${list.map((folder, index) => renderFolderRow(folder, index)).join("")}
        </tbody>
      </table>
    </div>`;
}

function renderFolderRow(folder, index) {
    const safePath = folder && folder.path ? folder.path : "";
    const enabled = Boolean(folder && folder.enabled);

    return `<tr data-watch-folder-row>
      <td>
        <div class="ui fluid input">
          <input
            type="text"
            value="${escapeHtml(safePath)}"
            data-setting-name="discovery.watchFolders.__INDEX__.path"
            name="discovery.watchFolders.${escapeHtml(String(index))}.path"
          />
        </div>
      </td>
      <td class="center aligned">
        <input type="hidden" value="false" data-setting-name="discovery.watchFolders.__INDEX__.enabled" name="discovery.watchFolders.${escapeHtml(String(index))}.enabled" />
        <div class="ui fitted toggle checkbox">
          <input
            type="checkbox"
            value="true"
            data-setting-name="discovery.watchFolders.__INDEX__.enabled"
            name="discovery.watchFolders.${escapeHtml(String(index))}.enabled"
            ${enabled ? "checked" : ""}
          />
          <label></label>
        </div>
      </td>
      <td class="center aligned">
        <div class="ui mini compact basic icon buttons">
          <button type="button" class="ui button" data-remove-watch-folder title="Remove folder">
            <i class="fitted red trash icon"></i>
          </button>
        </div>
      </td>
    </tr>`;
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
