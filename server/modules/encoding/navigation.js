const NAVIGATION_SOURCE_PENDING = "pending";
const NAVIGATION_SOURCE_QUEUE = "queue";
const NAVIGATION_SOURCE_HISTORY = "history";
const NAVIGATION_SOURCE_REVIEW = "review";

const DEFAULT_REDIRECT_URL = "/encoding/queue";

const VALID_NAVIGATION_SOURCES = new Set([
    NAVIGATION_SOURCE_PENDING,
    NAVIGATION_SOURCE_QUEUE,
    NAVIGATION_SOURCE_HISTORY,
    NAVIGATION_SOURCE_REVIEW
]);

function normalizeNavigationSource(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return VALID_NAVIGATION_SOURCES.has(normalized) ? normalized : "";
}

function buildOriginUrl(basePath, { id, source, query } = {}) {
    const searchParams = new URLSearchParams();

    if (id != null && id !== "") {
        searchParams.set("id", String(id));
    }

    const normalizedSource = normalizeNavigationSource(source);
    if (normalizedSource) {
        searchParams.set("origin", normalizedSource);
    }

    if (query && typeof query === "object") {
        for (const [key, value] of Object.entries(query)) {
            if (value == null || value === "") continue;
            searchParams.set(key, String(value));
        }
    }

    const search = searchParams.toString();
    return search ? `${basePath}?${search}` : basePath;
}

async function resolveRedirectUrl({ flow, source, encodingService, itemId } = {}) {
    const normalizedSource = normalizeNavigationSource(source);
    const normalizedFlow = String(flow || "").trim();

    if (normalizedFlow === "setupSubmit") {
        return resolveQueueSubmissionRedirectUrl(normalizedSource, encodingService);
    }

    if (normalizedFlow === "reviewApprove") {
        return resolveReviewApproveRedirectUrl(normalizedSource, encodingService);
    }

    if (normalizedFlow === "reviewReject") {
        return resolveReviewRejectRedirectUrl(normalizedSource, itemId);
    }

    return DEFAULT_REDIRECT_URL;
}

async function resolveQueueSubmissionRedirectUrl(source, encodingService) {
    if (source === NAVIGATION_SOURCE_PENDING) {
        return buildNextActionableSetupUrl(encodingService);
    }

    if (source === NAVIGATION_SOURCE_REVIEW) {
        return "/encoding/review";
    }

    return DEFAULT_REDIRECT_URL;
}

async function buildNextActionableSetupUrl(encodingService) {
    const state = await encodingService.getDashboardState();
    const nextItem = Array.isArray(state && state.actionableItems) ? state.actionableItems[0] : null;
    if (!nextItem || !nextItem.id) {
        return "/encoding/pending";
    }

    return buildOriginUrl("/encoding/setup", {
        id: nextItem.id,
        source: NAVIGATION_SOURCE_PENDING
    });
}

async function resolveReviewApproveRedirectUrl(source, encodingService) {
    if (source === NAVIGATION_SOURCE_HISTORY) {
        return "/encoding/history";
    }

    return buildNextReviewItemUrl(encodingService);
}

function resolveReviewRejectRedirectUrl(source, itemId) {
    const setupSource = source === NAVIGATION_SOURCE_HISTORY
        ? NAVIGATION_SOURCE_HISTORY
        : NAVIGATION_SOURCE_REVIEW;

    return buildOriginUrl("/encoding/setup", {
        id: itemId,
        source: setupSource
    });
}

async function buildNextReviewItemUrl(encodingService) {
    const state = await encodingService.getDashboardState();
    const nextItem = Array.isArray(state && state.reviewItems) ? state.reviewItems[0] : null;
    if (!nextItem || !nextItem.id) {
        return "/encoding/review";
    }

    return buildOriginUrl("/encoding/review/item", {
        id: nextItem.id,
        source: NAVIGATION_SOURCE_REVIEW
    });
}

module.exports = {
    NAVIGATION_SOURCE_PENDING,
    NAVIGATION_SOURCE_QUEUE,
    NAVIGATION_SOURCE_HISTORY,
    NAVIGATION_SOURCE_REVIEW,
    normalizeNavigationSource,
    buildOriginUrl,
    resolveRedirectUrl
};
