const { buildOriginUrl } = require("../../modules/encoding/navigation");
const { escapeHtml, formatBytes, renderDiscardButton, renderTable } = require("./helpers");

module.exports = function renderPending(items, options = {}) {
  const intake = normalizeIntakeOptions(options);

  return `<section class="ui segment">
      ${intake.enabled ? `<div class="ui inverted charcoal segment">
        <div>
          <h3 class="ui inverted header" style="margin-bottom: 0.35rem;">Add Files To Pending</h3>
        </div>

        <form method="post" action="/api/encoding/pending/import" enctype="multipart/form-data" class="ui inverted small form" data-pending-intake-form>
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

          <div class="ui tiny teal inverted indicating progress" data-upload-progress style="display: none; margin-top: 1rem;">
            <div class="bar"><div class="progress"></div></div>
            <div class="label" data-upload-status>Waiting for files</div>
          </div>

          <div class="ui stackable grid" style="margin-top: 0;">
            <div class="nine wide column">
              <div class="ui tiny inverted list" data-selected-files style="margin-top: 0.75rem;"></div>
              <div class="ui tiny yellow message" data-size-warning style="display: none; margin-top: 0.75rem;">
                Large upload selected. Keep this page open until upload and import finish.
              </div>
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
      </div>` : ""}

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
            <a class="ui compact basic icon button" href="${escapeHtml(buildOriginUrl("/encoding/setup", { id: item.id, source: "pending" }))}" title="Open setup" aria-label="Open setup">
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
          const uploadProgress = root.querySelector("[data-upload-progress]");
          const uploadStatus = root.querySelector("[data-upload-status]");
          const sizeWarning = root.querySelector("[data-size-warning]");
          const submitButton = form ? form.querySelector('button[type="submit"]') : null;
          const LARGE_UPLOAD_WARNING_BYTES = 2 * 1024 * 1024 * 1024;
          let activeRequest = null;
          let pollTimer = null;
          let busy = false;
          let activeUploadState = null;
          let progressReady = false;

          function escapeClientHtml(value) {
            return String(value)
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#39;");
          }

          function formatBytes(bytes) {
            const value = Number(bytes);
            if (!Number.isFinite(value) || value < 0) return "0 B";
            if (value < 1024) return value + " B";
            const units = ["KB", "MB", "GB", "TB"];
            let size = value / 1024;
            let unitIndex = 0;
            while (size >= 1024 && unitIndex < units.length - 1) {
              size /= 1024;
              unitIndex += 1;
            }
            const rounded = size >= 100 ? Math.round(size) : size >= 10 ? size.toFixed(1) : size.toFixed(2);
            return rounded + " " + units[unitIndex];
          }

          function totalSelectedBytes(files) {
            return files.reduce(function (sum, file) {
              return sum + Number(file && file.size || 0);
            }, 0);
          }

          function setBusy(nextBusy) {
            busy = Boolean(nextBusy);
            if (submitButton) {
              submitButton.disabled = busy;
              submitButton.classList.toggle("loading", busy);
            }
            if (chooseButton) {
              chooseButton.disabled = busy;
              chooseButton.classList.toggle("disabled", busy);
            }
            if (fileInput) {
              fileInput.disabled = busy;
            }
            if (dropZone) {
              dropZone.style.pointerEvents = busy ? "none" : "";
              dropZone.style.opacity = busy ? "0.65" : "";
            }
          }

          function updateProgress(percent, statusText) {
            if (!uploadProgress || !uploadStatus) return;
            uploadProgress.style.display = "";
            const safePercent = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
            if (window.$ && window.$.fn && typeof window.$.fn.progress === "function") {
              const $progress = window.$(uploadProgress);
              if (!progressReady) {
                $progress.progress({
                  showActivity: false,
                  autoSuccess: false,
                  text: {
                    percent: "{percent}%"
                  }
                });
                progressReady = true;
              }
              $progress.progress("set percent", safePercent);
            } else {
              const bar = uploadProgress.querySelector(".bar");
              const progressText = uploadProgress.querySelector(".progress");
              if (bar) {
                bar.style.width = safePercent + "%";
              }
              if (progressText) {
                progressText.textContent = safePercent + "%";
              }
              uploadProgress.setAttribute("data-percent", String(safePercent));
            }
            uploadStatus.textContent = statusText;
          }

          function resetProgress() {
            if (!uploadProgress || !uploadStatus) return;
            uploadProgress.style.display = "none";
            if (window.$ && window.$.fn && typeof window.$.fn.progress === "function") {
              const $progress = window.$(uploadProgress);
              if (progressReady) {
                $progress.progress("reset");
              }
            } else {
              const bar = uploadProgress.querySelector(".bar");
              const progressText = uploadProgress.querySelector(".progress");
              if (bar) {
                bar.style.width = "";
              }
              if (progressText) {
                progressText.textContent = "";
              }
              uploadProgress.setAttribute("data-percent", "0");
            }
            uploadStatus.textContent = "Waiting for files";
          }

          function currentBatchFiles() {
            return Array.from(fileInput && fileInput.files ? fileInput.files : []);
          }

          function currentTagValue() {
            const inboxRelativeDirInput = form ? form.querySelector('input[name="inboxRelativeDir"]') : null;
            return inboxRelativeDirInput ? inboxRelativeDirInput.value : "";
          }

          function renderSelectedFiles() {
            if (!selectedFiles || !fileInput) return;
            const files = Array.from(fileInput.files || []);
            const totalBytes = totalSelectedBytes(files);
            if (!files.length) {
              selectedFiles.innerHTML = '<div class="item"><span class="ui grey text">No files selected.</span></div>';
              if (sizeWarning) sizeWarning.style.display = "none";
              return;
            }

            selectedFiles.innerHTML = [
              '<div class="item"><span class="ui grey text">' + escapeClientHtml(String(files.length)) + ' file(s) · ' + escapeClientHtml(formatBytes(totalBytes)) + '</span></div>'
            ].concat(files.map(function (file) {
              return '<div class="item">' + escapeClientHtml(file.name) + '</div>';
            })).join("");

            if (sizeWarning) {
              sizeWarning.style.display = totalBytes >= LARGE_UPLOAD_WARNING_BYTES ? "" : "none";
            }
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

          function replaceSelectedFiles(files) {
            if (!fileInput) return;
            const transfer = new DataTransfer();
            (Array.isArray(files) ? files : []).forEach(function (file) {
              transfer.items.add(file);
            });
            fileInput.files = transfer.files;
            renderSelectedFiles();
          }

          function buildConfirmationMessage(files) {
            const list = Array.isArray(files) ? files : [];
            const totalBytes = totalSelectedBytes(list);
            const tag = currentTagValue() || "root";

            return [
              "Add " + list.length + " file(s) to pending?",
              "",
              "Tag: " + tag,
              "Total size: " + formatBytes(totalBytes)
            ].join("\\n");
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
            form.addEventListener("submit", async function (event) {
              event.preventDefault();
              let files = currentBatchFiles();
              if (busy || !files.length) {
                return;
              }

              if (!window.confirm(buildConfirmationMessage(files))) {
                return;
              }

              try {
                const preflightResponse = await fetch("/api/encoding/pending/preflight", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                  },
                  body: JSON.stringify({
                    inboxRelativeDir: currentTagValue(),
                    filenames: files.map(function (file) { return file.name; })
                  })
                });

                if (!preflightResponse.ok) {
                  throw new Error("Failed to check for duplicate files.");
                }

                const preflightPayload = await preflightResponse.json();
                const preflight = preflightPayload && preflightPayload.result ? preflightPayload.result : null;
                if (!preflight) {
                  throw new Error("Duplicate preflight returned no result.");
                }

                const duplicateNames = new Set(Array.isArray(preflight.duplicates) ? preflight.duplicates : []);
                if (duplicateNames.size) {
                  files = files.filter(function (file) {
                    return !duplicateNames.has(file.name);
                  });
                  replaceSelectedFiles(files);
                  window.alert("Skipped duplicate files for this tag: " + Array.from(duplicateNames).join(", "));
                }
              }
              catch (error) {
                window.alert(error && error.message ? error.message : "Failed to check duplicates.");
                return;
              }

              if (!files.length) {
                return;
              }

              setBusy(true);
              activeUploadState = {
                totalFiles: files.length,
                completedFiles: 0
              };

              try {
                for (let index = 0; index < files.length; index += 1) {
                  const file = files[index];
                  await uploadSingleFile(file, index, files.length);
                  activeUploadState.completedFiles = index + 1;
                }

                updateProgress(100, "All files imported. Refreshing pending list...");
                window.setTimeout(function () {
                  setBusy(false);
                  activeUploadState = null;
                  window.location.reload();
                }, 300);
              }
              catch (error) {
                activeRequest = null;
                activeUploadState = null;
                setBusy(false);
                resetProgress();
                window.alert(error && error.message ? error.message : "Upload failed.");
              }
            });
          }

          function uploadSingleFile(file, fileIndex, totalFiles) {
            return new Promise(function (resolve, reject) {
              const formData = new FormData();
              const currentFileNumber = fileIndex + 1;
              const inboxRelativeDir = currentTagValue();

              formData.append("files", file);
              formData.append("inboxRelativeDir", inboxRelativeDir);

              const request = new XMLHttpRequest();
              activeRequest = request;
              updateProgress(0, "Uploading file " + currentFileNumber + " of " + totalFiles + ": " + file.name);

              request.open("POST", form.action, true);
              request.responseType = "json";

              request.upload.addEventListener("progress", function (progressEvent) {
                if (!progressEvent.lengthComputable) return;
                const percent = (progressEvent.loaded / progressEvent.total) * 100;
                updateProgress(
                  percent,
                  "Uploading file " + currentFileNumber + " of " + totalFiles + ": " + file.name + " (" + formatBytes(progressEvent.loaded) + " of " + formatBytes(progressEvent.total) + ")"
                );
              });

              request.addEventListener("load", function () {
                if (request.status < 200 || request.status >= 300) {
                  const message = request.response && request.response.error
                    ? request.response.error
                    : "Upload failed for " + file.name + ".";
                  activeRequest = null;
                  reject(new Error(message));
                  return;
                }

                const payload = request.response || {};
                const job = payload && payload.job ? payload.job : null;
                if (!job || !job.id) {
                  activeRequest = null;
                  reject(new Error("Upload finished but no import job was created for " + file.name + "."));
                  return;
                }

                updateProgress(100, "Upload complete for " + file.name + ". Importing into pending...");
                activeRequest = null;
                pollImportJob(job.id, file, currentFileNumber, totalFiles).then(resolve).catch(reject);
              });

              request.addEventListener("error", function () {
                activeRequest = null;
                reject(new Error("Upload failed for " + file.name + "."));
              });

              request.addEventListener("abort", function () {
                activeRequest = null;
                reject(new Error("Upload aborted for " + file.name + "."));
              });

              request.send(formData);
            });
          }

          function pollImportJob(jobId, file, currentFileNumber, totalFiles) {
            if (!jobId) {
              return Promise.reject(new Error("Import job id was missing."));
            }

            return new Promise(function (resolve, reject) {
              const tick = function () {
                fetch("/api/encoding/pending/import/" + encodeURIComponent(jobId), {
                  headers: {
                    "Accept": "application/json"
                  }
                })
                  .then(function (response) {
                    if (!response.ok) {
                      throw new Error("Failed to load import status.");
                    }
                    return response.json();
                  })
                  .then(function (payload) {
                    const job = payload && payload.job ? payload.job : null;
                    if (!job) {
                      throw new Error("Import job status was missing.");
                    }

                    const importTotalFiles = Math.max(1, Number(job.totalFiles) || 1);
                    const processedFiles = Math.max(0, Number(job.processedFiles) || 0);
                    const percent = Math.round((processedFiles / importTotalFiles) * 100);
                    updateProgress(
                      percent,
                      "Importing file " + currentFileNumber + " of " + totalFiles + ": " + file.name
                    );

                    if (job.status === "failed") {
                      if (pollTimer) {
                        window.clearTimeout(pollTimer);
                        pollTimer = null;
                      }
                      reject(new Error(job.error || ("Import failed for " + file.name + ".")));
                      return;
                    }

                    if (job.status === "completed") {
                      if (pollTimer) {
                        window.clearTimeout(pollTimer);
                        pollTimer = null;
                      }
                      updateProgress(
                        100,
                        "Completed file " + currentFileNumber + " of " + totalFiles + ": " + file.name
                      );
                      resolve(job);
                      return;
                    }

                    pollTimer = window.setTimeout(tick, 750);
                  })
                  .catch(function (error) {
                    if (pollTimer) {
                      window.clearTimeout(pollTimer);
                      pollTimer = null;
                    }
                    reject(error);
                  });
              };

              tick();
            });
          }

          window.addEventListener("beforeunload", function (event) {
            if (!busy) return;
            event.preventDefault();
            event.returnValue = "";
          });
        })();
      </script>
    </section>`;
};

function normalizeIntakeOptions(options) {
  const source = options && typeof options === "object" ? options : {};

  return {
    enabled: Boolean(source.enabled),
    inboxRelativeDir: String(source.inboxRelativeDir || "library")
  };
}
