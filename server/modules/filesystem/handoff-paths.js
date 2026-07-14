const path = require("path");

function getEncoderHandoffRoot() {
    return path.resolve(
        process.env.ENCODER_HANDOFF_ROOT || path.join(__dirname, "..", "..", "..", "handoff")
    );
}

function getEncoderInternalRoot() {
    return path.resolve(
        process.env.ENCODER_INTERNAL_ROOT || path.join(__dirname, "..", "..", "..", ".internal")
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

module.exports = {
    getEncoderHandoffRoot,
    getEncoderInternalRoot,
    getEncoderPaths
};
