const path = require("path");

const basePackage = require("./package.json");

function getVersion() {
    return String(basePackage.version || "0.0.0");
}

function getProductionCurrentOutputDir() {
    return path.join("dist", "production", "current");
}

function getProductionArchiveOutputDir() {
    return path.join("dist", "production", "archive", getVersion());
}

function getDevOutputDir() {
    return path.join("dist", "dev");
}

module.exports = {
    getVersion,
    getProductionCurrentOutputDir,
    getProductionArchiveOutputDir,
    getDevOutputDir
};
