const path = require("path");
const dotenv = require("dotenv");

const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..");

let loadedEnv = null;

function loadEncoderEnv(options = {}) {
    if (loadedEnv && !options.force) {
        return loadedEnv;
    }

    const envPath = resolveEnvPath(options.envFile || process.env.ENCODER_ENV_FILE || ".env");
    const result = dotenv.config({
        path: envPath,
        override: Boolean(options.override)
    });

    loadedEnv = {
        path: envPath,
        loaded: !result.error,
        error: result.error || null
    };

    if (loadedEnv.error && process.env.ENCODER_ENV_FILE) {
        console.warn(`[CONFIG] Requested env file was not loaded: ${envPath}`);
    }

    return loadedEnv;
}

function resolveEnvPath(envFile) {
    const value = String(envFile || ".env").trim() || ".env";
    return path.isAbsolute(value)
        ? path.resolve(value)
        : path.resolve(PROJECT_ROOT, value);
}

module.exports = {
    PROJECT_ROOT,
    loadEncoderEnv,
    resolveEnvPath
};
