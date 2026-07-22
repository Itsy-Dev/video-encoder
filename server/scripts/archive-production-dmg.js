const fs = require("fs");
const path = require("path");

const {
    getProductionArchiveOutputDir,
    getProductionCurrentOutputDir
} = require("../../build-output-paths");

const projectRoot = path.resolve(__dirname, "..", "..");
const currentOutputDir = path.join(projectRoot, getProductionCurrentOutputDir());
const archiveOutputDir = path.join(projectRoot, getProductionArchiveOutputDir());

if (!fs.existsSync(currentOutputDir)) {
    console.error(`[ARCHIVE PROD] Missing production output directory: ${currentOutputDir}`);
    process.exit(1);
}

const dmgFiles = fs.readdirSync(currentOutputDir)
    .filter(name => name.toLowerCase().endsWith(".dmg"));

if (!dmgFiles.length) {
    console.error(`[ARCHIVE PROD] No DMG files found in: ${currentOutputDir}`);
    process.exit(1);
}

fs.mkdirSync(archiveOutputDir, { recursive: true });

for (const filename of dmgFiles) {
    const sourceAbsPath = path.join(currentOutputDir, filename);
    const destinationAbsPath = path.join(archiveOutputDir, filename);
    fs.copyFileSync(sourceAbsPath, destinationAbsPath);
    console.log(`[ARCHIVE PROD] Archived ${filename} -> ${destinationAbsPath}`);
}
