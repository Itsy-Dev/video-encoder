const {
    escapeHtml,
    formatBitrate,
    formatBytes,
    formatDuration
} = require("./helpers");

module.exports = function renderWatch(item, { sourcePreviewUrl } = {}) {
    if (!item) {
        return `<section class="ui inverted segment">
          <div class="ui placeholder segment">
            <div class="ui icon header">
              <i class="eye slash outline icon"></i>
              No encoding item is available to view.
            </div>
          </div>
        </section>`;
    }

    const source = item.sourceMetadata || {};

    return `<section class="ui inverted segment">
      ${renderVideo(sourcePreviewUrl)}
      ${renderHeader(item)}
      <section class="ui inverted charcoal segment">
        <div class="ui four column stackable compact grid">
          ${renderMetric("Status", item.status || "unknown")}
          ${renderMetric("Profile", item.profileId || item.requestedProfileId || "—")}
          ${renderMetric("Duration", formatDuration(source.durationMs))}
          ${renderMetric("Size", formatBytes(source.fileSizeBytes))}
          ${renderMetric("Container", source.container || "—")}
          ${renderMetric("Codec", source.videoCodec || "—")}
          ${renderMetric("Resolution", formatResolution(source.width, source.height))}
          ${renderMetric("Bit Rate", formatBitrate(source.bitRate))}
        </div>
      </section>
    </section>`;
};

function renderHeader(item) {
    return `
      <h3 class="ui inverted header">
        <div class="content encoder-file-cell">
          ${escapeHtml(item.originalFilename || "Source Video")}
          <span class="sub header">/${escapeHtml(item.inboxRelativeDir || "")}</span>
        </div>
      </h3>`;
}

function renderVideo(sourcePreviewUrl) {
    if (!sourcePreviewUrl) {
        return "";
    }

    return `
      <section class="video-box">
        <video controls preload="metadata">
          <source src="${escapeHtml(sourcePreviewUrl)}" />
        </video>
    </section>`;
}

function renderMetric(label, value) {
    return `<div class="column">
      <div><span class="ui grey text">${escapeHtml(label)}</span></div>
      <div><span class="ui inverted text">${escapeHtml(value == null ? "—" : String(value))}</span></div>
    </div>`;
}

function formatResolution(width, height) {
    const safeWidth = Number(width || 0);
    const safeHeight = Number(height || 0);
    return safeWidth > 0 && safeHeight > 0 ? `${safeWidth} x ${safeHeight}` : "—";
}
