const {
    escapeHtml,
    formatBitrate,
    formatBytes,
    formatDateTime,
    formatDuration
} = require("./helpers");

module.exports = function renderReviewItem(item, {
    encodedPreviewUrl,
    outcome = null,
    retainSourceByDefault = true
} = {}) {
    if (!item) {
        return `<section class="ui inverted segment">
          <div class="ui placeholder segment">
            <div class="ui icon header">
              <i class="eye slash outline icon"></i>
              Review item not found.
            </div>
          </div>
        </section>`;
    }

    const canReview = String(item.status || "").toLowerCase() === "review";
    const source = canReview
        ? (item.sourceMetadata || {})
        : (outcome && outcome.sourceMetadata) || item.sourceMetadata || {};
    const encoded = canReview
        ? (item.encodedMetadata || {})
        : (outcome && outcome.outputMetadata) || item.encodedMetadata || {};

    return `<section class="ui inverted segment">
      ${renderVideo(encodedPreviewUrl)}
      ${renderHeader(item, outcome, canReview)}
      ${canReview
        ? renderReviewData(item, outcome, source, encoded)
        : renderOutcomeData(item, outcome, source, encoded)
      }
      ${renderActions(item, canReview, retainSourceByDefault)}
    </section>`;
};

function renderHeader(item, outcome, canReview) {
    const displayFilename = item && item.outputFilename
        ? item.outputFilename
        : item && item.originalFilename
            ? item.originalFilename
            : "Encoded Output";
    return `
      <h3 class="ui inverted header">
        <div class="content">
          ${escapeHtml(displayFilename)}
          ${!canReview && outcome
            ? `<span class="sub header">Attempt ${escapeHtml(String(outcome.attemptNumber || 1))} · ${escapeHtml(item.profileId || outcome.profileId || "—")}</span>`
            : ""
          }
        </div>
      </h3>`;
}

function renderVideo(encodedPreviewUrl) {
    if (!encodedPreviewUrl) {
        return "";
    }

    return `
      <section class="video-box">
        <video controls preload="metadata">
          <source src="${escapeHtml(encodedPreviewUrl)}" />
        </video>
    </section>`;
}

function renderReviewData(item, outcome, source, encoded) {
    return `<section class="">
      ${renderReceiptData(item, outcome)}
      <div class="ui inverted charcoal segment">
        <div class="ui four column stackable compact grid">
          ${renderOutcomeMetric("Size", formatBytes(encoded.fileSizeBytes), formatBytes(source.fileSizeBytes), formatLiveSizeDiff(encoded.fileSizeBytes, source.fileSizeBytes))}
          ${renderOutcomeMetric("Bit Rate", formatBitrate(encoded.bitRate), formatBitrate(source.bitRate), formatPercentDiff(encoded.bitRate, source.bitRate))}
          ${renderOutcomeMetric("Resolution", formatResolution(encoded.width, encoded.height), formatResolution(source.width, source.height), formatResolutionDiff(encoded, source))}
          ${renderOutcomeMetric("FPS", formatFps(encoded.frameRate), formatFps(source.frameRate), formatPercentDiff(encoded.frameRate, source.frameRate))}
          ${renderOutcomeMetric("Duration", formatDuration(encoded.durationMs), formatDuration(source.durationMs))}
          ${renderOutcomeMetric("Container", encoded.container || "—", source.container || "—")}
          ${renderOutcomeMetric("Codec", encoded.videoCodec || "—", source.videoCodec || "—")}
          ${renderOutcomeMetric("Pixel Format", getPixelFormat(encoded), getPixelFormat(source))}
        </div>
      </div>
    </section>`;
}

