const encodingProfiles = require("../encoding/encoding-profiles");
const SettingsRepository = require("./settings.repository");

const SETTINGS_DEFINITIONS = Object.freeze([
    defineSetting("worker.continuousRunLimitMinutes", 20, {
        type: "integer",
        min: 1
    }),
    defineSetting("worker.breakDurationMinutes", 5, {
        type: "integer",
        min: 0
    }),
    defineSetting("worker.postItemCooldownMinutes", 20, {
        type: "integer",
        min: 0
    }),
    defineSetting("worker.monitorIntervalSeconds", 30, {
        type: "integer",
        min: 1
    }),
    defineSetting("worker.autoResumeAfterBreak", true, {
        type: "boolean"
    }),
    defineSetting("worker.autoStartQueueOnLaunch", true, {
        type: "boolean"
    }),
    defineSetting("performance.ffmpegThreads", 1, {
        type: "integer",
        min: 0
    }),
    defineSetting("performance.filterThreads", 2, {
        type: "integer",
        min: 0
    }),
    defineSetting("performance.processPriority", 15, {
        type: "integer",
        min: -20,
        max: 20
    }),
    defineSetting("performance.defaultProfileId", "browser_compatibility", {
        type: "profile_id"
    }),
    defineSetting("discovery.scanIntervalSeconds", 30, {
        type: "integer",
        min: 1
    }),
    defineSetting("discovery.watchFolders", [], {
        type: "watch_folders"
    }),
    defineSetting("recovery.requeueInterruptedItems", true, {
        type: "boolean"
    }),
    defineSetting("recovery.autoPruneEmptyDirectories", true, {
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
        const flattened = flattenInput(input);
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

function normalizeValue(value, definition) {
    switch (definition.type) {
        case "boolean":
            return normalizeBoolean(value, definition.defaultValue);
        case "integer":
            return normalizeInteger(value, definition);
        case "profile_id":
            return normalizeProfileId(value, definition.defaultValue);
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

function cloneValue(value) {
    if (Array.isArray(value)) {
        return value.map(cloneValue);
    }

    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, nextValue]) => [key, cloneValue(nextValue)]));
    }

    return value;
}
