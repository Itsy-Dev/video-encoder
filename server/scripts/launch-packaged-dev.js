const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { getDevOutputDir } = require("../../build-output-paths");

const projectRoot = path.resolve(__dirname, "..", "..");
const envPath = path.join(projectRoot, ".env.dev");
const appExecutable = resolvePackagedDevExecutable();

if (!fs.existsSync(envPath)) {
    console.error(`[PACKAGED DEV] Missing ${envPath}`);
    console.error(`[PACKAGED DEV] Create it first with: ${getEnvSetupCommand()}`);
    process.exit(1);
}

if (!fs.existsSync(appExecutable)) {
    console.error(`[PACKAGED DEV] Missing packaged app executable: ${appExecutable}`);
    console.error(`[PACKAGED DEV] Build it first with: ${getPackagedDevBuildCommand()}`);
    process.exit(1);
}

console.log(`[PACKAGED DEV] Launching dev packaged app with ENCODER_ENV_FILE=${envPath}`);

const child = spawn(appExecutable, {
    stdio: "inherit",
    env: {
        ...process.env,
        ENCODER_ENV_FILE: envPath,
        ENCODER_DISTRIBUTION_PROFILE: "dev",
        ENCODER_PORT: "14310"
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

function resolvePackagedDevExecutable() {
    const devOutputDir = path.join(projectRoot, getDevOutputDir());
    const candidates = process.platform === "win32"
        ? [
            path.join(devOutputDir, "win-unpacked", "Video Encoder Dev.exe")
        ]
        : [
            path.join(devOutputDir, "mac-arm64", "Video Encoder Dev.app", "Contents", "MacOS", "Video Encoder Dev"),
            path.join(devOutputDir, "mac", "Video Encoder Dev.app", "Contents", "MacOS", "Video Encoder Dev"),
            path.join(devOutputDir, "mac-x64", "Video Encoder Dev.app", "Contents", "MacOS", "Video Encoder Dev")
        ];

    const existing = candidates.find(candidate => fs.existsSync(candidate));
    return existing || candidates[0];
}

function getEnvSetupCommand() {
    if (process.platform === "win32") {
        return "copy .env.dev.example .env.dev";
    }

    return "cp .env.dev.example .env.dev";
}

function getPackagedDevBuildCommand() {
    if (process.platform === "win32") {
        return "npm run pack:dev:win";
    }

    return "npm run pack:dev";
}
