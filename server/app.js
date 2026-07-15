const path = require("path");
const express = require("express");
const colors = require("colors");

const { createDatabase } = require("./modules/database/mysql");
const { runMigrations } = require("./modules/database/migrate");
const { getEncoderPaths } = require("./modules/filesystem/handoff-paths");
const { initFileLogger } = require("./modules/filesystem/logger");
const FileIntakeService = require("./modules/file-intake/file-intake.service");

require("dotenv").config({
    path: path.join(__dirname, "..", ".env")
});

colors.setTheme({
    good: "green",
    data: "brightCyan",
    warn: "yellow",
    error: "red"
});

async function startEncoderServer({ port = Number(process.env.ENCODER_PORT || 4300) } = {}) {
    const app = express();
    const encoderPaths = getEncoderPaths();
    const desktopAssetsAbs = path.join(__dirname, "..", "desktop", "assets");
    const semanticRootAbs = path.join(path.dirname(require.resolve("fomantic-ui/package.json")), "dist");
    const jqueryRootAbs = path.dirname(require.resolve("jquery/dist/jquery.js"));
    const fileIntake = new FileIntakeService({
        tempRootAbsPath: path.join(encoderPaths.internalRoot, "uploads")
    });

    app.use(express.json({ limit: "2mb" }));
    app.use(express.urlencoded({ extended: true }));
    app.use(express.static(path.join(__dirname, "..", "public")));
    app.use("/assets", express.static(desktopAssetsAbs));
    app.use("/shared/semantic", express.static(semanticRootAbs));
    app.use("/shared/jquery", express.static(jqueryRootAbs));
    app.use("/media/pending-source", express.static(encoderPaths.pending));

    initFileLogger(encoderPaths.logs);
    console.log("[encoder] Server starting...");

    const database = createDatabase();
    await runMigrations(database);

    app.locals.database = database;
    app.locals.fileIntake = fileIntake;

    require("./api/health")(app, database);
    require("./api/encoding")(app, database, fileIntake);

    const server = await new Promise((resolve, reject) => {
        const nextServer = app.listen(port, function onListen() {
            resolve(nextServer);
        });

        nextServer.once("error", reject);
    });

    const address = `http://localhost:${server.address().port}`;
    console.log(">>".good, "Encoder Server started at:", address.data);

    let isShuttingDown = false;

    async function shutdown() {
        if (isShuttingDown) return;
        isShuttingDown = true;

        console.log("[encoder] Shutdown requested.");

        await new Promise(resolve => {
            server.close(function onClose() {
                resolve();
            });
        }).catch(() => {});

        await database.close().catch(() => {});
        console.log("[encoder] Shutdown complete.");
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
