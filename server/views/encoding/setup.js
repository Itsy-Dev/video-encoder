const {
    formatAspectRatio,
    escapeHtml,
    formatBitrate,
    formatBytes,
    formatDuration,
    renderDiscardButton
} = require("./helpers");
const {
    describeScalePolicy,
    resolveScalePlan
} = require("../../modules/encoding/scale-policy");

module.exports = function renderSetup(item, profiles, { selectedProfileId, sourcePreviewUrl } = {}) {
    if (!item) {
        return `<section class="ui segment encoder-panel"><div class="ui placeholder segment"><div class="ui header">No discovered item is available for setup yet.</div></div></section>`;
    }

    const source = item.sourceMetadata || {};
    const selectedProfile = profiles.find(profile => profile.id === selectedProfileId)
        || profiles.find(profile => profile.id === item.profileId)
        || profiles[0]
        || null;
    const scalePlan = resolveScalePlan(selectedProfile, source);
    const estimate = buildEstimate(source, selectedProfile, scalePlan);
    const responseAt = item.queuedAt || item.updatedAt || item.createdAt || null;
    const isQueued = String(item.status || "").toLowerCase() === "queued";
    const confirmLabel = isQueued ? "Update" : "Confirm";
    const confirmTitle = isQueued
        ? "Update the queued item with the selected profile and options."
        : "Confirm the selected profile and send this item to the queue.";

    return `<section id="encoding-setup-root" class="ui inverted segment">
      <div class="ui inverted segment charcoal">
        <div class="ui stackable grid">
          <div class="four wide column">
            ${renderSourceThumbnail(item, sourcePreviewUrl)}
          </div>
          <div class="twelve wide column">
            <h3 class="ui inverted header">
              <div class="content">
                ${escapeHtml(item.originalFilename)}
                <span class="sub header">
                  /${escapeHtml(item.inboxRelativeDir || "")}
                </span>
              </div>
            </h3>
            <div class="encoding-metdata-grid">
              ${renderMetric("Duration", formatDuration(source.durationMs))}
              ${renderMetric("Container", source.container || "—")}
              ${renderMetric("Codec", source.videoCodec || "—")}
              ${renderMetric("Pixel Format", getPixelFormat(source))}
              ${renderMetric("Size", formatBytes(source.fileSizeBytes))}
              ${renderMetric("Resolution", formatResolution(source.width, source.height))}
              ${renderMetric("Aspect Ratio", formatAspectRatio(source))}
              ${renderMetric("Aspect Family", scalePlan.family ? scalePlan.family.label : "—")}
              ${renderMetric("FPS", formatFps(source.frameRate))}
              ${renderMetric("Bit Rate", formatBitrate(source.bitRate))}
            </div>
          </div>
        </div>
      </div>

      <div class="ui hidden divider"></div>

      <div class="ui inverted segment charcoal">
        <h3 class="ui inverted small header">Encoding Profile / Options</h3>

        <form method="get" action="/encoding/setup/fragment" class="ui inverted form">
          <input type="hidden" name="id" value="${escapeHtml(item.id)}" />
          <div class="fields">
            <div class="six wide field">
              <label>Profile</label>
              <select class="ui fluid dropdown" name="profileId" onchange="reloadSetupProfile(this.form)">
                ${profiles.map(profile => `<option value="${escapeHtml(profile.id)}"${profile.id === (selectedProfile && selectedProfile.id) ? " selected" : ""}>${escapeHtml(profile.label)}</option>`).join("")}
              </select>
            </div>
            <div class="ten wide disabled field">
              <label>Description</label>
              <input type="text" disabled value="${escapeHtml(selectedProfile && selectedProfile.description || "")}" />
            </div>
          </div>
        </form>

        <form id="setup-queue-form" class="ui inverted form form-stack" method="post" action="/api/encoding/items/${encodeURIComponent(item.id)}/queue" data-api-form>
          <input type="hidden" name="profileId" value="${escapeHtml(selectedProfile && selectedProfile.id || "")}" />
          <input type="hidden" name="inboxRelativeDir" value="${escapeHtml(item.inboxRelativeDir || "")}" />
          <div class="four fields">
            ${renderDisabledField("CRF", selectedProfile && selectedProfile.crf != null ? selectedProfile.crf : "—")}
            ${renderDisabledField("Target Tier", selectedProfile && selectedProfile.targetTier ? selectedProfile.targetTier.label : "—")}
            ${renderDisabledField("Scale Mode", selectedProfile && selectedProfile.scaleMode ? selectedProfile.scaleMode.label : "—")}
            ${renderDisabledField("Preset", selectedProfile && selectedProfile.preset ? selectedProfile.preset.label : "—")}
          </div>
          <div class="four fields">
            ${renderDisabledField("Container", selectedProfile && selectedProfile.container ? selectedProfile.container.label : "—")}
            ${renderDisabledField("Video Codec", selectedProfile && selectedProfile.videoCodec ? selectedProfile.videoCodec.label : "—")}
            ${renderDisabledField("Pixel Format", selectedProfile && selectedProfile.pixelFormat ? selectedProfile.pixelFormat.label : "—")}
            ${renderDisabledField("Profile", selectedProfile && selectedProfile.profile ? selectedProfile.profile.label : "Auto")}
          </div>
          <div class="four fields">
            ${renderDisabledField("Audio Codec", selectedProfile && selectedProfile.audioCodec ? selectedProfile.audioCodec.label : "—")}
            ${renderDisabledField("Audio Bitrate", selectedProfile && selectedProfile.audioBitrate ? selectedProfile.audioBitrate.label : "—")}
            ${renderDisabledField("Channels", selectedProfile && selectedProfile.audioChannels ? selectedProfile.audioChannels.label : "Stereo")}
            ${renderDisabledField("Sample Rate", selectedProfile && selectedProfile.sampleRate ? selectedProfile.sampleRate.label : "48 kHz")}
          </div>
          <div class="four fields">
            ${renderDisabledField("Scaling Algorithm", selectedProfile && selectedProfile.scaling ? selectedProfile.scaling.label : "—")}
            ${renderDisabledField("Tier Fallback", selectedProfile && selectedProfile.tierFallback ? selectedProfile.tierFallback.label : "—")}
            ${renderDisabledField("Custom Fallback", selectedProfile && selectedProfile.customFamilyFallback ? selectedProfile.customFamilyFallback.label : "—")}
            ${renderDisabledField("Level", selectedProfile && selectedProfile.level ? selectedProfile.level.label : "Auto")}
          </div>
          <div class="four fields">
            ${renderDisabledField("Fast Start", selectedProfile && selectedProfile.fastStart ? selectedProfile.fastStart.label : "Auto")}
            ${renderDisabledField("Subtitles", selectedProfile && selectedProfile.subtitleMode ? selectedProfile.subtitleMode.label : "—")}
            ${renderDisabledField("Scale Policy", describeScalePolicy(selectedProfile))}
            ${renderDisabledField("Decision", buildScaleDecision(scalePlan))}
          </div>
        </form>
      </div>

      <div class="ui hidden divider"></div>

      <div class="ui inverted segment charcoal">
        <h3 class="ui inverted small header">Video Outcome</h3>
        <div class="ui seven column stackable inverted compact grid">
          ${renderOutcomeMetric("Size", formatBytes(source.fileSizeBytes), formatBytes(estimate.sizeBytes), estimate.sizeDeltaBytes <= 0 ? "green" : "yellow", formatSizeChange(estimate.sizeDeltaBytes, source.fileSizeBytes))}
          ${renderOutcomeMetric("Resolution", formatResolution(source.width, source.height), formatResolution(estimate.width, estimate.height))}
          ${renderOutcomeMetric("Aspect Ratio", formatAspectRatio(source), formatAspectRatio(estimate.width, estimate.height))}
          ${renderOutcomeMetric("Target Standard", scalePlan.family ? scalePlan.family.label : "—", estimate.targetStandardLabel)}
          ${renderOutcomeMetric("FPS", formatFps(source.frameRate), formatFps(estimate.fps))}
          ${renderOutcomeMetric("Bitrate", formatBitrate(source.bitRate), formatBitrate(estimate.videoBitrateBps), null, formatBitrateChange(estimate.videoBitrateBps, source.bitRate))}
          ${renderOutcomeMetric("Container", source.container || "—", estimate.container)}
          ${renderOutcomeMetric("Codec", source.videoCodec || "—", estimate.videoCodec)}
          ${renderOutcomeMetric("Format", getPixelFormat(source), estimate.pixelFormat)}
        </div>
      </div>

      <div class="ui hidden divider"></div>

      <div class="ui inverted segment charcoal">
        <div class="ui stackable middle aligned right aligned grid">
          <div class="fourteen wide column">
            <span class="ui small text" style="margin-top: 6px;">Status: ${escapeHtml(String(item.status || "unknown"))}</span>
            <span class="ui small grey text">${escapeHtml(formatResponseTimestamp(responseAt))}</span>
          </div>
          <div class="two wide right aligned column">
            <button
              type="submit"
              form="setup-queue-form"
              class="ui primary icon button"
              title="${escapeHtml(confirmTitle)}"
              aria-label="${escapeHtml(confirmTitle)}"
            >
              <i class="save icon"></i>
              ${escapeHtml(confirmLabel)}
            </button>
          </div>
        </div>
      </div>
    </section>`;
};

