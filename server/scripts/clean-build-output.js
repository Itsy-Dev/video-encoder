const fs = require("fs");
const path = require("path");

const {
    getDevOutputDir,
    getProductionCurrentOutputDir
} = require("../../build-output-paths");

const projectRoot = path.resolve(__dirname, "..", "..");
const target = String(process.argv[2] || "").toLowerCase();

const outputDir = target === "dev"
    ? path.join(projectRoot, getDevOutputDir())
    : target === "production"
        ? path.join(projectRoot, getProductionCurrentOutputDir())
        : null;

if (!outputDir) {
    console.error("[CLEAN BUILD] Usage: node server/scripts/clean-build-output.js <production|dev>");
    process.exit(1);
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

console.log(`[CLEAN BUILD] Prepared ${outputDir}`);
