const {
    escapeHtml,
    formatBitrate,
    formatBytes,
    formatDuration,
    renderDiscardButton
} = require("./helpers");
const EncodingOptions = require("../../modules/encoding/encoding-options");
const {
    describeScalePolicy,
    resolveScalePlan
} = require("../../modules/encoding/scale-policy");

module.exports = function renderSetup(item, profiles, { selectedProfileId, origin = "", sourcePreviewUrl, showVideoPlayerByDefault = false, queueToFrontByDefault = false } = {}) {
    if (!item) {
        return `<section class="ui segment encoder-panel"><div class="ui placeholder segment"><div class="ui header">No discovered item is available for setup yet.</div></div></section>`;
    }

    const source = item.sourceMetadata || {};
    const browserCompatibilityStatus = detectBrowserCompatibilityStatus(source);
    const profileOptions = buildProfileOptions(profiles, source, browserCompatibilityStatus);
    const selectedProfile = resolveSelectedProfile(profileOptions, selectedProfileId, item && item.profileId)
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
      ${renderExpandedSourceVideo(item, sourcePreviewUrl, { visible: showVideoPlayerByDefault })}
      <div class="ui inverted segment charcoal">
        <div class="ui stackable grid">
          <div class="four wide column">
            ${renderCompactSourceVideo(item, sourcePreviewUrl)}
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
              ${renderMetric("Aspect Family", scalePlan.family ? scalePlan.family.label : "—")}
              ${renderMetric("FPS", formatFps(source.frameRate))}
              ${renderMetric("Bit Rate", formatBitrate(source.bitRate))}
            </div>
          </div>
        </div>
      </div>

      <div class="ui hidden divider"></div>

      <div class="ui inverted segment charcoal">
        <h3 class="ui inverted small header">
            Encoding Profile / Options
            ${renderBrowserCompatibilityStatusBadge(browserCompatibilityStatus)}
        </h3>

        <form method="get" action="/encoding/setup/fragment" class="ui inverted form">
          <input type="hidden" name="id" value="${escapeHtml(item.id)}" />
          <input type="hidden" name="origin" value="${escapeHtml(origin)}" />
          <input type="hidden" name="showVideoPlayer" value="${showVideoPlayerByDefault ? "true" : "false"}" data-setup-show-video-input />
          <input type="hidden" name="queueToFront" value="${queueToFrontByDefault ? "true" : "false"}" data-setup-queue-front-input />
          <div class="fields">
            <div class="six wide field">
              <label>Profile</label>
              <select class="ui fluid dropdown" name="profileId" onchange="reloadSetupProfile(this.form)">
                ${profileOptions.map(option => `<option value="${escapeHtml(option.profile.id)}"${option.profile.id === (selectedProfile && selectedProfile.id) ? " selected" : ""}${option.disabled ? " disabled" : ""}>${escapeHtml(option.label)}</option>`).join("")}
              </select>
            </div>
            <div class="ten wide disabled field">
              <label>Description</label>
              <input type="text" disabled value="${escapeHtml(getSelectedProfileDescription(profileOptions, selectedProfile))}" />
            </div>
          </div>
        </form>

        <form id="setup-queue-form" class="ui inverted form form-stack" method="post" action="/api/encoding/items/${encodeURIComponent(item.id)}/queue" data-api-form>
          <input type="hidden" name="profileId" value="${escapeHtml(selectedProfile && selectedProfile.id || "")}" />
          <input type="hidden" name="origin" value="${escapeHtml(origin)}" />
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
        <div class="ui four column stackable inverted compact grid">
          ${renderOutcomeMetric(renderInfoLabel("Size", buildSizeEstimateHelpText(selectedProfile)), formatBytes(source.fileSizeBytes), formatBytes(estimate.sizeBytes), estimate.sizeDeltaBytes <= 0 ? "green" : "yellow", formatSizeChange(estimate.sizeDeltaBytes, source.fileSizeBytes))}
          ${renderOutcomeMetric("Resolution", formatResolution(source.width, source.height), formatResolution(estimate.width, estimate.height))}
          ${renderOutcomeMetric("Target Standard", scalePlan.family ? scalePlan.family.label : "—", estimate.targetStandardLabel)}
          ${renderOutcomeMetric("Container", source.container || "—", estimate.container)}
          ${renderOutcomeMetric(renderInfoLabel("Bitrate", buildBitrateEstimateHelpText(selectedProfile)), formatBitrate(source.bitRate), formatBitrate(estimate.totalBitrateBps), null, formatBitrateChange(estimate.totalBitrateBps, source.bitRate))}
          ${renderOutcomeMetric("FPS", formatFps(source.frameRate), formatFps(estimate.fps))}
          ${renderOutcomeMetric("Codec", source.videoCodec || "—", estimate.videoCodec)}
          ${renderOutcomeMetric("Format", getPixelFormat(source), estimate.pixelFormat)}
        </div>
      </div>

      <div class="ui hidden divider"></div>

      <div class="ui inverted segment charcoal">
        <div class="ui stackable middle aligned right aligned grid">
          <div class="seven wide left aligned column">
            <div class="ui form">
              <div class="inline field" style="display: flex; align-items: center; gap: 12px;">
                <label style="margin: 0; color: rgba(255, 255, 255, 0.9);">Queue to Front:</label>
                <div class="ui fitted toggle checkbox">
                  <input
                    type="checkbox"
                    name="queueToFront"
                    value="true"
                    form="setup-queue-form"
                    ${queueToFrontByDefault ? " checked" : ""}
                    onchange="window.syncSetupQueueToFrontPreference(this)"
                  />
                  <label></label>
                </div>
              </div>
            </div>
          </div>
          <div class="nine wide right aligned column">
            <span class="ui small text" style="margin-top: 6px;">Status: ${escapeHtml(String(item.status || "unknown"))}</span>
            <span class="ui small grey text">${escapeHtml(formatResponseTimestamp(responseAt))}</span>
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

function renderExpandedSourceVideo(item, sourcePreviewUrl, { visible = false } = {}) {
    const previewUrl = sourcePreviewUrl || `/api/encoding/items/${encodeURIComponent(item.id)}/source`;

    return `
      <section class="encoder-setup-expanded-player" data-setup-expanded-player${visible ? "" : " hidden"}>
        <section class="video-box">
          ${previewUrl
              ? `<video controls preload="metadata" data-setup-expanded-video>
                  <source src="${escapeHtml(previewUrl)}" />
                </video>`
              : `<div class="ui warning inverted message">Source video is not available for browser playback.</div>`
          }
        </section>
        <div class="ui basic fitted segment" style="margin: 0;">
          <button
            type="button"
            class="ui tiny basic inverted button"
            onclick="window.collapseSetupSourcePlayer(this)"
          >
            Close Preview
          </button>
        </div>
      </section>`;
}

function renderCompactSourceVideo(item, sourcePreviewUrl) {
    const previewUrl = sourcePreviewUrl || `/api/encoding/items/${encodeURIComponent(item.id)}/source`;

    return `
      <section class="encoder-setup-compact-player">
        ${previewUrl
            ? `<video
                controls
                preload="metadata"
                data-setup-compact-video
                onplay="window.expandSetupSourcePlayer(this)"
              >
                <source src="${escapeHtml(previewUrl)}" />
              </video>`
            : `<div class="ui warning inverted message">Source video is not available for browser playback.</div>`
        }
      </section>`;
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
    const labelMarkup = String(label || "");
    const safeLabelMarkup = labelMarkup.includes("<")
        ? labelMarkup
        : escapeHtml(labelMarkup);

    return `<div class="column encoding-setup-change-row">
      <div><span class="ui grey text">${safeLabelMarkup}</span></div>
      <div><span class="${escapeHtml(afterClass)}">${escapeHtml(output)}</span></div>
      <div><span class="ui grey text">${escapeHtml(comparison)}</span></div>
    </div>`;
}

function renderInfoLabel(label, helpText) {
    const safeHelpText = escapeHtml(helpText);

    return `${escapeHtml(label)} <i class="info circle icon" title="${safeHelpText}" aria-label="${safeHelpText}" style="margin-left: 4px; opacity: 0.8; cursor: help;"></i>`;
}

function renderBrowserCompatibilityStatusBadge(status) {
    if (!status || !status.kind) {
        return "";
    }

    const color = status.kind === "copy_container_eligible" ? "teal" : "red";
    const icon = status.kind === "copy_container_eligible" ? "magic" : "warning sign";
    const label = status.kind === "copy_container_eligible"
        ? "Copy Container Eligible"
        : "Browser Incompatible";

    return `<span class="ui tiny ${escapeHtml(color)} label" title="${escapeHtml(status.message)}" aria-label="${escapeHtml(status.message)}">
        <i class="${escapeHtml(icon)} icon"></i>
        ${escapeHtml(label)}
    </span>`;
}

function buildProfileOptions(profiles, source, browserCompatibilityStatus = null) {
    const sourceDimensions = getNormalizedSourceDimensions(source);

    return (Array.isArray(profiles) ? profiles : []).map(profile => {
        const disabledReason = getProfileDisabledReason(profile, source, sourceDimensions);
        const recommendedReason = getProfileRecommendedReason(profile, browserCompatibilityStatus);
        return {
            profile,
            disabled: Boolean(disabledReason),
            disabledReason,
            recommendedReason,
            label: disabledReason
                ? `${profile.label} (${disabledReason})`
                : recommendedReason
                    ? `${profile.label} (${recommendedReason})`
                : profile.label
        };
    });
}

function resolveSelectedProfile(profileOptions, requestedProfileId, fallbackProfileId) {
    const options = Array.isArray(profileOptions) ? profileOptions : [];
    const candidates = [requestedProfileId, fallbackProfileId].filter(Boolean);

    for (const candidateId of candidates) {
        const match = options.find(option => option.profile && option.profile.id === candidateId && !option.disabled);
        if (match) {
            return match.profile;
        }
    }

    const firstAvailable = options.find(option => !option.disabled);
    return firstAvailable ? firstAvailable.profile : (options[0] ? options[0].profile : null);
}

function getSelectedProfileDescription(profileOptions, selectedProfile) {
    if (!selectedProfile) {
        return "";
    }

    const selectedOption = (Array.isArray(profileOptions) ? profileOptions : [])
        .find(option => option.profile && option.profile.id === selectedProfile.id);

    if (!selectedOption || !selectedOption.disabledReason) {
        if (selectedOption && selectedOption.recommendedReason) {
            return `${selectedProfile.description || ""} ${selectedOption.recommendedReason}.`.trim();
        }
        return selectedProfile.description || "";
    }

    return `${selectedProfile.description || ""} Unavailable: ${selectedOption.disabledReason}.`.trim();
}

function getProfileDisabledReason(profile, source, sourceDimensions) {
    if (!isTierConstrainedDownscaleProfile(profile)) {
        return "";
    }

    const sourceWidth = Number(sourceDimensions && sourceDimensions.width || 0);
    const sourceHeight = Number(sourceDimensions && sourceDimensions.height || 0);
    if (!sourceWidth || !sourceHeight) {
        return "";
    }

    const scalePlan = resolveScalePlan(profile, source || {});
    const outputWidth = Number(scalePlan && scalePlan.estimatedDimensions && scalePlan.estimatedDimensions.width || 0);
    const outputHeight = Number(scalePlan && scalePlan.estimatedDimensions && scalePlan.estimatedDimensions.height || 0);
    if (!outputWidth || !outputHeight) {
        return "";
    }

    if (outputWidth >= sourceWidth && outputHeight >= sourceHeight) {
        return `already at or below ${profile.targetTier.label}`;
    }

    return "";
}

function getProfileRecommendedReason(profile, browserCompatibilityStatus) {
    if (!browserCompatibilityStatus || browserCompatibilityStatus.kind !== "copy_container_eligible") {
        return "";
    }

    return profile && profile.id === "copy_container"
        ? "recommended for browser compatibility"
        : "";
}

function isTierConstrainedDownscaleProfile(profile) {
    const targetTierId = profile && profile.targetTier && profile.targetTier.id;
    const intentId = profile && profile.intent && profile.intent.id;
    const downscaleIntentIds = new Set([
        EncodingOptions.ProfileIntent.DOWNSCALE.id,
        EncodingOptions.ProfileIntent.DOWNSCALE_AND_COMPRESS.id
    ]);

    if (profile && profile.id === "archive_hd") {
        return false;
    }

    return downscaleIntentIds.has(intentId)
        && [EncodingOptions.ResolutionTier.QHD.id, EncodingOptions.ResolutionTier.HD.id].includes(targetTierId);
}

function getNormalizedSourceDimensions(source) {
    const preserveProfile = {
        pixelFormat: EncodingOptions.PixelFormat.YUV420P,
        scaleMode: EncodingOptions.ScaleMode.PRESERVE_SOURCE,
        targetTier: EncodingOptions.ResolutionTier.ORIGINAL,
        tierFallback: EncodingOptions.TierFallback.PRESERVE_SOURCE,
        customFamilyFallback: EncodingOptions.CustomFamilyFallback.PRESERVE_SOURCE
    };
    const preservePlan = resolveScalePlan(preserveProfile, source || {});
    return preservePlan && preservePlan.estimatedDimensions
        ? preservePlan.estimatedDimensions
        : { width: Number(source && source.width || 0), height: Number(source && source.height || 0) };
}

function detectBrowserCompatibilityStatus(source) {
    const container = String(source && source.container || "").toLowerCase();
    const videoCodec = String(source && source.videoCodec || "").toLowerCase();
    const audioCodec = String(source && source.audioCodec || "").toLowerCase();
    const pixelFormat = String(getPixelFormat(source) || "").toLowerCase();
    const probeJson = source && source.probeJson ? source.probeJson : null;
    const streams = Array.isArray(probeJson && probeJson.streams) ? probeJson.streams : [];
    const hasVideoStream = streams.some(stream => stream && stream.codec_type === "video");
    const hasUnsupportedNonSubtitleStream = streams.some(stream => {
        const streamType = String(stream && stream.codec_type || "").toLowerCase();
        return streamType && !["video", "audio", "subtitle"].includes(streamType);
    });

    if (!hasVideoStream || hasUnsupportedNonSubtitleStream) {
        return hasUnsupportedNonSubtitleStream
            ? {
                kind: "browser_incompatible",
                message: "This file includes unsupported extra streams, so browser compatibility would require more than a simple container copy."
            }
            : { kind: "" };
    }

    if (container === "mp4") {
        return { kind: "" };
    }

    if (videoCodec !== "h264") {
        return {
            kind: "browser_incompatible",
            message: `Video codec ${videoCodec || "unknown"} is not treated as browser-safe for this workflow, so browser compatibility would require re-encoding.`
        };
    }

    if (audioCodec && !["aac", "mp3"].includes(audioCodec)) {
        return {
            kind: "browser_incompatible",
            message: `Audio codec ${audioCodec} is not treated as browser-safe for this workflow, so browser compatibility would require re-encoding or audio conversion.`
        };
    }

    if (pixelFormat && pixelFormat !== "yuv420p") {
        return {
            kind: "browser_incompatible",
            message: `Pixel format ${pixelFormat} is not treated as browser-safe for this workflow, so browser compatibility would require re-encoding.`
        };
    }

    return {
        kind: "copy_container_eligible",
        message: `This file already appears browser-safe at the codec level and may only need a container repack into MP4. Choose Copy Container if your goal is browser playback only, or choose another profile if you also want downscaling or additional size savings.`
    };
}

function buildEstimate(source, profile, scalePlan) {
    const dimensions = estimatedDimensions(source, profile, scalePlan);
    const videoBitrateBps = estimatedBitrate(source, profile, dimensions);
    const audioBitrateBps = estimatedAudioBitrate(source, profile);
    const totalBitrateBps = Math.max(0, videoBitrateBps + audioBitrateBps);
    const durationSec = Math.max(0, Number(source && source.durationMs || 0) / 1000);
    const sizeBytes = totalBitrateBps > 0 && durationSec > 0
        ? Math.round(((totalBitrateBps * durationSec) / 8) * 1.02)
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
        audioBitrateBps,
        totalBitrateBps,
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
    const sourceTotalBitrate = getSourceTotalBitrate(source);
    const sourceAudioBitrate = getSourceAudioBitrate(source);
    const sourceVideoBitrate = Math.max(0, getSourceVideoBitrate(source) || (sourceTotalBitrate - sourceAudioBitrate));
    if (!sourceVideoBitrate) return 0;

    if (profile && profile.videoCodec && profile.videoCodec.id === "copy") {
        return sourceVideoBitrate;
    }

    const sourcePixels = Math.max(1, Number(source && source.width || 0) * Number(source && source.height || 0));
    const outputPixels = Math.max(1, Number(dimensions.width || 0) * Number(dimensions.height || 0));
    const scale = clamp(outputPixels / sourcePixels, 0.2, 1.25);
    const sourceFps = normalizeEstimatedFps(source && source.frameRate);
    const outputFps = normalizeEstimatedFps(source && source.frameRate);
    const fpsScale = clamp(outputFps / sourceFps, 0.7, 1.6);
    const codecFactor = getCodecCompressionFactor(profile && profile.videoCodec && profile.videoCodec.id);
    const crfFactor = getCrfCompressionFactor(profile && profile.crf, profile && profile.intent && profile.intent.id);
    const estimated = sourceVideoBitrate * scale * fpsScale * codecFactor * crfFactor;

    return Math.max(getMinimumVideoBitrate(outputPixels, outputFps), Math.round(estimated));
}

function estimatedAudioBitrate(source, profile) {
    const audioCodecId = profile && profile.audioCodec && profile.audioCodec.id;
    const sourceAudioBitrate = getSourceAudioBitrate(source);

    if (!hasAudioStream(source)) {
        return 0;
    }

    if (audioCodecId === "copy") {
        return sourceAudioBitrate;
    }

    const configuredBitrate = Number(profile && profile.audioBitrate && profile.audioBitrate.id || 0);
    if (configuredBitrate > 0) {
        return configuredBitrate;
    }

    return sourceAudioBitrate;
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
    const sign = delta > 0 ? "+" : "-";
    const percent = source > 0 ? (delta / source) * 100 : null;
    const percentText = percent == null ? "" : `, ${percent > 0 ? "+" : ""}${percent.toFixed(1)}%`;

    return `${sign}${formatBytes(Math.abs(delta))}${percentText}`.trim();
}

function buildSizeEstimateHelpText(profile) {
    const audioMode = profile && profile.audioCodec && profile.audioCodec.id === "copy"
        ? "source audio bitrate when audio is copied"
        : "profile audio bitrate when audio is re-encoded";

    return `Estimate only. Based on the selected output settings, including resolution, compression quality, codec, and audio settings. Actual file size may vary.`;
}

function buildBitrateEstimateHelpText(_profile) {
    return "Estimate only. Based on the selected output settings, including resolution, compression quality, codec, and audio settings. Actual bitrate may vary.";
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

function getSourceTotalBitrate(source) {
    const explicitBitrate = Number(source && source.bitRate || 0);
    if (explicitBitrate > 0) {
        return explicitBitrate;
    }

    const durationSec = Math.max(0, Number(source && source.durationMs || 0) / 1000);
    const fileSizeBytes = Math.max(0, Number(source && source.fileSizeBytes || 0));
    if (durationSec > 0 && fileSizeBytes > 0) {
        return Math.round((fileSizeBytes * 8) / durationSec);
    }

    return 0;
}

function getSourceVideoBitrate(source) {
    return getProbeStreamBitrate(source, "video");
}

function getSourceAudioBitrate(source) {
    if (!hasAudioStream(source)) {
        return 0;
    }

    const streamBitrate = getProbeStreamBitrate(source, "audio");
    if (streamBitrate > 0) {
        return streamBitrate;
    }

    return 160000;
}

function getProbeStreamBitrate(source, codecType) {
    const probeJson = source && source.probeJson ? source.probeJson : null;
    const streams = Array.isArray(probeJson && probeJson.streams) ? probeJson.streams : [];
    const stream = streams.find(entry => entry && entry.codec_type === codecType) || null;
    const bitRate = Number(stream && stream.bit_rate || 0);
    return bitRate > 0 ? bitRate : 0;
}

function hasAudioStream(source) {
    const probeJson = source && source.probeJson ? source.probeJson : null;
    const streams = Array.isArray(probeJson && probeJson.streams) ? probeJson.streams : [];
    return streams.some(stream => stream && stream.codec_type === "audio");
}

function getCrfCompressionFactor(crf, intentId) {
    const safeCrf = Number(crf || 20);
    const intentFactor = getProfileIntentBitrateFactor(intentId);

    if (safeCrf <= 18) return 0.72 * intentFactor;
    if (safeCrf <= 20) return 0.62 * intentFactor;
    if (safeCrf <= 22) return 0.52 * intentFactor;
    if (safeCrf <= 24) return 0.44 * intentFactor;
    return 0.36 * intentFactor;
}

function getMinimumVideoBitrate(outputPixels, outputFps) {
    const fpsFactor = clamp(normalizeEstimatedFps(outputFps) / 30, 0.85, 1.8);

    if (outputPixels >= 2560 * 1440) return Math.round(1800000 * fpsFactor);
    if (outputPixels >= 1920 * 1080) return Math.round(900000 * fpsFactor);
    if (outputPixels >= 1280 * 720) return Math.round(550000 * fpsFactor);
    return Math.round(350000 * fpsFactor);
}

function getCodecCompressionFactor(codecId) {
    switch (String(codecId || "").toLowerCase()) {
        case "h265":
            return 0.72;
        case "av1":
            return 0.62;
        case "vp9":
            return 0.76;
        case "h264":
            return 1;
        case "copy":
            return 1;
        default:
            return 0.9;
    }
}

function getProfileIntentBitrateFactor(intentId) {
    switch (String(intentId || "").toLowerCase()) {
        case "browser_compatibility":
            return 1.04;
        case "downscale":
            return 0.96;
        case "downscale_and_compress":
            return 0.88;
        case "recompress":
            return 0.92;
        case "remux":
            return 1;
        default:
            return 1;
    }
}

function normalizeEstimatedFps(value) {
    const fps = Number(value || 0);
    if (!Number.isFinite(fps) || fps <= 0) {
        return 30;
    }

    return fps;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function formatResponseTimestamp(value) {
    if (!value) return "No timestamp";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleString();
}
