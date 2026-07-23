const fs = require("fs");
const path = require("path");

const {
    getProductionArchiveOutputDir,
    getProductionCurrentOutputDir,
    resolveBuildPlatform
} = require("../../build-output-paths");

const projectRoot = path.resolve(__dirname, "..", "..");
const targetPlatform = resolveBuildPlatform();
const currentOutputDir = path.join(projectRoot, getProductionCurrentOutputDir(targetPlatform));
const archiveOutputDir = path.join(projectRoot, getProductionArchiveOutputDir(targetPlatform));

const existingArtifacts = fs.existsSync(currentOutputDir)
    ? fs.readdirSync(currentOutputDir).filter(name => isArchiveableArtifact(name))
    : [];

for (const filename of existingArtifacts) {
    const version = parseVersionFromArtifactName(filename);
    if (!version) {
        console.warn(`[PREP PROD] Skipping artifact with unrecognized version pattern: ${filename}`);
        continue;
    }

    const archiveDir = path.join(path.dirname(archiveOutputDir), version);
    fs.mkdirSync(archiveDir, { recursive: true });

    const sourceAbsPath = path.join(currentOutputDir, filename);
    const destinationAbsPath = path.join(archiveDir, filename);
    fs.copyFileSync(sourceAbsPath, destinationAbsPath);
    console.log(`[PREP PROD] Archived ${filename} -> ${destinationAbsPath}`);
}

fs.rmSync(currentOutputDir, { recursive: true, force: true });
fs.mkdirSync(currentOutputDir, { recursive: true });

console.log(`[PREP PROD] Prepared ${currentOutputDir}`);

function isArchiveableArtifact(filename) {
    return /\.(dmg|zip|exe|appx|msi|blockmap|ya?ml)$/i.test(String(filename || ""));
}

function parseVersionFromArtifactName(filename) {
    const match = String(filename || "").match(/-(\d+(?:\.\d+)+)-[^-]+\.[^.]+$/i);
    if (!match) {
        return "";
    }

    const segments = String(match[1] || "")
        .split(".")
        .filter(Boolean);

    if (segments.length < 3) {
        return "";
    }

    return segments.slice(0, 3).join(".");
}
