const {
    escapeHtml,
    formatBitrate,
    formatBytes,
    formatDateTime,
    formatDuration
} = require("./helpers");

module.exports = function renderReviewItem(item, { encodedPreviewUrl } = {}) {
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

    const source = item.sourceMetadata || {};
    const encoded = item.encodedMetadata || {};
    const canReview = String(item.status || "").toLowerCase() === "review";

    return `<section class="ui inverted segment">
      ${renderVideo(item, encodedPreviewUrl)}
      ${renderHeader(item)}
      ${renderData(item, source, encoded)}
      ${renderActions(item, canReview)}
    </section>`;
};

function renderHeader(item) {
    const status = String(item.status || "unknown").toLowerCase();

    return `
      <h3 class="ui inverted header">
        <div class="content">${escapeHtml(item.originalFilename || "Encoded Output")}</div>
      </h3>`;
}

function renderVideo(item, encodedPreviewUrl) {
    return `
      <section class="video-box">
        ${encodedPreviewUrl
          ? `<video controls preload="metadata">
              <source src="${escapeHtml(encodedPreviewUrl)}" />
            </video>`
          : `<div class="ui warning inverted message">Encoded output is not available for browser playback.</div>`
        }
    </section>`;
}

function renderData(item, source, encoded) {
    return `<section class="">
      <div class="ui four column stackable compact grid">
        ${renderInlineMetric("Profile", item.profileId || "—")}
        ${renderInlineMetric("Source", item.inboxRelativeDir ? `/${item.inboxRelativeDir}` : "/")}
        ${renderInlineMetric("Requested", formatDateTime(item.queuedAt || item.requestedAt || item.createdAt))}
        ${renderInlineMetric("Completed", formatDateTime(item.completedAt || item.updatedAt))}
      </div>
      <div class="ui hidden divider"></div>
      <div class="ui inverted charcoal segment">
        <div class="ui four column stackable compact grid">
          ${renderOutcomeMetric("Size", formatBytes(encoded.fileSizeBytes), formatBytes(source.fileSizeBytes), formatSizeDiff(encoded.fileSizeBytes, source.fileSizeBytes))}
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

function renderActions(item, canReview) {
    const disabledClass = canReview ? "" : "disabled";

    return `<section class="ui inverted horizontally fitted segment">
      <div class="ui stackable bottom aligned grid">
        <div class="seven wide column">
          <div class="ui small buttons">
            <a class="ui teal active disabled button">Retain Source</a>
          </div>
        </div>
        <div class="nine wide right aligned column">
          <a class="ui blue button" href="/encoding/setup?id=${encodeURIComponent(item.id)}">
            <i class="redo icon"></i>
            Redo
          </a>
          <form method="post" action="/api/encoding/items/${encodeURIComponent(item.id)}/reject" data-api-form data-confirm="Reject this encode? The encoded output will be removed and the source will stay available for requeue." style="display: inline-block;">
            <input type="hidden" name="reviewer" value="operator" />
            <button type="submit" class="ui red ${disabledClass} button" ${canReview ? "" : "disabled"}>
              <i class="ban icon"></i>
              Reject
            </button>
          </form>
          <form method="post" action="/api/encoding/items/${encodeURIComponent(item.id)}/approve" data-api-form data-confirm="Approve this encode and move it to outbox? This removes the encoder's internal working copy." style="display: inline-block;">
            <input type="hidden" name="reviewer" value="operator" />
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

function formatSizeDiff(encodedBytes, sourceBytes) {
    const encoded = Number(encodedBytes || 0);
    const source = Number(sourceBytes || 0);
    if (!encoded || !source) return null;

    const delta = encoded - source;
    const percent = (delta / source) * 100;
    const sign = delta > 0 ? "+" : "";

    return `${sign}${formatBytes(Math.abs(delta))}${delta < 0 ? " smaller" : delta > 0 ? " larger" : ""}, ${percent > 0 ? "+" : ""}${percent.toFixed(1)}%`;
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

function getPixelFormat(metadata) {
    const probeJson = metadata && metadata.probeJson ? metadata.probeJson : null;
    const streams = Array.isArray(probeJson && probeJson.streams) ? probeJson.streams : [];
    const videoStream = streams.find(stream => stream.codec_type === "video") || null;
    return videoStream && videoStream.pix_fmt ? String(videoStream.pix_fmt) : "—";
}
