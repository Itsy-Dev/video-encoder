const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

const profiles = require("./encoding-profiles");
const repository = require("./encoding.repository");
const { getEncoderPaths } = require("../filesystem/handoff-paths");

const PENDING_STATES = new Set(["discovered", "pending_setup"]);
const REVIEW_STATES = new Set(["completed", "review"]);
const HISTORY_STATES = new Set(["approved", "rejected", "failed", "exported", "cancelled"]);
const VIDEO_EXTENSIONS = new Set([
    ".avi",
    ".flv",
    ".m4v",
    ".mkv",
    ".mov",
    ".mp4",
    ".mpeg",
    ".mpg",
    ".ts",
    ".webm",
    ".wmv"
]);
const STABILITY_WINDOW_MS = Number(process.env.ENCODER_INBOX_STABILITY_WINDOW_MS || 30000);
const SIZE_RECHECK_DELAY_MS = Number(process.env.ENCODER_INBOX_RECHECK_DELAY_MS || 1500);

module.exports = class EncodingService {
    async getDashboardState() {
        const items = repository.list();

        return {
            items,
            pendingItems: items.filter(item => PENDING_STATES.has(item.status)),
            reviewItems: items.filter(item => REVIEW_STATES.has(item.status)),
            historyItems: items.filter(item => HISTORY_STATES.has(item.status)),
            profiles,
            counts: {
                pending: items.filter(item => PENDING_STATES.has(item.status)).length,
                queued: items.filter(item => ["ready", "queued"].includes(item.status)).length,
                encoding: items.filter(item => ["encoding", "paused"].includes(item.status)).length,
                review: items.filter(item => REVIEW_STATES.has(item.status)).length,
                approved: items.filter(item => ["approved", "exported"].includes(item.status)).length
            }
        };
    }

    async scanInbox() {
        const paths = getEncoderPaths();
        await this._ensureManagedDirectories(paths);
        const inboxFiles = await this._findInboxVideoFiles(paths.inbox);
        const results = {
            discovered: 0,
            duplicates: 0,
            invalid: 0,
            ingested: 0,
            unstable: 0,
            files: inboxFiles.length
        };

        for (const inboxInputAbsPath of inboxFiles) {
            try {
                this._assertWithinRoot(inboxInputAbsPath, paths.inbox, "Input file must be inside the encoder inbox");

                const inboxRelativeDir = getInboxRelativeDir(inboxInputAbsPath, paths.inbox);
                const inboxRelativePath = getInboxRelativePath(inboxInputAbsPath, paths.inbox);

                const isStable = await this._isStableInboxFile(inboxInputAbsPath);
                if (!isStable) {
                    results.unstable += 1;
                    continue;
                }

                const importKey = buildImportKey(inboxRelativePath);
                const existing = repository.get(importKey);
                if (existing) {
                    results.duplicates += 1;
                    continue;
                }

                const item = await this._ingestDiscoveredItem({
                    inboxInputAbsPath,
                    inboxRelativeDir,
                    inboxRelativePath,
                    importKey,
                    paths
                });
                if (item) results.discovered += 1;
                if (item && item.managedInputAbsPath) results.ingested += 1;
            }
            catch (_error) {
                results.invalid += 1;
            }
        }

        return results;
    }

    async queueItem(id, { profileId, inboxRelativeDir } = {}) {
        const item = this._requireItem(id);
        const selectedProfileId = profiles.some(profile => profile.id === profileId)
            ? profileId
            : (item.requestedProfileId || "browser_compatibility");

        return repository.upsert({
            ...item,
            profileId: selectedProfileId,
            inboxRelativeDir: normalizeRelativeDir(inboxRelativeDir, item.inboxRelativeDir),
            status: "queued",
            queuedAt: new Date().toISOString(),
            outputFilename: buildOutputFilename(item.originalFilename, selectedProfileId)
        });
    }

    async approveItem(id, { reviewer } = {}) {
        const item = this._requireItem(id);
        return repository.upsert({
            ...item,
            status: "approved",
            reviewNotes: `Approved by ${reviewer || "operator"}`,
            approvedAt: new Date().toISOString()
        });
    }

    async rejectItem(id, { reviewer, notes } = {}) {
        const item = this._requireItem(id);
        return repository.upsert({
            ...item,
            status: "rejected",
            reviewNotes: notes || `Rejected by ${reviewer || "operator"}`,
            rejectedAt: new Date().toISOString()
        });
    }

    _requireItem(id) {
        const item = repository.get(id);
        if (!item) {
            const error = new Error(`Encoding item not found: ${id}`);
            error.statusCode = 404;
            throw error;
        }
        return item;
    }

    async _ingestDiscoveredItem({
        inboxInputAbsPath,
        inboxRelativeDir,
        inboxRelativePath,
        importKey,
        paths
    }) {
        const inputStat = await fsp.stat(inboxInputAbsPath);
        if (!inputStat.isFile()) {
            throw new Error(`Input file missing: ${inboxInputAbsPath}`);
        }

        const pendingItemRoot = path.join(paths.pending, sanitizeSegment(importKey));
        const managedSourceRoot = path.join(pendingItemRoot, "source");
        const managedInputAbsPath = path.join(managedSourceRoot, path.basename(inboxInputAbsPath));

        await fsp.mkdir(managedSourceRoot, { recursive: true });
        await copyFileIfMissing(inboxInputAbsPath, managedInputAbsPath);

        return repository.upsert(this._buildDiscoveredItem({
            id: importKey,
            inboxRelativeDir,
            inboxRelativePath,
            inboxInputAbsPath,
            managedInputAbsPath,
            fileSizeBytes: inputStat.size
        }));
    }

    _buildDiscoveredItem({
        id,
        inboxRelativeDir,
        inboxRelativePath,
        inboxInputAbsPath,
        managedInputAbsPath,
        fileSizeBytes
    }) {
        const now = new Date().toISOString();
        const inputAbsPath = inboxInputAbsPath;

        return {
            id,
            status: "pending_setup",
            inboxRelativeDir,
            inboxRelativePath,
            requestedAt: now,
            requestedBy: null,
            originalFilename: path.basename(inputAbsPath),
            requestedProfileId: "browser_compatibility",
            videoUuid: null,
            entityType: "video",
            entityId: null,
            inboxInputAbsPath: inputAbsPath,
            inputAbsPath: managedInputAbsPath,
            managedInputAbsPath,
            fileSizeBytes,
            createdAt: now,
            updatedAt: now
        };
    }

    async _findInboxVideoFiles(rootAbs) {
        const files = [];
        await walk(rootAbs, function onFile(fileAbs) {
            if (!isSupportedVideoFile(fileAbs)) return;
            files.push(fileAbs);
        });
        return files;
    }

    async _ensureManagedDirectories(paths) {
        const required = [
            paths.pending,
            paths.working,
            paths.encoded,
            paths.review,
            paths.rejected,
            paths.failed,
            paths.manifests,
            paths.logs,
            paths.tmp
        ];

        for (const dirAbs of required) {
            await fsp.mkdir(dirAbs, { recursive: true });
        }
    }

    _assertWithinRoot(targetAbsPath, rootAbsPath, message) {
        const resolvedTarget = path.resolve(targetAbsPath);
        const resolvedRoot = path.resolve(rootAbsPath);
        const relative = path.relative(resolvedRoot, resolvedTarget);
        if (relative.startsWith("..") || path.isAbsolute(relative)) {
            throw new Error(message);
        }
    }

    async _isStableInboxFile(fileAbsPath) {
        const first = await fsp.stat(fileAbsPath);
        if (!first.isFile()) return false;

        const ageMs = Date.now() - first.mtimeMs;
        if (ageMs < STABILITY_WINDOW_MS) {
            return false;
        }

        await sleep(SIZE_RECHECK_DELAY_MS);

        const second = await fsp.stat(fileAbsPath);
        return second.isFile()
            && first.size === second.size
            && Math.floor(first.mtimeMs) === Math.floor(second.mtimeMs);
    }
};

