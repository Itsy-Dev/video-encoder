const EncodingOptions = require("./encoding-options");

const { CustomFamilyFallback, ResolutionTier, ScaleMode, TierFallback } = EncodingOptions;

function getChromaDimensionRequirements(pixelFormatId) {
    const pixelFormat = String(pixelFormatId || "").toLowerCase();

    if (pixelFormat === "yuv420p") {
        return { widthStep: 2, heightStep: 2 };
    }

    if (pixelFormat === "yuv422p") {
        return { widthStep: 2, heightStep: 1 };
    }

    return { widthStep: 1, heightStep: 1 };
}

function detectAspectFamily(sourceMetadata = {}) {
    const ratio = getDisplayAspectRatioValue(sourceMetadata);
    const families = EncodingOptions.getAspectFamilies().filter(family => family.id !== EncodingOptions.AspectFamily.CUSTOM.id);

    for (const family of families) {
        if (!family.ratio || !family.tolerance) {
            continue;
        }

        const relativeDelta = Math.abs(ratio - family.ratio) / family.ratio;
        if (relativeDelta <= family.tolerance) {
            return family;
        }
    }

    return EncodingOptions.AspectFamily.CUSTOM;
}

function resolveScalePlan(profile, sourceMetadata = {}) {
    const sourceWidth = toPositiveInt(sourceMetadata.width);
    const sourceHeight = toPositiveInt(sourceMetadata.height);
    const pixelFormatId = profile && profile.pixelFormat ? profile.pixelFormat.id : null;
    const family = detectAspectFamily(sourceMetadata);
    const requestedTier = profile && profile.targetTier ? profile.targetTier : ResolutionTier.ORIGINAL;
    const requestedStandard = requestedTier.id === ResolutionTier.ORIGINAL.id
        ? null
        : EncodingOptions.getStandardForFamilyTier(family.id, requestedTier.id);
    const fallbackStandard = requestedStandard
        ? requestedStandard
        : resolveFallbackStandard(family.id, requestedTier, profile && profile.tierFallback);
    const customMaxBox = requestedTier && requestedTier.maxBox ? requestedTier.maxBox : null;

    let selectedStandard = requestedStandard || fallbackStandard || null;
    let targetWidth = selectedStandard ? selectedStandard.width : null;
    let targetHeight = selectedStandard ? selectedStandard.height : null;
    let decision = "Preserve source size";

    if (profile && profile.scaleMode && profile.scaleMode.id === ScaleMode.MATCH_SOURCE_FAMILY.id) {
        if (selectedStandard) {
            decision = selectedStandard === requestedStandard
                ? `Match ${family.label} to ${selectedStandard.label}`
                : `Fallback to ${selectedStandard.label}`;
        }
        else if (
            family.id === EncodingOptions.AspectFamily.CUSTOM.id
            && profile.customFamilyFallback
            && profile.customFamilyFallback.id === CustomFamilyFallback.SAFE_FIT.id
            && customMaxBox
        ) {
            targetWidth = customMaxBox.width;
            targetHeight = customMaxBox.height;
            decision = `Safe fit custom aspect ratio within ${requestedTier.label}`;
        }
        else {
            decision = requestedTier.id === ResolutionTier.ORIGINAL.id
                ? "Preserve source size"
                : `Preserve source size because ${requestedTier.label} is unavailable for ${family.label}`;
        }
    }

    const estimatedDimensions = estimateFittedDimensions(
        sourceWidth,
        sourceHeight,
        targetWidth,
        targetHeight,
        pixelFormatId
    );

    return {
        family,
        requestedTier,
        requestedStandard,
        selectedStandard,
        decision,
        targetWidth,
        targetHeight,
        estimatedDimensions,
        customFallbackUsed: Boolean(
            family.id === EncodingOptions.AspectFamily.CUSTOM.id
            && !selectedStandard
            && targetWidth
            && targetHeight
        )
    };
}

function estimateFittedDimensions(sourceWidth, sourceHeight, targetWidth, targetHeight, pixelFormatId) {
    const safeSourceWidth = toPositiveInt(sourceWidth);
    const safeSourceHeight = toPositiveInt(sourceHeight);
    const safeTargetWidth = toPositiveInt(targetWidth);
    const safeTargetHeight = toPositiveInt(targetHeight);
    const { widthStep, heightStep } = getChromaDimensionRequirements(pixelFormatId);

    if (!safeSourceWidth || !safeSourceHeight) {
        return { width: null, height: null };
    }

    if (!safeTargetWidth || !safeTargetHeight) {
        return {
            width: normalizeDimension(safeSourceWidth, widthStep),
            height: normalizeDimension(safeSourceHeight, heightStep)
        };
    }

    const ratio = Math.min(safeTargetWidth / safeSourceWidth, safeTargetHeight / safeSourceHeight, 1);
    return {
        width: normalizeDimension(safeSourceWidth * ratio, widthStep),
        height: normalizeDimension(safeSourceHeight * ratio, heightStep)
    };
}

