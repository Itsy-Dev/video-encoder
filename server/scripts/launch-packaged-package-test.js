const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const projectRoot = path.resolve(__dirname, "..", "..");
const envPath = path.join(projectRoot, ".env.package-test");
const appExecutable = path.join(
    projectRoot,
    "dist",
    "mac-arm64",
    "Video Encoder.app",
    "Contents",
    "MacOS",
    "Video Encoder"
);

if (!fs.existsSync(envPath)) {
    console.error(`[PACKAGED TEST] Missing ${envPath}`);
    console.error("[PACKAGED TEST] Create it first with: cp .env.package-test.example .env.package-test");
    process.exit(1);
}

if (!fs.existsSync(appExecutable)) {
    console.error(`[PACKAGED TEST] Missing packaged app executable: ${appExecutable}`);
    console.error("[PACKAGED TEST] Build it first with: npm run pack");
    process.exit(1);
}

console.log(`[PACKAGED TEST] Launching packaged app with ENCODER_ENV_FILE=${envPath}`);

const child = spawn(appExecutable, {
    stdio: "inherit",
    env: {
        ...process.env,
        ENCODER_ENV_FILE: envPath
    }
});

child.on("error", error => {
    console.error("[PACKAGED TEST] Failed to launch packaged app:", error);
    process.exit(1);
});

child.on("exit", (code, signal) => {
    if (signal) {
        process.kill(process.pid, signal);
        return;
    }

    process.exit(code == null ? 1 : code);
});
