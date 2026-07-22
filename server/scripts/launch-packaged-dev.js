const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const projectRoot = path.resolve(__dirname, "..", "..");
const envPath = path.join(projectRoot, ".env.dev");
const appExecutable = path.join(
    projectRoot,
    "dist-dev",
    "mac-arm64",
    "Video Encoder Dev.app",
    "Contents",
    "MacOS",
    "Video Encoder Dev"
);

if (!fs.existsSync(envPath)) {
    console.error(`[PACKAGED DEV] Missing ${envPath}`);
    console.error("[PACKAGED DEV] Create it first with: cp .env.dev.example .env.dev");
    process.exit(1);
}

if (!fs.existsSync(appExecutable)) {
    console.error(`[PACKAGED DEV] Missing packaged app executable: ${appExecutable}`);
    console.error("[PACKAGED DEV] Build it first with: npm run pack:dev");
    process.exit(1);
}

console.log(`[PACKAGED DEV] Launching dev packaged app with ENCODER_ENV_FILE=${envPath}`);

const child = spawn(appExecutable, {
    stdio: "inherit",
    env: {
        ...process.env,
        ENCODER_ENV_FILE: envPath,
        ENCODER_DISTRIBUTION_PROFILE: "dev"
    }
});

child.on("error", error => {
    console.error("[PACKAGED DEV] Failed to launch packaged app:", error);
    process.exit(1);
});

child.on("exit", (code, signal) => {
    if (signal) {
        process.kill(process.pid, signal);
        return;
    }

    process.exit(code == null ? 1 : code);
});
