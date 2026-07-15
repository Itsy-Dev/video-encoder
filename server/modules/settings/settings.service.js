const encodingProfiles = require("../encoding/encoding-profiles");
const SettingsRepository = require("./settings.repository");
const {
    getDefaultInboxRoot,
    getDefaultOutboxRoot
} = require("../filesystem/handoff-paths");

const SCAN_INTERVAL_MINUTES_KEY = "discovery.scanIntervalMinutes";

const DEFAULTS = Object.freeze({
    continuousRunLimitMinutes: Number(process.env.ENCODER_CONTINUOUS_RUN_LIMIT_MS || 20 * 60 * 1000) / 60000,
    breakDurationMinutes: Number(process.env.ENCODER_PROCESS_REST_MS || 5 * 60 * 1000) / 60000,
    postItemCooldownMinutes: Number(process.env.ENCODER_POST_ITEM_COOLDOWN_MS || 20 * 60 * 1000) / 60000,
    monitorIntervalSeconds: Number(process.env.ENCODER_MONITOR_INTERVAL_MS || 30 * 1000) / 1000,
    ffmpegThreads: Number(process.env.ENCODER_THREADS || 1),
    filterThreads: Number(process.env.ENCODER_FILTER_THREADS || 2),
    processPriority: Number(process.env.ENCODER_CPU_NICE || 15),
    defaultProfileId: "browser_compatibility",
    inboxRoot: getDefaultInboxRoot(),
    outboxRoot: getDefaultOutboxRoot(),
    scanIntervalMinutes: Math.max(1, Math.round(Number(process.env.ENCODER_INBOX_SCAN_INTERVAL_MS || 30000) / 60000)),
    requeueInterruptedItems: false,
    autoPruneEmptyDirectories: true,
    autoResumeAfterBreak: true,
    autoStartQueueOnLaunch: true,
    watchFolders: []
});

const SETTINGS_DEFINITIONS = Object.freeze([
    defineSetting("worker.continuousRunLimitMinutes", DEFAULTS.continuousRunLimitMinutes, {
        type: "integer",
        min: 1
    }),
    defineSetting("worker.breakDurationMinutes", DEFAULTS.breakDurationMinutes, {
        type: "integer",
        min: 0
    }),
    defineSetting("worker.postItemCooldownMinutes", DEFAULTS.postItemCooldownMinutes, {
        type: "integer",
        min: 0
    }),
    defineSetting("worker.monitorIntervalSeconds", DEFAULTS.monitorIntervalSeconds, {
        type: "integer",
        min: 1
    }),
    defineSetting("worker.autoResumeAfterBreak", DEFAULTS.autoResumeAfterBreak, {
        type: "boolean"
    }),
    defineSetting("worker.autoStartQueueOnLaunch", DEFAULTS.autoStartQueueOnLaunch, {
        type: "boolean"
    }),
    defineSetting("performance.ffmpegThreads", DEFAULTS.ffmpegThreads, {
        type: "integer",
        min: 0
    }),
    defineSetting("performance.filterThreads", DEFAULTS.filterThreads, {
        type: "integer",
        min: 0
    }),
    defineSetting("performance.processPriority", DEFAULTS.processPriority, {
        type: "integer",
        min: -20,
        max: 20
    }),
    defineSetting("performance.defaultProfileId", DEFAULTS.defaultProfileId, {
        type: "profile_id"
    }),
    defineSetting("storage.inboxRoot", DEFAULTS.inboxRoot, {
        type: "path"
    }),
    defineSetting("storage.outboxRoot", DEFAULTS.outboxRoot, {
        type: "path"
    }),
    defineSetting(SCAN_INTERVAL_MINUTES_KEY, DEFAULTS.scanIntervalMinutes, {
        type: "integer",
        min: 1
    }),
    defineSetting("discovery.watchFolders", DEFAULTS.watchFolders, {
        type: "watch_folders"
    }),
    defineSetting("recovery.requeueInterruptedItems", DEFAULTS.requeueInterruptedItems, {
        type: "boolean"
    }),
    defineSetting("recovery.autoPruneEmptyDirectories", DEFAULTS.autoPruneEmptyDirectories, {
        type: "boolean"
    })
]);

const SETTINGS_DEFINITION_MAP = new Map(SETTINGS_DEFINITIONS.map(definition => [definition.key, definition]));
const VALID_PROFILE_IDS = new Set(
    Array.isArray(encodingProfiles) ? encodingProfiles.map(profile => profile.id) : []
);

