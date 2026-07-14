const path = require("path");

const ENCODER_SERVICE_ROOT = path.resolve(__dirname, "..", "..", "..");

function getEncoderHandoffRoot() {
    return resolveEncoderPath(
        process.env.ENCODER_HANDOFF_ROOT,
        path.join(ENCODER_SERVICE_ROOT, "handoff")
    );
}

function getEncoderInternalRoot() {
    return resolveEncoderPath(
        process.env.ENCODER_INTERNAL_ROOT,
        path.join(ENCODER_SERVICE_ROOT, ".internal")
    );
}

function getEncoderPaths() {
    const handoffRoot = getEncoderHandoffRoot();
    const internalRoot = getEncoderInternalRoot();
    return {
        handoffRoot,
        internalRoot,
        inbox: path.join(handoffRoot, "inbox"),
        outbox: path.join(handoffRoot, "outbox"),
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
    getEncoderHandoffRoot,
    getEncoderInternalRoot,
    getEncoderPaths
};
