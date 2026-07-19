const fs = require("fs");
const path = require("path");
const util = require("util");

let initialized = false;
let activeLogDir = null;
let originalConsole = null;

function initFileLogger(logDirAbsPath) {
    if (initialized) {
        return;
    }

    activeLogDir = path.resolve(logDirAbsPath);
    fs.mkdirSync(activeLogDir, { recursive: true });

    originalConsole = {
        log: console.log.bind(console),
        info: console.info.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console)
    };

    console.log = createPatchedConsoleMethod("INFO", originalConsole.log);
    console.info = createPatchedConsoleMethod("INFO", originalConsole.info);
    console.warn = createPatchedConsoleMethod("WARN", originalConsole.warn);
    console.error = createPatchedConsoleMethod("ERROR", originalConsole.error);

    initialized = true;
    console.log("[LOGGING] File logger initialized", activeLogDir);
}

function createPatchedConsoleMethod(level, originalMethod) {
    return function patchedConsoleMethod(...args) {
        originalMethod(...args);
        writeLogLine(level, args);
    };
}

function writeLogLine(level, args) {
    if (!activeLogDir) {
        return;
    }

    const timestamp = new Date().toISOString();
    const filename = `encoder-${timestamp.slice(0, 10)}.log`;
    const line = `[${timestamp}] [${level}] ${formatArgs(args)}\n`;
    const dailyLogAbsPath = path.join(activeLogDir, filename);

    fs.appendFile(dailyLogAbsPath, line, function noop() {});

    if (level === "ERROR") {
        fs.appendFile(path.join(activeLogDir, "error.log"), line, function noop() {});
    }
}

function formatArgs(args) {
    return stripAnsi(
        args.map(function formatArg(arg) {
        if (arg instanceof Error) {
            return arg.stack || `${arg.name}: ${arg.message}`;
        }

        if (typeof arg === "string") {
            return arg;
        }

        return util.inspect(arg, {
            depth: 6,
            breakLength: Infinity,
            compact: true
        });
        }).join(" ")
    );
}

function stripAnsi(value) {
    return String(value || "").replace(/\u001b\[[0-9;]*m/g, "");
}

module.exports = {
    initFileLogger
};