module.exports = class SettingsService {
    constructor(executor) {
        this.repository = new SettingsRepository(executor);
    }

    getDefinitions() {
        return SETTINGS_DEFINITIONS.map(definition => ({
            key: definition.key,
            defaultValue: cloneValue(definition.defaultValue),
            type: definition.type,
            min: definition.min ?? null,
            max: definition.max ?? null
        }));
    }

    async getSettings() {
        const saved = await this.repository.list();
        const savedMap = new Map(saved.map(entry => [entry.key, entry.value]));
        const effective = {};

        for (const definition of SETTINGS_DEFINITIONS) {
            const nextValue = savedMap.has(definition.key)
                ? normalizeValue(savedMap.get(definition.key), definition)
                : cloneValue(definition.defaultValue);

            setNestedValue(effective, definition.key, nextValue);
        }

        return effective;
    }

    async updateSettings(input) {
        const expandedInput = expandDottedInput(input);
        const flattened = flattenInput(expandedInput);
        const updates = [];

        for (const [key, rawValue] of flattened.entries()) {
            const definition = SETTINGS_DEFINITION_MAP.get(key);
            if (!definition) {
                continue;
            }

            updates.push({
                key,
                value: normalizeValue(rawValue, definition)
            });
        }

        if (updates.length) {
            await this.repository.setMany(updates);
        }

        return this.getSettings();
    }
};

function defineSetting(key, defaultValue, options = {}) {
    return Object.freeze({
        key,
        defaultValue,
        ...options
    });
}

function flattenInput(input, prefix = "", entries = new Map()) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return entries;
    }

    for (const [key, value] of Object.entries(input)) {
        const nextKey = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === "object" && !Array.isArray(value)) {
            flattenInput(value, nextKey, entries);
            continue;
        }

        entries.set(nextKey, value);
    }

    return entries;
}

function expandDottedInput(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return input;
    }

    const expanded = {};

    for (const [rawKey, value] of Object.entries(input)) {
        const key = String(rawKey || "").trim();
        if (!key) continue;

        if (!key.includes(".")) {
            expanded[key] = value;
            continue;
        }

        setExpandedValue(expanded, key.split("."), value);
    }

    return expanded;
}

function normalizeValue(value, definition) {
    switch (definition.type) {
        case "boolean":
            return normalizeBoolean(value, definition.defaultValue);
        case "integer":
            return normalizeInteger(value, definition);
        case "profile_id":
            return normalizeProfileId(value, definition.defaultValue);
        case "path":
            return normalizePathString(value, definition.defaultValue);
        case "watch_folders":
            return normalizeWatchFolders(value);
        default:
            return value == null ? cloneValue(definition.defaultValue) : value;
    }
}

function normalizeBoolean(value, fallback) {
    if (typeof value === "boolean") {
        return value;
    }

    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (["true", "1", "yes", "on"].includes(normalized)) return true;
        if (["false", "0", "no", "off"].includes(normalized)) return false;
    }

    if (typeof value === "number") {
        return value !== 0;
    }

    return Boolean(fallback);
}

function normalizeInteger(value, definition) {
    const parsed = Number(value);
    let nextValue = Number.isFinite(parsed)
        ? Math.round(parsed)
        : Number(definition.defaultValue);

    if (Number.isFinite(definition.min)) {
        nextValue = Math.max(definition.min, nextValue);
    }

    if (Number.isFinite(definition.max)) {
        nextValue = Math.min(definition.max, nextValue);
    }

    return nextValue;
}

function normalizeProfileId(value, fallback) {
    const nextValue = String(value || "").trim();
    if (VALID_PROFILE_IDS.has(nextValue)) {
        return nextValue;
    }

    return fallback;
}

function normalizeWatchFolders(value) {
    const list = Array.isArray(value) ? value : [];

    return list
        .map(entry => ({
            path: String(entry && entry.path || "").trim(),
            enabled: normalizeBoolean(entry && entry.enabled, true)
        }))
        .filter(entry => entry.path);
}

function normalizePathString(value, fallback) {
    const nextValue = String(value == null ? fallback : value).trim();
    return nextValue || String(fallback || "").trim();
}

function setNestedValue(target, dottedKey, value) {
    const parts = String(dottedKey || "").split(".").filter(Boolean);
    if (!parts.length) return target;

    let current = target;
    for (let index = 0; index < parts.length - 1; index += 1) {
        const key = parts[index];
        if (!current[key] || typeof current[key] !== "object" || Array.isArray(current[key])) {
            current[key] = {};
        }
        current = current[key];
    }

    current[parts[parts.length - 1]] = value;
    return target;
}

function setExpandedValue(target, parts, value) {
    if (!Array.isArray(parts) || !parts.length) {
        return target;
    }

    let current = target;

    for (let index = 0; index < parts.length; index += 1) {
        const rawPart = String(parts[index] || "").trim();
        const isLast = index === parts.length - 1;
        const nextPart = parts[index + 1];
        const nextIsIndex = /^\d+$/.test(String(nextPart || ""));

        if (/^\d+$/.test(rawPart)) {
            const numericIndex = Number(rawPart);
            if (!Array.isArray(current)) {
                return target;
            }

            if (isLast) {
                current[numericIndex] = value;
                return target;
            }

            if (current[numericIndex] == null) {
                current[numericIndex] = nextIsIndex ? [] : {};
            }

            current = current[numericIndex];
            continue;
        }

        if (isLast) {
            current[rawPart] = value;
            return target;
        }

        if (current[rawPart] == null) {
            current[rawPart] = nextIsIndex ? [] : {};
        }

        current = current[rawPart];
    }

    return target;
}

function cloneValue(value) {
    if (Array.isArray(value)) {
        return value.map(cloneValue);
    }

    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, nextValue]) => [key, cloneValue(nextValue)]));
    }

    return value;
}
