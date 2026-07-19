const fs = require("fs");
const path = require("path");

const fsp = fs.promises;

async function readEncoderLogs(logDirAbsPath, options = {}) {
    const logDir = path.resolve(String(logDirAbsPath || ""));
    const selectedFile = normalizeFilename(options.file);
    const limit = normalizeLimit(options.limit, 200);

    await fsp.mkdir(logDir, { recursive: true });

    const files = await listLogFiles(logDir);
    const activeFile = selectedFile && files.some(file => file.name === selectedFile)
        ? selectedFile
        : (files[0] ? files[0].name : null);

    const recentEntries = activeFile
        ? await readLogEntries(path.join(logDir, activeFile), { limit })
        : [];

    return {
        logDir,
        activeFile,
        files,
        recentEntries
    };
}

async function listLogFiles(logDirAbsPath) {
    const entries = await fsp.readdir(logDirAbsPath, { withFileTypes: true }).catch(() => []);
    const files = [];

    for (const entry of entries) {
        if (!entry || !entry.isFile()) {
            continue;
        }

        const name = String(entry.name || "");
        if (!/\.log$/i.test(name)) {
            continue;
        }

        const absPath = path.join(logDirAbsPath, name);
        const stat = await fsp.stat(absPath).catch(() => null);

        files.push({
            name,
            sizeBytes: stat ? Number(stat.size || 0) : 0,
            updatedAt: stat && stat.mtime ? stat.mtime.toISOString() : null
        });
    }

    return files.sort(compareLogFiles);
}

async function readLogEntries(fileAbsPath, options = {}) {
    const limit = normalizeLimit(options.limit, 200);
    const text = await fsp.readFile(fileAbsPath, "utf8").catch(() => "");
    const lines = String(text || "")
        .split(/\r?\n/)
        .map(line => line.trimEnd());
    const entries = [];
    let current = null;

    for (const line of lines) {
        if (!line) {
            continue;
        }

        if (isLogEntryStart(line)) {
            if (current) {
                entries.push(current);
            }
            current = line;
            continue;
        }

        if (current) {
            current += `\n${line}`;
            continue;
        }

        current = line;
    }

    if (current) {
        entries.push(current);
    }

    return entries
        .slice(Math.max(0, entries.length - limit))
        .reverse()
        .map(parseLogLine);
}

function parseLogLine(line) {
    const text = String(line || "");
    const newlineIndex = text.indexOf("\n");
    const headerLine = newlineIndex >= 0 ? text.slice(0, newlineIndex) : text;
    const continuation = newlineIndex >= 0 ? text.slice(newlineIndex + 1) : "";
    const match = /^\[([^\]]+)\]\s+\[([A-Z]+)\]\s*(.*)$/.exec(headerLine);
    if (!match) {
        return {
            raw: text,
            timestamp: null,
            level: "INFO",
            message: text
        };
    }

    return {
        raw: text,
        timestamp: match[1] || null,
        level: match[2] || "INFO",
        message: continuation
            ? `${match[3] || ""}\n${continuation}`
            : (match[3] || "")
    };
}

function isLogEntryStart(line) {
    return /^\[[^\]]+\]\s+\[[A-Z]+\]\s*/.test(String(line || ""));
}

function compareLogFiles(left, right) {
    const leftTime = left.updatedAt ? new Date(left.updatedAt).getTime() : 0;
    const rightTime = right.updatedAt ? new Date(right.updatedAt).getTime() : 0;
    if (leftTime !== rightTime) {
        return rightTime - leftTime;
    }

    return String(right.name || "").localeCompare(String(left.name || ""));
}

function normalizeFilename(value) {
    const name = String(value || "").trim();
    if (!name) return "";
    if (name.includes("/") || name.includes("\\") || name.includes("..")) {
        return "";
    }
    return name;
}

function normalizeLimit(value, fallback) {
    const next = Number(value);
    if (!Number.isFinite(next) || next <= 0) {
        return fallback;
    }

    return Math.min(500, Math.round(next));
}

module.exports = {
    readEncoderLogs
};