function buildSafeScaleFilter({ targetWidth, targetHeight, scalingAlgorithm, pixelFormatId }) {
    const safeTargetWidth = toPositiveInt(targetWidth);
    const safeTargetHeight = toPositiveInt(targetHeight);
    const scaler = scalingAlgorithm || "lanczos";
    const { widthStep, heightStep } = getChromaDimensionRequirements(pixelFormatId);
    const filters = [];

    if (safeTargetWidth && safeTargetHeight) {
        filters.push(
            `scale=w='min(${safeTargetWidth},iw)':h='min(${safeTargetHeight},ih)':force_original_aspect_ratio=decrease:flags=${scaler}`
        );
    }

    if (widthStep > 1 || heightStep > 1) {
        filters.push(
            `scale=w='trunc(iw/${widthStep})*${widthStep}':h='trunc(ih/${heightStep})*${heightStep}'`
        );
    }

    filters.push("setsar=1");
    return filters.join(",");
}

function describeScalePolicy(profile) {
    const scaleMode = profile && profile.scaleMode ? profile.scaleMode.label : "—";
    const targetTier = profile && profile.targetTier ? profile.targetTier.label : "—";
    const tierFallback = profile && profile.tierFallback ? profile.tierFallback.label : "—";
    const customFallback = profile && profile.customFamilyFallback ? profile.customFamilyFallback.label : "—";

    return [
        scaleMode,
        `target ${targetTier}`,
        `missing-tier fallback ${tierFallback}`,
        `custom fallback ${customFallback}`,
        "never upscale",
        "square pixels"
    ].join(", ");
}

function resolveFallbackStandard(familyId, requestedTier, fallbackMode) {
    const standards = EncodingOptions.getStandardsForFamily(familyId);
    if (!standards.length || !requestedTier || !fallbackMode) {
        return null;
    }

    if (fallbackMode.id === TierFallback.PRESERVE_SOURCE.id) {
        return null;
    }

    if (fallbackMode.id === TierFallback.LOWEST_AVAILABLE.id) {
        return standards.slice().sort(compareStandardTierAscending)[0] || null;
    }

    if (fallbackMode.id === TierFallback.NEXT_LOWER.id) {
        const requestedOrder = requestedTier.order;
        return standards
            .slice()
            .sort(compareStandardTierDescending)
            .find(standard => {
                const standardTier = EncodingOptions.getResolutionTierById(standard.tierId);
                return standardTier && standardTier.order < requestedOrder;
            }) || null;
    }

    return null;
}

function compareStandardTierAscending(left, right) {
    const leftTier = EncodingOptions.getResolutionTierById(left && left.tierId);
    const rightTier = EncodingOptions.getResolutionTierById(right && right.tierId);
    return Number(leftTier && leftTier.order || 0) - Number(rightTier && rightTier.order || 0);
}

function compareStandardTierDescending(left, right) {
    return compareStandardTierAscending(right, left);
}

function getDisplayAspectRatioValue(sourceMetadata = {}) {
    const probeJson = sourceMetadata && sourceMetadata.probeJson ? sourceMetadata.probeJson : null;
    const streams = Array.isArray(probeJson && probeJson.streams) ? probeJson.streams : [];
    const videoStream = streams.find(stream => stream.codec_type === "video") || null;
    const displayAspectRatio = parseAspectRatioValue(videoStream && videoStream.display_aspect_ratio);
    if (displayAspectRatio) {
        return displayAspectRatio;
    }

    const width = toPositiveInt(sourceMetadata.width);
    const height = toPositiveInt(sourceMetadata.height);
    if (!width || !height) {
        return 1;
    }

    return width / height;
}

function parseAspectRatioValue(value) {
    if (!value) {
        return null;
    }

    const text = String(value).trim();
    if (!text || text === "0:1") {
        return null;
    }

    if (!text.includes(":")) {
        const numeric = Number(text);
        return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
    }

    const [left, right] = text.split(":").map(Number);
    if (!Number.isFinite(left) || !Number.isFinite(right) || right <= 0) {
        return null;
    }

    return left / right;
}

function toPositiveInt(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return null;
    }

    return Math.round(parsed);
}

function normalizeDimension(value, step) {
    const safeValue = toPositiveInt(value);
    const safeStep = Math.max(1, toPositiveInt(step) || 1);
    if (!safeValue) {
        return null;
    }

    return Math.max(safeStep, Math.floor(safeValue / safeStep) * safeStep);
}

module.exports = {
    buildSafeScaleFilter,
    describeScalePolicy,
    detectAspectFamily,
    estimateFittedDimensions,
    getChromaDimensionRequirements,
    resolveScalePlan
};
