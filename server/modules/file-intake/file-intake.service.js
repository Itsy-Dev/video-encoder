const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");

module.exports = class FileIntakeService {
    constructor({ tempRootAbsPath, staleTempFileMs = 2 * 60 * 60 * 1000, maxCompletedJobs = 100 } = {}) {
        if (!tempRootAbsPath) {
            throw new Error("FileIntakeService requires tempRootAbsPath");
        }

        this.tempRootAbsPath = path.resolve(tempRootAbsPath);
        this.staleTempFileMs = Math.max(60 * 1000, Number(staleTempFileMs) || 0);
        this.maxCompletedJobs = Math.max(10, Number(maxCompletedJobs) || 0);
        this.processors = new Map();
        this.jobs = new Map();
        this.ready = this._initialize();
    }

    applySettings({ staleTempFileMs = null } = {}) {
        if (staleTempFileMs != null) {
            this.staleTempFileMs = Math.max(60 * 1000, Number(staleTempFileMs) || 0);
        }
    }

    registerProcessor(kind, processor) {
        const key = String(kind || "").trim();
        if (!key) {
            throw new Error("FileIntakeService.registerProcessor requires a kind");
        }

        if (typeof processor !== "function") {
            throw new Error("FileIntakeService.registerProcessor requires a processor function");
        }

        this.processors.set(key, processor);
    }

    async enqueue({ kind, files, metadata = {} } = {}) {
        await this.ready;

        const key = String(kind || "").trim();
        const processor = this.processors.get(key);
        if (!processor) {
            throw new Error(`No file intake processor registered for kind "${key}"`);
        }

        const stagedFiles = Array.isArray(files) ? files.filter(Boolean) : [];
        const job = createJob({
            kind: key,
            metadata,
            stagedFiles
        });

        this.jobs.set(job.id, job);

        setImmediate(() => {
            this._runJob(job, processor, stagedFiles, metadata).catch(error => {
                console.error("[encoder] File intake job crashed", error);
            });
        });

        return serializeJob(job);
    }

    getJob(jobId) {
        const job = this.jobs.get(String(jobId || "").trim());
        return job ? serializeJob(job) : null;
    }

    async cleanupStagedFiles(files) {
        const stagedFiles = Array.isArray(files) ? files.filter(Boolean) : [];

        for (const file of stagedFiles) {
            const filePath = file && file.path ? String(file.path) : "";
            if (!filePath) continue;
            await removeIfExists(filePath);
        }
    }

    async cleanupStaleTempFiles() {
        await this.ready;
        await this._cleanupStaleTempFilesInternal();
    }

    async _initialize() {
        await fsp.mkdir(this.tempRootAbsPath, { recursive: true });
        await this._cleanupStaleTempFilesInternal();
    }

    async _cleanupStaleTempFilesInternal() {
        const cutoffMs = Date.now() - this.staleTempFileMs;
        const entries = await listFiles(this.tempRootAbsPath);

        for (const entryAbsPath of entries) {
            try {
                const stat = await fsp.stat(entryAbsPath);
                if (stat.mtimeMs <= cutoffMs) {
                    await removeIfExists(entryAbsPath);
                }
            }
            catch (_error) {
                continue;
            }
        }
    }

    async _runJob(job, processor, files, metadata) {
        job.status = "processing";
        job.phase = "importing";
        job.startedAt = new Date().toISOString();
        job.updatedAt = job.startedAt;

        try {
            const result = await processor({
                files,
                metadata,
                updateProgress: patch => {
                    applyJobPatch(job, patch);
                    job.updatedAt = new Date().toISOString();
                }
            });

            const normalizedResult = normalizeProcessorResult(result);
            applyJobPatch(job, normalizedResult);
            job.status = "completed";
            job.phase = "completed";
            job.finishedAt = new Date().toISOString();
            job.updatedAt = job.finishedAt;
        }
        catch (error) {
            job.status = "failed";
            job.phase = "failed";
            job.error = error && error.message ? error.message : "File intake failed";
            job.finishedAt = new Date().toISOString();
            job.updatedAt = job.finishedAt;
            console.error(`[encoder] File intake job failed. id=${job.id} kind=${job.kind}`, error);
        }
        finally {
            await this.cleanupStagedFiles(files).catch(() => {});
            this._pruneCompletedJobs();
        }
    }

    _pruneCompletedJobs() {
        const completed = Array.from(this.jobs.values())
            .filter(job => job.status === "completed" || job.status === "failed")
            .sort((left, right) => new Date(left.updatedAt || 0).getTime() - new Date(right.updatedAt || 0).getTime());

        while (completed.length > this.maxCompletedJobs) {
            const oldest = completed.shift();
            if (!oldest) break;
            this.jobs.delete(oldest.id);
        }
    }
};

function createJob({ kind, metadata, stagedFiles }) {
    const now = new Date().toISOString();

    return {
        id: `fi_${crypto.randomBytes(8).toString("hex")}`,
        kind,
        status: "queued",
        phase: "queued",
        error: null,
        createdAt: now,
        startedAt: null,
        finishedAt: null,
        updatedAt: now,
        totalFiles: stagedFiles.length,
        processedFiles: 0,
        importedFiles: 0,
        duplicateFiles: 0,
        invalidFiles: 0,
        metadata: cloneValue(metadata)
    };
}

function serializeJob(job) {
    return cloneValue(job);
}

function applyJobPatch(job, patch) {
    if (!patch || typeof patch !== "object") {
        return;
    }

    for (const [key, value] of Object.entries(patch)) {
        if (!(key in job)) continue;
        job[key] = value;
    }
}

function normalizeProcessorResult(result) {
    const source = result && typeof result === "object" ? result : {};

    return {
        processedFiles: safeCount(source.processedFiles),
        importedFiles: safeCount(source.importedFiles),
        duplicateFiles: safeCount(source.duplicateFiles),
        invalidFiles: safeCount(source.invalidFiles)
    };
}

async function listFiles(rootAbsPath) {
    const files = [];
    let entries = [];

    try {
        entries = await fsp.readdir(rootAbsPath, { withFileTypes: true });
    }
    catch (_error) {
        return files;
    }

    for (const entry of entries) {
        const entryAbsPath = path.join(rootAbsPath, entry.name);
        if (entry.isDirectory()) {
            const nested = await listFiles(entryAbsPath);
            files.push(...nested);
            continue;
        }

        if (entry.isFile()) {
            files.push(entryAbsPath);
        }
    }

    return files;
}

function safeCount(value) {
    const next = Number(value);
    return Number.isFinite(next) && next >= 0 ? Math.round(next) : 0;
}

function cloneValue(value) {
    return JSON.parse(JSON.stringify(value == null ? null : value));
}

async function removeIfExists(targetAbsPath) {
    try {
        await fsp.rm(targetAbsPath, { force: true, recursive: true });
    }
    catch (_error) {
        return;
    }
}
