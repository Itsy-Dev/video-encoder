const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const projectRoot = path.resolve(__dirname, "..", "..");
const envPath = path.join(projectRoot, ".env.package-test");
const appExecutable = path.join(
    projectRoot,
    "dist-package-test",
    "mac-arm64",
    "Video Encoder Package Test.app",
    "Contents",
    "MacOS",
    "Video Encoder Package Test"
);

if (!fs.existsSync(envPath)) {
    console.error(`[PACKAGED TEST] Missing ${envPath}`);
    console.error("[PACKAGED TEST] Create it first with: cp .env.package-test.example .env.package-test");
    process.exit(1);
}

if (!fs.existsSync(appExecutable)) {
    console.error(`[PACKAGED TEST] Missing packaged app executable: ${appExecutable}`);
    console.error("[PACKAGED TEST] Build it first with: npm run pack:package-test");
    process.exit(1);
}

console.log(`[PACKAGED TEST] Launching dedicated package-test app with ENCODER_ENV_FILE=${envPath}`);

const child = spawn(appExecutable, {
    stdio: "inherit",
    env: {
        ...process.env,
        ENCODER_ENV_FILE: envPath,
        ENCODER_DISTRIBUTION_PROFILE: "package-test"
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