function renderSourceThumbnail(item, sourcePreviewUrl) {
  const previewUrl = sourcePreviewUrl || `/api/encoding/items/${encodeURIComponent(item.id)}/source`;

  return `
    <a class="ui rounded bordered image"
      href="${escapeHtml(previewUrl)}"
      target="_blank"
      rel="noopener noreferrer"
      class="ui rounded bordered image"
      title="Open source video in new tab"
      aria-label="Open source video in new tab"
    >
      <img class="" src="/assets/placeholder.png"/>
      <div class="ui small top right attached basic black icon label">
      <i class="external alternate icon"></i>
      </div>
    </a>`;
}

function renderMetric(label, value) {
    return `<div class="encoding-setup-info-cell">
      <div><span class="ui grey text">${escapeHtml(label)}</span></div>
      <div><span class="ui inverted text">${escapeHtml(value == null ? "—" : String(value))}</span></div>
    </div>`;
}

function renderDisabledField(label, value) {
    return `<div class="field disabled">
      <label>${escapeHtml(label)}</label>
      <input type="text" disabled value="${escapeHtml(value == null ? "—" : String(value))}" />
    </div>`;
}

function renderOutcomeMetric(label, before, after, color = null, change = null) {
    const afterClass = color ? `ui inverted ${color} text` : "ui inverted text";
    const current = before == null ? "—" : String(before);
    const output = after == null ? "—" : String(after);
    const comparison = change || (current !== output && current !== "—" ? current : "");

    return `<div class="column encoding-setup-change-row">
      <div><span class="ui grey text">${escapeHtml(label)}</span></div>
      <div><span class="${escapeHtml(afterClass)}">${escapeHtml(output)}</span></div>
      <div><span class="ui grey text">${escapeHtml(comparison)}</span></div>
    </div>`;
}

