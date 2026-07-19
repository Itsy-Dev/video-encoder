const path = require("path");
const os = require("os");

const ENCODER_SERVICE_ROOT = path.resolve(__dirname, "..", "..", "..");

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
        path.join(ENCODER_SERVICE_ROOT, ".internal")
    );
}

function getEncoderPaths(options = {}) {
    const internalRoot = options.internalRoot
        ? resolveEncoderPath(options.internalRoot, getEncoderInternalRoot())
        : getEncoderInternalRoot();
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
        pending: path.join(internalRoot, "pending"),
        working: path.join(internalRoot, "working"),
        encoded: path.join(internalRoot, "encoded"),
        logs: path.join(internalRoot, "logs")
    };
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
