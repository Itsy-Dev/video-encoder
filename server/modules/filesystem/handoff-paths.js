const path = require("path");
const os = require("os");

const ENCODER_SERVICE_ROOT = path.resolve(__dirname, "..", "..", "..");

function getDefaultInboxRoot() {
    return path.join(os.homedir(), "Movies", "Video Encoder Inbox");
}

function getDefaultOutboxRoot() {
    return path.join(os.homedir(), "Movies", "Video Encoder Outbox");
}

function getEncoderInboxRoot(overridePath = null) {
    const fallback = process.env.ENCODER_HANDOFF_ROOT
        ? path.join(resolveEncoderPath(process.env.ENCODER_HANDOFF_ROOT, path.join(ENCODER_SERVICE_ROOT, "handoff")), "inbox")
        : getDefaultInboxRoot();

    return resolveEncoderPath(overridePath, fallback);
}

function getEncoderOutboxRoot(overridePath = null) {
    const fallback = process.env.ENCODER_HANDOFF_ROOT
        ? path.join(resolveEncoderPath(process.env.ENCODER_HANDOFF_ROOT, path.join(ENCODER_SERVICE_ROOT, "handoff")), "outbox")
        : getDefaultOutboxRoot();

    return resolveEncoderPath(overridePath, fallback);
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
    const inbox = getEncoderInboxRoot(options.inbox);
    const outbox = getEncoderOutboxRoot(options.outbox);

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

    if (path.isAbsolute(value)) {
        return path.resolve(value);
    }

    return path.resolve(ENCODER_SERVICE_ROOT, value);
}

module.exports = {
    getDefaultInboxRoot,
    getDefaultOutboxRoot,
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