function buildEstimate(source, profile, scalePlan) {
    const dimensions = estimatedDimensions(source, profile, scalePlan);
    const videoBitrateBps = estimatedBitrate(source, profile, dimensions);
    const durationSec = Math.max(0, Number(source && source.durationMs || 0) / 1000);
    const sizeBytes = videoBitrateBps > 0 && durationSec > 0
        ? Math.round((videoBitrateBps * durationSec) / 8)
        : Number(source && source.fileSizeBytes || 0);

    return {
        width: dimensions.width,
        height: dimensions.height,
        fps: Number(source && source.frameRate || 0) || null,
        container: profile && profile.container ? profile.container.label : "—",
        videoCodec: profile && profile.videoCodec ? profile.videoCodec.label : "—",
        pixelFormat: profile && profile.pixelFormat ? profile.pixelFormat.label : "—",
        targetStandardLabel: getScaleTargetLabel(scalePlan),
        videoBitrateBps,
        sizeBytes,
        sizeDeltaBytes: sizeBytes - Number(source && source.fileSizeBytes || 0)
    };
}

function estimatedDimensions(_source, _profile, scalePlan) {
    return scalePlan && scalePlan.estimatedDimensions
        ? scalePlan.estimatedDimensions
        : { width: null, height: null };
}

function estimatedBitrate(source, profile, dimensions) {
    const sourceBitrate = Number(source && source.bitRate || 0);
    if (!sourceBitrate) return 0;

    if (profile && profile.videoCodec && profile.videoCodec.id === "copy") {
        return sourceBitrate;
    }

    const sourcePixels = Math.max(1, Number(source && source.width || 0) * Number(source && source.height || 0));
    const outputPixels = Math.max(1, Number(dimensions.width || 0) * Number(dimensions.height || 0));
    const scale = outputPixels / sourcePixels;
    const crfFactor = Number(profile && profile.crf || 20) >= 24 ? 0.42 : 0.62;

    return Math.max(900000, Math.round(sourceBitrate * scale * crfFactor));
}

