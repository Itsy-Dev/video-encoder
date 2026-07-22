const packageJson = require("../../../package.json");

function getAppMeta() {
    const version = String(packageJson.version || "0.0.0");
    const lane = detectLane();
    const laneLabel = lane === "dev" ? "dev" : "";
    const versionLabel = laneLabel ? `v${version} · ${laneLabel}` : `v${version}`;

    return {
        version,
        lane,
        laneLabel,
        versionLabel
    };
}

function detectLane() {
    const distributionProfile = String(process.env.ENCODER_DISTRIBUTION_PROFILE || "").toLowerCase();
    if (distributionProfile === "dev") {
        return "dev";
    }

    const envFile = String(process.env.ENCODER_ENV_FILE || "").toLowerCase();
    if (envFile.includes(".env.dev")) {
        return "dev";
    }

    return "production";
}

module.exports = {
    getAppMeta
};
