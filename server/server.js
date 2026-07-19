const { startEncoderServer } = require("./app");

let serverHandle = null;

async function shutdown() {
    if (!serverHandle) {
        return;
    }

    const handle = serverHandle;
    serverHandle = null;
    await handle.shutdown().catch(() => {});
}

async function start() {
    serverHandle = await startEncoderServer();

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
}

start().catch(error => {
    console.error("[SERVER] Encoder Server failed to start:", error);
    process.exit(1);
});