async function walk(rootAbs, onFile) {
    let entries = [];
    try {
        entries = await fsp.readdir(rootAbs, { withFileTypes: true });
    }
    catch (_error) {
        return;
    }

    for (const entry of entries) {
        const abs = path.join(rootAbs, entry.name);
        if (entry.isDirectory()) {
            await walk(abs, onFile);
            continue;
        }
        if (entry.isFile()) onFile(abs);
    }
}

function buildOutputFilename(filename, profileId) {
    const ext = path.extname(filename || "");
    const base = ext ? filename.slice(0, -ext.length) : String(filename || "output");
    return `${base}.${profileId}.mp4`;
}

function sanitizeSegment(value) {
    return String(value || "item").replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function copyFileIfMissing(sourceAbsPath, destinationAbsPath) {
    try {
        await fsp.access(destinationAbsPath, fs.constants.F_OK);
    }
    catch (_error) {
        await fsp.copyFile(sourceAbsPath, destinationAbsPath);
    }
}

function isSupportedVideoFile(fileAbsPath) {
    return VIDEO_EXTENSIONS.has(path.extname(String(fileAbsPath || "")).toLowerCase());
}

function getInboxRelativePath(fileAbsPath, inboxRootAbsPath) {
    const relative = path.relative(path.resolve(inboxRootAbsPath), path.resolve(fileAbsPath));
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
    return relative.split(path.sep).join("/");
}

function getInboxRelativeDir(fileAbsPath, inboxRootAbsPath) {
    const relativePath = getInboxRelativePath(fileAbsPath, inboxRootAbsPath);
    if (!relativePath) return "";
    const relativeDir = path.posix.dirname(relativePath);
    return relativeDir === "." ? "" : relativeDir;
}

function buildImportKey(inboxRelativePath) {
    return String(inboxRelativePath || "");
}

function normalizeRelativeDir(value, fallback = "") {
    const next = String(value == null ? fallback : value).trim().replace(/\\/g, "/");
    if (!next || next === ".") return "";
    return next.replace(/^\/+|\/+$/g, "");
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
