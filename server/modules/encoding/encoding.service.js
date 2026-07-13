const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

const profiles = require("./encoding-profiles");
const repository = require("./encoding.repository");
const { getEncoderPaths } = require("../filesystem/handoff-paths");
const { loadRequestManifest, isRequestManifestFileName } = require("../filesystem/handoff-manifest");

const PENDING_STATES = new Set(["discovered", "pending_setup"]);
const REVIEW_STATES = new Set(["completed", "review"]);
const HISTORY_STATES = new Set(["approved", "rejected", "failed", "exported", "cancelled"]);

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
        const manifests = await this._findManifestFiles(paths.inbox);
        const results = {
            discovered: 0,
            duplicates: 0,
            invalid: 0,
            manifests: manifests.length
        };

        for (const manifestAbsPath of manifests) {
            try {
                const manifest = await loadRequestManifest(manifestAbsPath);
                if (!manifest.requestId) {
                    results.invalid += 1;
                    continue;
                }

                const existing = repository.findByRequestId(manifest.requestId);
                if (existing) {
                    results.duplicates += 1;
                    continue;
                }

                const item = repository.upsert(this._buildDiscoveredItem(manifest, manifestAbsPath));
                if (item) results.discovered += 1;
            }
            catch (_error) {
                results.invalid += 1;
            }
        }

        return results;
    }

    async queueItem(id, { profileId, sourceClass } = {}) {
        const item = this._requireItem(id);
        const selectedProfileId = profiles.some(profile => profile.id === profileId)
            ? profileId
            : (item.requestedProfileId || "browser_compatibility");

        return repository.upsert({
            ...item,
            profileId: selectedProfileId,
            sourceClass: sourceClass || item.sourceClass,
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

    _buildDiscoveredItem(manifest, manifestAbsPath) {
        const now = new Date().toISOString();
        const sourceClass = normalizeSourceClass(manifest.sourceClass);
        const inputAbsPath = path.join(path.dirname(manifestAbsPath), manifest.handoffFilename || manifest.originalFilename || "unknown");

        return {
            id: manifest.requestId,
            requestId: manifest.requestId,
            status: "pending_setup",
            sourceSystem: manifest.sourceSystem || "main",
            sourceClass,
            requestedAt: manifest.requestedAt || now,
            requestedBy: manifest.requestedBy || null,
            originalFilename: manifest.originalFilename || manifest.handoffFilename || path.basename(inputAbsPath),
            requestedProfileId: manifest.requestedProfileId || "browser_compatibility",
            videoUuid: manifest.videoUuid || null,
            entityType: manifest.entityType || "video",
            entityId: manifest.entityId || null,
            manifestAbsPath,
            inputAbsPath,
            createdAt: now,
            updatedAt: now
        };
    }

    async _findManifestFiles(rootAbs) {
        const files = [];
        await walk(rootAbs, function onFile(fileAbs) {
            if (isRequestManifestFileName(fileAbs)) files.push(fileAbs);
        });
        return files;
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

function normalizeSourceClass(value) {
    const next = String(value || "").toLowerCase();
    return ["library", "dev", "unlisted"].includes(next) ? next : "unlisted";
}

function buildOutputFilename(filename, profileId) {
    const ext = path.extname(filename || "");
    const base = ext ? filename.slice(0, -ext.length) : String(filename || "output");
    return `${base}.${profileId}.mp4`;
}
