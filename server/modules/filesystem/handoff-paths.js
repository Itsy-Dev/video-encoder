const path = require("path");
const os = require("os");

const ENCODER_SERVICE_ROOT = path.resolve(__dirname, "..", "..", "..");
const APP_NAME = "Video Encoder";
const APP_SLUG = "video-encoder";

function getDefaultInboxRoot() {
    return path.join(os.homedir(), "Movies", "Video Encoder Inbox");
}

function getDefaultOutboxRoot() {
    return path.join(os.homedir(), "Movies", "Video Encoder Outbox");
}

function getConfiguredDefaultInboxRoot() {
    return resolveEncoderPath(
        process.env.ENCODER_DEFAULT_INBOX_ROOT || process.env.ENCODER_INBOX_ROOT,
        getDefaultInboxRoot()
    );
}

function getConfiguredDefaultOutboxRoot() {
    return resolveEncoderPath(
        process.env.ENCODER_DEFAULT_OUTBOX_ROOT || process.env.ENCODER_OUTBOX_ROOT,
        getDefaultOutboxRoot()
    );
}

function getEncoderInboxRoot(overridePath = null) {
    return resolveEncoderPath(overridePath, getDefaultInboxRoot());
}

function getEncoderOutboxRoot(overridePath = null) {
    return resolveEncoderPath(overridePath, getDefaultOutboxRoot());
}

function getEncoderInternalRoot() {
    return resolveEncoderPath(
        process.env.ENCODER_INTERNAL_ROOT,
        getDefaultAppDataRoot()
    );
}

function getEncoderCacheRoot() {
    return resolveEncoderPath(
        process.env.ENCODER_CACHE_ROOT,
        getDefaultCacheRoot()
    );
}

function getEncoderLogsRoot() {
    return resolveEncoderPath(
        process.env.ENCODER_LOGS_ROOT,
        getDefaultLogsRoot()
    );
}

function getEncoderPaths(options = {}) {
    const internalRoot = options.internalRoot
        ? resolveEncoderPath(options.internalRoot, getEncoderInternalRoot())
        : getEncoderInternalRoot();
    const cacheRoot = options.cacheRoot
        ? resolveEncoderPath(options.cacheRoot, getEncoderCacheRoot())
        : getEncoderCacheRoot();
    const logsRoot = options.logsRoot
        ? resolveEncoderPath(options.logsRoot, getEncoderLogsRoot())
        : getEncoderLogsRoot();
    const inbox = options.inbox
        ? getEncoderInboxRoot(options.inbox)
        : getConfiguredDefaultInboxRoot();
    const outbox = options.outbox
        ? getEncoderOutboxRoot(options.outbox)
        : getConfiguredDefaultOutboxRoot();

    return {
        handoffRoot: findCommonParent(inbox, outbox),
        internalRoot,
        inbox,
        outbox,
        working: path.join(cacheRoot, "working"),
        uploads: path.join(cacheRoot, "uploads"),
        logs: logsRoot
    };
}

function getDefaultAppDataRoot() {
    if (process.platform === "darwin") {
        return path.join(os.homedir(), "Library", "Application Support", APP_NAME);
    }

    if (process.platform === "win32") {
        return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), APP_NAME);
    }

    return path.join(os.homedir(), ".local", "share", APP_SLUG);
}

function getDefaultCacheRoot() {
    if (process.platform === "darwin") {
        return path.join(os.homedir(), "Library", "Caches", APP_NAME);
    }

    if (process.platform === "win32") {
        return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), APP_NAME, "Cache");
    }

    return path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), APP_SLUG);
}

function getDefaultLogsRoot() {
    if (process.platform === "darwin") {
        return path.join(os.homedir(), "Library", "Logs", APP_NAME);
    }

    if (process.platform === "win32") {
        return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), APP_NAME, "Logs");
    }

    return path.join(getDefaultAppDataRoot(), "logs");
}

function resolveEncoderPath(targetPath, fallbackAbsPath) {
    const value = String(targetPath || "").trim();
    if (!value) {
        return fallbackAbsPath;
    }

    const expandedValue = value.startsWith("~/")
        ? path.join(os.homedir(), value.slice(2))
        : value;

    if (path.isAbsolute(expandedValue)) {
        return path.resolve(expandedValue);
    }

    return path.resolve(ENCODER_SERVICE_ROOT, expandedValue);
}

module.exports = {
    getDefaultInboxRoot,
    getDefaultOutboxRoot,
    getConfiguredDefaultInboxRoot,
    getConfiguredDefaultOutboxRoot,
    getEncoderInboxRoot,
    getEncoderOutboxRoot,
    getEncoderInternalRoot,
    getEncoderCacheRoot,
    getEncoderLogsRoot,
    getDefaultAppDataRoot,
    getDefaultCacheRoot,
    getDefaultLogsRoot,
    getEncoderPaths
};

function findCommonParent(leftPath, rightPath) {
    const leftParts = path.resolve(leftPath).split(path.sep).filter(Boolean);
    const rightParts = path.resolve(rightPath).split(path.sep).filter(Boolean);
    const shared = [];
    const limit = Math.min(leftParts.length, rightParts.length);

    for (let index = 0; index < limit; index += 1) {
        if (leftParts[index] !== rightParts[index]) {
            break;
        }
        shared.push(leftParts[index]);
    }

    if (!shared.length) {
        return path.parse(path.resolve(leftPath)).root || path.sep;
    }

    return path.join(path.parse(path.resolve(leftPath)).root, ...shared);
}
