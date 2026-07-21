const path = require("path");
const express = require("express");

const { createDatabase } = require("./modules/database/sqlite");
const { runMigrations } = require("./modules/database/migrate");
const { getEncoderPaths } = require("./modules/filesystem/handoff-paths");
const { initFileLogger } = require("./modules/filesystem/logger");
const FileIntakeService = require("./modules/file-intake/file-intake.service");
const { loadEncoderEnv } = require("./modules/config/env-loader");
const { reservePort } = require("./modules/runtime/port-reservation");
const { acquireRuntimeLock } = require("./modules/runtime/runtime-lock");

const loadedEnv = loadEncoderEnv();

async function startEncoderServer({ port = Number(process.env.ENCODER_PORT || 4300) } = {}) {
    const app = express();
    const encoderPaths = getEncoderPaths();
    const desktopAssetsAbs = path.join(__dirname, "..", "desktop", "assets");
    const semanticRootAbs = path.dirname(require.resolve("fomantic-ui-css/semantic.min.css"));
    const jqueryRootAbs = path.dirname(require.resolve("jquery/dist/jquery.js"));

    app.use(express.json({ limit: "2mb" }));
    app.use(express.urlencoded({ extended: true }));
    app.use(express.static(path.join(__dirname, "..", "public")));
    app.use("/assets", express.static(desktopAssetsAbs));
    app.use("/shared/semantic", express.static(semanticRootAbs));
    app.use("/shared/jquery", express.static(jqueryRootAbs));

    let database = null;
    let encodingApiHandle = null;
    let fileIntake = null;
    let server = null;
    let portReservation = null;
    let runtimeLock = null;
    let isShuttingDown = false;

    try {
        portReservation = await reservePort(port);
        runtimeLock = await acquireRuntimeLock(encoderPaths.internalRoot);
        fileIntake = new FileIntakeService({
            tempRootAbsPath: encoderPaths.uploads
        });

        initFileLogger(encoderPaths.logs);
        console.log("[SERVER] Server starting...");
        console.log(`[SERVER] Env file: ${loadedEnv.loaded ? loadedEnv.path : `${loadedEnv.path} (not loaded)`}`);
        console.log(`[SERVER] Runtime lock: ${runtimeLock.path}`);
        console.log(`[SERVER] Runtime paths: appData=${encoderPaths.internalRoot}`);
        console.log(`[SERVER] Runtime paths: cache=${encoderPaths.cacheRoot}`);
        console.log(`[SERVER] Runtime paths: logs=${encoderPaths.logs}`);
        console.log(`[SERVER] Handoff paths: inbox=${encoderPaths.inbox}`);
        console.log(`[SERVER] Handoff paths: outbox=${encoderPaths.outbox}`);

        database = createDatabase();
        await runMigrations(database);

        app.locals.database = database;
        app.locals.fileIntake = fileIntake;

        require("./api/health")(app, database);
        encodingApiHandle = require("./api/encoding")(app, database, fileIntake);
        if (encodingApiHandle && encodingApiHandle.ready) {
            await encodingApiHandle.ready;
        }

        await portReservation.release();

        server = await new Promise((resolve, reject) => {
            const nextServer = app.listen(port, function onListen() {
                resolve(nextServer);
            });

            nextServer.once("error", reject);
        });

        const address = `http://localhost:${server.address().port}`;
        console.log("[SERVER] Encoder Server started at:", address);

        return {
            app,
            server,
            database,
            address,
            port: server.address().port,
            shutdown
        };
    }
    catch (error) {
        await cleanupFailedStartup();
        throw error;
    }

    async function shutdown() {
        if (isShuttingDown) return;
        isShuttingDown = true;

        console.log("[SERVER] Shutdown requested.");

        if (encodingApiHandle && encodingApiHandle.encodingService) {
            await encodingApiHandle.encodingService.shutdown();
        }

        if (server) {
            await new Promise(resolve => {
                server.close(function onClose() {
                    resolve();
                });
            }).catch(() => {});
        }

        if (database) {
            await database.close().catch(() => {});
        }
        if (runtimeLock) {
            await runtimeLock.release().catch(() => {});
        }
        console.log("[SERVER] Shutdown complete.");
    }

    async function cleanupFailedStartup() {
        if (encodingApiHandle && encodingApiHandle.encodingService) {
            await encodingApiHandle.encodingService.shutdown().catch(() => {});
        }
        if (server) {
            await new Promise(resolve => server.close(() => resolve())).catch(() => {});
        }
        if (database) {
            await database.close().catch(() => {});
        }
        if (portReservation) {
            await portReservation.release().catch(() => {});
        }
        if (runtimeLock) {
            await runtimeLock.release().catch(() => {});
        }
    }
}

module.exports = {
    startEncoderServer
};