function renderOutcomeData(item, outcome, source, encoded) {
    return `<section>
      ${renderReceiptData(item, outcome)}
      <div class="ui inverted charcoal segment">
        <div class="ui four column stackable compact grid">
          ${renderOutcomeMetric("Size", formatBytes(encoded.fileSizeBytes), formatBytes(source.fileSizeBytes), formatSavedSizeDiff(
            outcome ? outcome.sizeDeltaBytes : encoded.fileSizeBytes - source.fileSizeBytes,
            outcome ? outcome.sizeDeltaPercent : calculatePercentDiff(encoded.fileSizeBytes, source.fileSizeBytes)
          ))}
          ${renderOutcomeMetric("Bit Rate", formatBitrate(encoded.bitRate), formatBitrate(source.bitRate), formatBitrateDiff(
            outcome ? outcome.bitrateDeltaBps : encoded.bitRate - source.bitRate,
            outcome ? outcome.bitrateDeltaPercent : calculatePercentDiff(encoded.bitRate, source.bitRate)
          ))}
          ${renderOutcomeMetric("Resolution", formatResolution(encoded.width, encoded.height), formatResolution(source.width, source.height), formatResolutionDiff(encoded, source))}
          ${renderOutcomeMetric("FPS", formatFps(encoded.frameRate), formatFps(source.frameRate), formatPercentDiff(encoded.frameRate, source.frameRate))}
          ${renderOutcomeMetric("Duration", formatDuration(encoded.durationMs), formatDuration(source.durationMs))}
          ${renderOutcomeMetric("Container", encoded.container || "—", source.container || "—")}
          ${renderOutcomeMetric("Codec", encoded.videoCodec || "—", source.videoCodec || "—")}
          ${renderOutcomeMetric("Pixel Format", getPixelFormat(encoded), getPixelFormat(source))}
        </div>
      </div>
    </section>`;
}

function renderReceiptData(item, outcome) {
    const status = String(item.status || "unknown");
    const requestedAt = (outcome && outcome.requestedAt) || item.queuedAt || item.requestedAt || item.createdAt;
    const finishedAt = (outcome && outcome.encodingFinishedAt) || item.completedAt || item.updatedAt;
    const profile = item.profileId || (outcome && outcome.profileId) || "—";

    return `
      <div class="ui four column stackable compact grid">
        ${renderInlineMetric("Status", status)}
        ${renderInlineMetric("Source", item.inboxRelativeDir ? `/${item.inboxRelativeDir}` : "/")}
        ${renderInlineMetric("Requested", formatDateTime(requestedAt))}
        ${renderInlineMetric("Finished", formatDateTime(finishedAt))}
      </div>
      <div class="ui four column stackable compact grid">
        ${renderInlineMetric("Completed In", formatDuration(outcome && outcome.activeEncodingMs))}
        ${renderInlineMetric("Paused Time", formatDuration(outcome && outcome.pausedMs))}
        ${renderInlineMetric("Elapsed Time", formatDuration(outcome && outcome.wallClockMs))}
        ${renderInlineMetric("Profile", profile)}
      </div>`;
}

function renderActions(item, canReview, retainSourceByDefault) {
    if (!canReview) {
        return ``;
    }

    const disabledClass = "";
    const sourceAction = retainSourceByDefault ? "retain" : "delete";

    return `<section class="ui inverted horizontally fitted segment">
      <div class="ui stackable bottom aligned grid">
        <div class="seven wide column">
          <div class="ui inverted tiny header">Source</div>
          <div class="ui form">
            <div class="inline field" style="display: flex; align-items: center; gap: 12px;">
              <span class="ui ${canReview ? "grey" : "disabled grey"} text">Delete</span>
              <div class="ui fitted toggle checkbox">
                <input
                  type="checkbox"
                  name="retainSourceSwitch"
                  value="retain"
                  ${retainSourceByDefault ? "checked" : ""}
                  ${canReview ? "" : "disabled"}
                  onchange="window.updateSourceActionSwitch(this)"
                />
                <label></label>
              </div>
              <span class="ui ${canReview ? "teal" : "disabled teal"} text">Retain</span>
            </div>
          </div>
        </div>
        <div class="nine wide right aligned column">
          <a class="ui blue button" href="/encoding/setup?id=${encodeURIComponent(item.id)}" title="Redo keeps the current output until the replacement encode succeeds.">
            <i class="redo icon"></i>
            Redo
          </a>
          <form method="post" action="/api/encoding/items/${encodeURIComponent(item.id)}/reject" data-api-form data-confirm="Reject this encode? The output will be moved to Outbox/rejected and the source receipt will stay available for requeue." style="display: inline-block;">
            <input type="hidden" name="reviewer" value="operator" />
            <button type="submit" class="ui red ${disabledClass} button" ${canReview ? "" : "disabled"}>
              <i class="ban icon"></i>
              Reject
            </button>
          </form>
          <form method="post" action="/api/encoding/items/${encodeURIComponent(item.id)}/approve" data-api-form data-confirm="Approve this encode and apply the selected source handling?" style="display: inline-block;">
            <input type="hidden" name="reviewer" value="operator" />
            <input type="hidden" name="sourceAction" value="${escapeHtml(sourceAction)}" data-source-action-input />
            <button type="submit" class="ui green ${disabledClass} button" ${canReview ? "" : "disabled"}>
              <i class="check icon"></i>
              Commit
            </button>
          </form>
        </div>
      </div>
    </section>`;
}