function formatResolution(width, height) {
    const safeWidth = Number(width || 0);
    const safeHeight = Number(height || 0);
    return safeWidth > 0 && safeHeight > 0 ? `${safeWidth} x ${safeHeight}` : "—";
}

function formatFps(value) {
    const fps = Number(value || 0);
    if (!Number.isFinite(fps) || fps <= 0) {
        return "—";
    }

    return Number.isInteger(fps) ? String(fps) : fps.toFixed(2).replace(/\.?0+$/, "");
}

function getPixelFormat(source) {
    const probeJson = source && source.probeJson ? source.probeJson : null;
    const streams = Array.isArray(probeJson && probeJson.streams) ? probeJson.streams : [];
    const videoStream = streams.find(stream => stream.codec_type === "video") || null;
    return videoStream && videoStream.pix_fmt ? String(videoStream.pix_fmt) : "—";
}

function getScaleTargetLabel(scalePlan) {
    if (!scalePlan) {
        return "—";
    }

    if (scalePlan.selectedStandard) {
        return `${scalePlan.selectedStandard.label} (${scalePlan.selectedStandard.width} x ${scalePlan.selectedStandard.height})`;
    }

    if (scalePlan.customFallbackUsed && scalePlan.targetWidth && scalePlan.targetHeight) {
        return `Safe Fit (${scalePlan.targetWidth} x ${scalePlan.targetHeight})`;
    }

    return "Preserve Source";
}

function buildScaleDecision(scalePlan) {
    if (!scalePlan) {
        return "—";
    }

    return scalePlan.decision || "—";
}

function formatSizeChange(deltaBytes, sourceBytes) {
    const source = Number(sourceBytes || 0);
    const delta = Number(deltaBytes || 0);
    const sign = delta > 0 ? "+" : "";
    const percent = source > 0 ? (delta / source) * 100 : null;
    const percentText = percent == null ? "" : `, ${percent > 0 ? "+" : ""}${percent.toFixed(1)}%`;

    return `${sign}${formatBytes(Math.abs(delta))}${delta < 0 ? " smaller" : delta > 0 ? " larger" : ""}${percentText}`.trim();
}

function formatBitrateChange(outputBps, sourceBps) {
    const source = Number(sourceBps || 0);
    const output = Number(outputBps || 0);
    if (!source || !output) return "";

    const delta = output - source;
    const percent = (delta / source) * 100;
    const deltaKbps = Math.round(Math.abs(delta) / 1000).toLocaleString();

    return `${delta > 0 ? "+" : "-"}${deltaKbps} kbps, ${percent > 0 ? "+" : ""}${percent.toFixed(1)}%`;
}

function formatResponseTimestamp(value) {
    if (!value) return "No timestamp";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleString();
}
