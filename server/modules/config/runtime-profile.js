const path = require("path");
const os = require("os");

const PRODUCTION_PROFILE = "production";
const DEV_PROFILE = "dev";
const PRODUCTION_APP_NAME = "Video Encoder";
const DEV_APP_NAME = "Video Encoder Dev";
const PRODUCTION_PORT = 4300;
const DEV_PORT = 14310;

function getDistributionProfile(options = {}) {
    const env = options.env || process.env;
    const configuredProfile = String(env.ENCODER_DISTRIBUTION_PROFILE || "").trim().toLowerCase();
    if (configuredProfile === DEV_PROFILE) {
        return DEV_PROFILE;
    }

    if (configuredProfile === PRODUCTION_PROFILE) {
        return PRODUCTION_PROFILE;
    }

    const appName = String(options.appName || env.ENCODER_APP_NAME || "").trim().toLowerCase();
    return appName.includes("video encoder dev")
        ? DEV_PROFILE
        : PRODUCTION_PROFILE;
}

function isDevDistribution(options = {}) {
    return getDistributionProfile(options) === DEV_PROFILE;
}

function getRuntimeAppName(options = {}) {
    return isDevDistribution(options) ? DEV_APP_NAME : PRODUCTION_APP_NAME;
}

function getDefaultPort(options = {}) {
    const env = options.env || process.env;
    const configuredPort = Number(env.ENCODER_PORT);
    if (Number.isFinite(configuredPort) && configuredPort > 0) {
        return configuredPort;
    }

    return isDevDistribution(options) ? DEV_PORT : PRODUCTION_PORT;
}

function getDefaultAppDataRoot(options = {}) {
    const appName = getRuntimeAppName(options);

    if (process.platform === "darwin") {
        return path.join(os.homedir(), "Library", "Application Support", appName);
    }

    if (process.platform === "win32") {
        return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), appName);
    }

    return path.join(os.homedir(), ".local", "share", slugifyAppName(appName));
}

function getDefaultCacheRoot(options = {}) {
    const appName = getRuntimeAppName(options);

    if (process.platform === "darwin") {
        return path.join(os.homedir(), "Library", "Caches", appName);
    }

    if (process.platform === "win32") {
        return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), appName, "Cache");
    }

    return path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), slugifyAppName(appName));
}

function getDefaultLogsRoot(options = {}) {
    const appName = getRuntimeAppName(options);

    if (process.platform === "darwin") {
        return path.join(os.homedir(), "Library", "Logs", appName);
    }

    if (process.platform === "win32") {
        return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), appName, "Logs");
    }

    return path.join(getDefaultAppDataRoot(options), "logs");
}

function getDefaultMediaRoot() {
    if (process.platform === "win32") {
        return path.join(os.homedir(), "Videos");
    }

    return path.join(os.homedir(), "Movies");
}

function getDefaultInboxRoot(options = {}) {
    return path.join(getDefaultMediaRoot(), `${getRuntimeAppName(options)} Inbox`);
}

function getDefaultOutboxRoot(options = {}) {
    return path.join(getDefaultMediaRoot(), `${getRuntimeAppName(options)} Outbox`);
}

function slugifyAppName(appName) {
    return String(appName || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "video-encoder";
}

module.exports = {
    PRODUCTION_PROFILE,
    DEV_PROFILE,
    getDistributionProfile,
    isDevDistribution,
    getRuntimeAppName,
    getDefaultPort,
    getDefaultAppDataRoot,
    getDefaultCacheRoot,
    getDefaultLogsRoot,
    getDefaultMediaRoot,
    getDefaultInboxRoot,
    getDefaultOutboxRoot
};
