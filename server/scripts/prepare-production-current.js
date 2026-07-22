const fs = require("fs");
const path = require("path");

const { getProductionCurrentOutputDir } = require("../../build-output-paths");

const projectRoot = path.resolve(__dirname, "..", "..");
const currentOutputDir = path.join(projectRoot, getProductionCurrentOutputDir());
const archiveRootDir = path.join(projectRoot, "dist", "production", "archive");

const existingDmgFiles = fs.existsSync(currentOutputDir)
    ? fs.readdirSync(currentOutputDir).filter(name => name.toLowerCase().endsWith(".dmg"))
    : [];

for (const filename of existingDmgFiles) {
    const version = parseVersionFromArtifactName(filename);
    if (!version) {
        console.warn(`[PREP PROD] Skipping DMG with unrecognized version pattern: ${filename}`);
        continue;
    }

    const archiveDir = path.join(archiveRootDir, version);
    fs.mkdirSync(archiveDir, { recursive: true });

    const sourceAbsPath = path.join(currentOutputDir, filename);
    const destinationAbsPath = path.join(archiveDir, filename);
    fs.copyFileSync(sourceAbsPath, destinationAbsPath);
    console.log(`[PREP PROD] Archived ${filename} -> ${destinationAbsPath}`);
}

fs.rmSync(currentOutputDir, { recursive: true, force: true });
fs.mkdirSync(currentOutputDir, { recursive: true });

console.log(`[PREP PROD] Prepared ${currentOutputDir}`);

function parseVersionFromArtifactName(filename) {
    const match = String(filename || "").match(/-(\d+\.\d+\.\d+)-[^-]+\.(dmg)$/i);
    return match ? match[1] : "";
}
