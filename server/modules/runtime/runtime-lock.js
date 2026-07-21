const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

const LOCK_FILENAME = "encoder-runtime.lock";

async function acquireRuntimeLock(appDataRootAbsPath) {
    const lockPath = path.join(path.resolve(appDataRootAbsPath), LOCK_FILENAME);
    await fsp.mkdir(path.dirname(lockPath), { recursive: true });

    await removeStaleLock(lockPath);

    let fd;
    try {
        fd = await fsp.open(lockPath, "wx");
    }
    catch (error) {
        if (error && error.code === "EEXIST") {
            const details = await readLockDetails(lockPath);
            throw createLockError(lockPath, details);
        }
        throw error;
    }

    const details = {
        pid: process.pid,
        execPath: process.execPath,
        cwd: process.cwd(),
        startedAt: new Date().toISOString()
    };

    await fd.writeFile(`${JSON.stringify(details, null, 2)}\n`);

    let released = false;
    return {
        path: lockPath,
        async release() {
            if (released) return;
            released = true;

            await fd.close().catch(() => {});
            await fsp.unlink(lockPath).catch(() => {});
        }
    };
}

async function removeStaleLock(lockPath) {
    const details = await readLockDetails(lockPath);
    if (!details || !details.pid || isPidRunning(details.pid)) {
        return;
    }

    await fsp.unlink(lockPath).catch(() => {});
}

async function readLockDetails(lockPath) {
    const raw = await fsp.readFile(lockPath, "utf8").catch(error => {
        if (error && error.code === "ENOENT") return null;
        throw error;
    });

    if (!raw) return null;

    try {
        return JSON.parse(raw);
    }
    catch (_error) {
        return { raw };
    }
}

function isPidRunning(pid) {
    const nextPid = Number(pid);
    if (!Number.isInteger(nextPid) || nextPid <= 0) {
        return false;
    }

    try {
        process.kill(nextPid, 0);
        return true;
    }
    catch (error) {
        return error && error.code === "EPERM";
    }
}

function createLockError(lockPath, details) {
    const owner = details && details.pid
        ? `pid=${details.pid}${details.startedAt ? ` startedAt=${details.startedAt}` : ""}`
        : "unknown owner";
    const error = new Error(`Another Video Encoder process already owns this runtime data directory. lock=${lockPath} ${owner}`);
    error.code = "ENCODER_RUNTIME_LOCKED";
    error.lockPath = lockPath;
    error.lockDetails = details || null;
    return error;
}

module.exports = {
    LOCK_FILENAME,
    acquireRuntimeLock
};