function renderInlineMetric(label, value) {
    return `<div class="column">
      <span class="ui grey text">${escapeHtml(label)}: </span>
      <span class="ui inverted text">${escapeHtml(value == null ? "—" : String(value))}</span>
    </div>`;
}

function renderOutcomeMetric(label, encodedValue, sourceValue, detail = null) {
    const sourceText = sourceValue == null ? "—" : String(sourceValue);
    const detailText = detail ? `${sourceText} (${detail})` : sourceText;

    return `<div class="column">
      <div><span class="ui grey text">${escapeHtml(label.toUpperCase())}</span></div>
      <div><span class="ui inverted text">${escapeHtml(encodedValue == null ? "—" : String(encodedValue))}</span></div>
      <div><span class="ui grey text">${escapeHtml(detailText)}</span></div>
    </div>`;
}

function formatResolution(width, height) {
    const safeWidth = Number(width || 0);
    const safeHeight = Number(height || 0);
    return safeWidth > 0 && safeHeight > 0 ? `${safeWidth} x ${safeHeight}` : "—";
}

function formatFps(value) {
    const fps = Number(value || 0);
    if (!Number.isFinite(fps) || fps <= 0) return "—";
    return Number.isInteger(fps) ? String(fps) : fps.toFixed(3).replace(/\.?0+$/, "");
}

function formatLiveSizeDiff(encodedBytes, sourceBytes) {
    const encoded = Number(encodedBytes || 0);
    const source = Number(sourceBytes || 0);
    if (!encoded || !source) return null;

    return formatSavedSizeDiff(encoded - source, calculatePercentDiff(encoded, source));
}

function formatSavedSizeDiff(delta, percent) {
    const safeDelta = Number(delta || 0);
    const safePercent = Number(percent);
    if (!Number.isFinite(safeDelta) || !Number.isFinite(safePercent) || !safeDelta) return null;

    const sign = safeDelta > 0 ? "+" : "-";
    return `${sign}${formatBytes(Math.abs(safeDelta))}, ${safePercent > 0 ? "+" : ""}${safePercent.toFixed(1)}%`;
}

function formatPercentDiff(encodedValue, sourceValue) {
    const encoded = Number(encodedValue || 0);
    const source = Number(sourceValue || 0);
    if (!encoded || !source) return null;

    const percent = ((encoded - source) / source) * 100;
    return `${percent > 0 ? "+" : ""}${percent.toFixed(1)}%`;
}

function formatResolutionDiff(encoded, source) {
    const encodedPixels = Number(encoded && encoded.width || 0) * Number(encoded && encoded.height || 0);
    const sourcePixels = Number(source && source.width || 0) * Number(source && source.height || 0);
    if (!encodedPixels || !sourcePixels) return null;

    const percent = ((encodedPixels - sourcePixels) / sourcePixels) * 100;
    return `${percent > 0 ? "+" : ""}${percent.toFixed(1)}%`;
}

function formatBitrateDiff(delta, percent) {
    const safeDelta = Number(delta || 0);
    const safePercent = Number(percent);
    if (!Number.isFinite(safeDelta) || !Number.isFinite(safePercent) || !safeDelta) return null;

    return `${safeDelta > 0 ? "+" : "-"}${Math.round(Math.abs(safeDelta) / 1000).toLocaleString()} kbps, ${safePercent > 0 ? "+" : ""}${safePercent.toFixed(1)}%`;
}

function calculatePercentDiff(encodedValue, sourceValue) {
    const encoded = Number(encodedValue || 0);
    const source = Number(sourceValue || 0);
    if (!encoded || !source) return null;
    return ((encoded - source) / source) * 100;
}

function getPixelFormat(metadata) {
    const probeJson = metadata && metadata.probeJson ? metadata.probeJson : null;
    const streams = Array.isArray(probeJson && probeJson.streams) ? probeJson.streams : [];
    const videoStream = streams.find(stream => stream.codec_type === "video") || null;
    return videoStream && videoStream.pix_fmt ? String(videoStream.pix_fmt) : "—";
}
