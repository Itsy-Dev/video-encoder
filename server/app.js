const path = require("path");
const express = require("express");

const { createDatabase } = require("./modules/database/sqlite");
const { runMigrations } = require("./modules/database/migrate");
const { getEncoderPaths } = require("./modules/filesystem/handoff-paths");
const { initFileLogger } = require("./modules/filesystem/logger");
const FileIntakeService = require("./modules/file-intake/file-intake.service");

require("dotenv").config({
    path: path.join(__dirname, "..", ".env")
});

async function startEncoderServer({ port = Number(process.env.ENCODER_PORT || 4300) } = {}) {
    const app = express();
    const encoderPaths = getEncoderPaths();
    const desktopAssetsAbs = path.join(__dirname, "..", "desktop", "assets");
    const semanticRootAbs = path.dirname(require.resolve("fomantic-ui-css/semantic.min.css"));
    const jqueryRootAbs = path.dirname(require.resolve("jquery/dist/jquery.js"));
    const fileIntake = new FileIntakeService({
        tempRootAbsPath: encoderPaths.uploads
    });

    app.use(express.json({ limit: "2mb" }));
    app.use(express.urlencoded({ extended: true }));
    app.use(express.static(path.join(__dirname, "..", "public")));
    app.use("/assets", express.static(desktopAssetsAbs));
    app.use("/shared/semantic", express.static(semanticRootAbs));
    app.use("/shared/jquery", express.static(jqueryRootAbs));

    initFileLogger(encoderPaths.logs);
    console.log("[SERVER] Server starting...");

    const database = createDatabase();
    await runMigrations(database);

    app.locals.database = database;
    app.locals.fileIntake = fileIntake;

    require("./api/health")(app, database);
    const encodingApiHandle = require("./api/encoding")(app, database, fileIntake);
    if (encodingApiHandle && encodingApiHandle.ready) {
        await encodingApiHandle.ready;
    }

    const server = await new Promise((resolve, reject) => {
        const nextServer = app.listen(port, function onListen() {
            resolve(nextServer);
        });

        nextServer.once("error", reject);
    });

    const address = `http://localhost:${server.address().port}`;
    console.log("[SERVER] Encoder Server started at:", address);

    let isShuttingDown = false;

    async function shutdown() {
        if (isShuttingDown) return;
        isShuttingDown = true;

        console.log("[SERVER] Shutdown requested.");

        if (encodingApiHandle && encodingApiHandle.encodingService) {
            await encodingApiHandle.encodingService.shutdown();
        }

        await new Promise(resolve => {
            server.close(function onClose() {
                resolve();
            });
        }).catch(() => {});

        await database.close().catch(() => {});
        console.log("[SERVER] Shutdown complete.");
    }

    return {
        app,
        server,
        database,
        address,
        port: server.address().port,
        shutdown
    };
}

module.exports = {
    startEncoderServer
};
