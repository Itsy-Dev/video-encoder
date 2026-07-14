const path = require("path");
const express = require("express");
const colors = require("colors");
const { createDatabase } = require("./modules/database/mysql");
const { runMigrations } = require("./modules/database/migrate");
const { getEncoderPaths } = require("./modules/filesystem/handoff-paths");
const { initFileLogger } = require("./modules/filesystem/logger");

require("dotenv").config({
    path: path.join(__dirname, "..", ".env")
});

colors.setTheme({
    good: "green",
    data: "brightCyan",
    warn: "yellow",
    error: "red"
});

const app = express();
const encoderPaths = getEncoderPaths();

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "..", "public")));
app.use("/assets", express.static(path.join(__dirname, "..", "..", "..", "packages", "shared", "public", "assets")));
app.use("/shared/semantic", express.static(path.join(__dirname, "..", "..", "..", "node_modules", "fomantic-ui", "dist")));
app.use("/media/pending-source", express.static(encoderPaths.pending));

async function start() {
    initFileLogger(encoderPaths.logs);
    console.log("[encoder] Server starting...");

    const database = createDatabase();
    await runMigrations(database);

    app.locals.database = database;

    require("./api/health")(app, database);
    require("./api/encoding")(app, database);

    const port = Number(process.env.ENCODER_PORT || 4300);
    const server = app.listen(port, function () {
        const address = `http://localhost:${server.address().port}`;
        console.log(">>".good, "Encoder Server started at:", address.data);
    });

    const shutdown = async function shutdown() {
        console.log("[encoder] Shutdown requested.");
        server.close();
        await database.close().catch(() => {});
        console.log("[encoder] Shutdown complete.");
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
}

start().catch(error => {
    console.error(">>".error, "Encoder Server failed to start:", error);
    process.exit(1);
});
