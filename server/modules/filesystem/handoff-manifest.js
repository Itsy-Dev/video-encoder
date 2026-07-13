const fs = require("fs");
const path = require("path");

async function loadRequestManifest(manifestAbsPath) {
    const raw = await fs.promises.readFile(manifestAbsPath, "utf8");
    const parsed = JSON.parse(raw);

    return {
        ...parsed,
        manifestAbsPath: path.resolve(manifestAbsPath)
    };
}

function isRequestManifestFileName(fileAbsPath) {
    return String(fileAbsPath || "").endsWith(".request.json");
}

function buildRequestManifestName(filename) {
    const base = path.basename(String(filename || ""), path.extname(String(filename || "")));
    return `${base}.request.json`;
}

module.exports = {
    loadRequestManifest,
    isRequestManifestFileName,
    buildRequestManifestName
};
