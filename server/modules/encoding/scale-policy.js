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
    const hasTargetBox = Boolean(
        profile &&
        profile.resolution &&
        toPositiveInt(profile.resolution.width) &&
        toPositiveInt(profile.resolution.height)
    );
    const { widthStep, heightStep } = getChromaDimensionRequirements(
        profile && profile.pixelFormat && profile.pixelFormat.id
    );
    const dimensionPolicy = widthStep > 1 || heightStep > 1
        ? `normalize to ${widthStep}x${heightStep} chroma-safe dimensions`
        : "keep original dimensions";

    return [
        hasTargetBox ? "fit within target bounds" : "keep original size",
        "preserve aspect ratio",
        "never upscale",
        dimensionPolicy,
        "set square pixels"
    ].join(", ");
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
    estimateFittedDimensions,
    getChromaDimensionRequirements
};
