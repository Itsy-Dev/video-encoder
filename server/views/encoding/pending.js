const { escapeHtml, formatBytes, renderDiscardButton, renderTable } = require("./helpers");

module.exports = function renderPending(items, options = {}) {
  const intake = normalizeIntakeOptions(options);

  return `<section class="ui segment">
      <div class="ui inverted charcoal segment">
        <div>
          <h3 class="ui inverted header" style="margin-bottom: 0.35rem;">Add Files To Pending</h3>
        </div>

        <form method="post" action="/encoding/pending/import" enctype="multipart/form-data" class="ui inverted small form" data-pending-intake-form>
          <div class="field" style="margin-top: 1rem;">
            <input type="file" name="files" accept="video/*,.mp4,.mov,.mkv,.m4v,.avi,.webm,.wmv,.mpeg,.mpg,.ts,.flv" multiple data-file-input style="display: none;" />
            <div class="ui small placeholder teal segment" data-drop-zone style="min-height: 14rem; cursor: pointer;">
              <div class="ui icon header">
                <div>
                  <i class="large cloud download icon"></i>
                  <div class="content" style="margin-top: 0.5rem;">Drop Video Files Here</div>
                                <span class="ui small grey text">Drop videos from Finder here or choose them from disk, </br> then route them into a subdirectory like <code>library</code>.</span>

                </div>
              </div>

              <button type="button" class="ui small button" data-choose-files>Click to Choose</button>
            </div>
          </div>

          <div class="ui stackable grid" style="margin-top: 0;">
            <div class="nine wide column">
              <div class="ui tiny inverted list" data-selected-files style="margin-top: 0.75rem;"></div>
            </div>
            <div class="four wide right aligned column">
              <div class="field" style="display: inline-block; width: 100%; max-width: 18rem; text-align: left; margin-bottom: 0;">
                <div class="ui small fluid labeled input">
                  <label class="ui inverted label">Tag Files:</label>
                  <input type="text" name="inboxRelativeDir" value="${escapeHtml(intake.inboxRelativeDir)}" placeholder="library" />
                </div>
              </div>
            </div>
            <div class="three wide right aligned column">
              <button type="submit" class="ui small primary icon button">
                <i class="plus icon"></i>
                Add To Pending
              </button>
            </div>
          </div>
        </form>
      </div>

      <div class="ui inverted divider"></div>
      <div class="ui stackable middle aligned grid">
        <div class="ten wide column">
          <h4 class="ui inverted header">
            <i class="folder open icon"></i>
            <div class="content">Pending Files</div>
          </h4>
        </div>
        <div class="six wide right aligned middle aligned column">
          <form method="post" action="/api/encoding/scan" data-api-form>
            <button type="submit" class="ui primary small compact icon button">
              <i class="sync alternate icon"></i>
              Scan Inbox
            </button>
          </form>
        </div>
      </div>
      ${renderTable(items, [
        ["Actions", item => `
          <div class="ui mini icon buttons">
            <a class="ui compact basic icon button" href="/encoding/setup?id=${encodeURIComponent(item.id)}" title="Open setup" aria-label="Open setup">
              <i class="large fitted orange cog icon"></i>
            </a>
            ${renderDiscardButton(item, { basic: true, compact: true, iconOnly: true })}
          </div>
        `, { width: "one", align: "center" }],
        ["Source", item => escapeHtml(item.inboxRelativeDir || "--"), { width: "one" }],
        ["File", item => escapeHtml(item.originalFilename)],
        ["Size", item => escapeHtml(formatBytes(item && item.sourceMetadata ? item.sourceMetadata.fileSizeBytes : null)), { width: "one", align: "right" }],
      ], "No pending items yet. Scan the inbox or add videos here to start the flow.")}

      <script>
        (function () {
          const root = document.currentScript && document.currentScript.parentElement;
          if (!root) return;

          const form = root.querySelector("[data-pending-intake-form]");
          const dropZone = root.querySelector("[data-drop-zone]");
          const fileInput = root.querySelector("[data-file-input]");
          const chooseButton = root.querySelector("[data-choose-files]");
          const selectedFiles = root.querySelector("[data-selected-files]");

          function escapeClientHtml(value) {
            return String(value)
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#39;");
          }

          function renderSelectedFiles() {
            if (!selectedFiles || !fileInput) return;
            const files = Array.from(fileInput.files || []);
            if (!files.length) {
              selectedFiles.innerHTML = '<div class="item"><span class="ui grey text">No files selected.</span></div>';
              return;
            }

            selectedFiles.innerHTML = files.map(function (file) {
              return '<div class="item">' + escapeClientHtml(file.name) + '</div>';
            }).join("");
          }

          function setFiles(fileList) {
            if (!fileInput || !fileList) return;
            try {
              const transfer = new DataTransfer();
              Array.from(fileList).forEach(function (file) {
                transfer.items.add(file);
              });
              fileInput.files = transfer.files;
              renderSelectedFiles();
            }
            catch (_error) {
              renderSelectedFiles();
            }
          }

          if (fileInput) {
            fileInput.addEventListener("change", renderSelectedFiles);
            renderSelectedFiles();
          }

          if (dropZone && fileInput) {
            ["dragenter", "dragover"].forEach(function (eventName) {
              dropZone.addEventListener(eventName, function (event) {
                event.preventDefault();
                dropZone.classList.add("teal");
              });
            });

            ["dragleave", "drop"].forEach(function (eventName) {
              dropZone.addEventListener(eventName, function (event) {
                event.preventDefault();
                dropZone.classList.remove("teal");
              });
            });

            dropZone.addEventListener("drop", function (event) {
              const files = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files : null;
              if (!files || !files.length) return;
              setFiles(files);
            });

            dropZone.addEventListener("click", function () {
              fileInput.click();
            });
          }

          if (chooseButton && fileInput) {
            chooseButton.addEventListener("click", function (event) {
              event.preventDefault();
              event.stopPropagation();
              fileInput.click();
            });
          }

          if (form) {
            form.addEventListener("submit", function () {
              const submitButton = form.querySelector('button[type="submit"]');
              if (!submitButton) return;
              submitButton.disabled = true;
              submitButton.textContent = "Adding...";
            });
          }
        })();
      </script>
    </section>`;
};

function normalizeIntakeOptions(options) {
  const source = options && typeof options === "object" ? options : {};

  return {
    imported: safeCount(source.imported),
    duplicates: safeCount(source.duplicates),
    invalid: safeCount(source.invalid),
    inboxRelativeDir: String(source.inboxRelativeDir || "library")
  };
}

function safeCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.round(count) : 0;
}
