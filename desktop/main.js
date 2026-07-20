const path = require("path");
const { spawn } = require("child_process");

const { app, dialog, Menu, Tray, nativeImage, shell } = require("electron");

const APP_NAME = process.env.ENCODER_APP_NAME || app.getName() || "Video Encoder";
const APP_URL_PATH = "/encoding/pending";
const APP_ICON_ABS = path.join(__dirname, "assets", "icon.png");
const APP_TRAY_ICON_ABS = path.join(__dirname, "assets", "trayTemplate.png");

applyPackagedRuntimeDefaults(APP_NAME);

const { startEncoderServer } = require("../server/app");

let encoderServer = null;
let tray = null;
let isQuitting = false;

app.setName(APP_NAME);

if (!app.requestSingleInstanceLock()) {
    app.quit();
}

app.on("second-instance", function onSecondInstance() {
    openEncoderUi().catch(() => {});
});

app.whenReady().then(async function onReady() {
    setDockIcon();
    setApplicationMenu();
    createTray();

    try {
        encoderServer = await startEncoderServer();
        await openEncoderUi();
    }
    catch (error) {
        dialog.showErrorBox("Encoder failed to start", error && error.message ? error.message : String(error));
        app.quit();
    }
});

app.on("activate", function onActivate() {
    openEncoderUi().catch(() => {});
});

app.on("window-all-closed", function onWindowAllClosed() {
    // Intentionally keep the background app alive even when browser windows close.
});

app.on("before-quit", async function onBeforeQuit(event) {
    if (isQuitting) {
        return;
    }

    event.preventDefault();
    isQuitting = true;

    try {
        const quitApproved = await confirmQuitIfEncodingActive();
        if (!quitApproved) {
            isQuitting = false;
            return;
        }

        if (encoderServer) {
            await encoderServer.shutdown();
            encoderServer = null;
        }
    }
    finally {
        app.quit();
    }
});

async function openEncoderUi() {
    if (!encoderServer) {
        return;
    }

    const targetUrl = `${encoderServer.address}${APP_URL_PATH}`;

    if (process.platform === "darwin") {
        const chromeOpened = await tryOpenChrome(targetUrl);
        if (chromeOpened) {
            return;
        }
    }

    await shell.openExternal(targetUrl);
}

async function confirmQuitIfEncodingActive() {
    const summary = await fetchEncoderSummary();
    if (!summary || !summary.worker || !summary.worker.activeItemId) {
        return true;
    }

    const activeItem = Array.isArray(summary.items)
        ? summary.items.find(item => item.id === summary.worker.activeItemId)
        : null;
    const activeStatus = String(activeItem && activeItem.status || "").toLowerCase();

    if (!["encoding", "paused"].includes(activeStatus)) {
        return true;
    }

    const filename = activeItem && activeItem.originalFilename
        ? activeItem.originalFilename
        : "current encode";
    const statusLabel = activeStatus === "paused" ? "paused" : "active";

    const result = await dialog.showMessageBox({
        type: "warning",
        buttons: ["Cancel", `Quit ${APP_NAME}`],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
        title: `Quit ${APP_NAME}?`,
        message: `An ${statusLabel} encode is still running.`,
        detail: `Quitting now will stop "${filename}" and shut down the encoder server.`
    });

    return result.response === 1;
}

async function fetchEncoderSummary() {
    if (!encoderServer) {
        return null;
    }

    try {
        const response = await fetch(`${encoderServer.address}/api/encoding/summary`);
        if (!response.ok) {
            return null;
        }

        return response.json();
    }
    catch (_error) {
        return null;
    }
}

function tryOpenChrome(targetUrl) {
    return new Promise(resolve => {
        const child = spawn("open", ["-a", "Google Chrome", targetUrl], {
            stdio: "ignore"
        });

        child.once("error", function onError() {
            resolve(false);
        });

        child.once("exit", function onExit(code) {
            resolve(code === 0);
        });
    });
}

function setApplicationMenu() {
    const template = [
        {
            label: APP_NAME,
            submenu: [
                {
                    label: "Open Encoder UI",
                    click: function click() {
                        openEncoderUi().catch(() => {});
                    }
                },
                { type: "separator" },
                {
                    label: `Quit ${APP_NAME}`,
                    role: "quit"
                }
            ]
        }
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createTray() {
    const trayIcon = nativeImage.createFromPath(APP_TRAY_ICON_ABS);
    if (trayIcon.isEmpty()) {
        return;
    }

    tray = new Tray(trayIcon);
    tray.setToolTip(APP_NAME);
    tray.setContextMenu(Menu.buildFromTemplate([
        {
            label: "Open Encoder UI",
            click: function click() {
                openEncoderUi().catch(() => {});
            }
        },
        { type: "separator" },
        {
            label: `Quit ${APP_NAME}`,
            click: function click() {
                app.quit();
            }
        }
    ]));

    tray.on("click", function onClick() {
        openEncoderUi().catch(() => {});
    });
}

function setDockIcon() {
    if (process.platform !== "darwin") {
        return;
    }

    const image = nativeImage.createFromPath(APP_ICON_ABS);
    if (!image.isEmpty()) {
        app.dock.setIcon(image);
    }
}

function applyPackagedRuntimeDefaults(appName) {
    const profile = process.env.ENCODER_DISTRIBUTION_PROFILE || (
        String(appName || "").toLowerCase().includes("package test") ? "package-test" : ""
    );

    if (profile !== "package-test") {
        return;
    }

    setEnvDefault("ENCODER_PORT", "14310");
    setEnvDefault("ENCODER_APP_DATA_ROOT", "~/Library/Application Support/Video Encoder Package Test");
    setEnvDefault("ENCODER_CACHE_ROOT", "~/Library/Caches/Video Encoder Package Test");
    setEnvDefault("ENCODER_LOGS_ROOT", "~/Library/Logs/Video Encoder Package Test");
    setEnvDefault("ENCODER_DEFAULT_INBOX_ROOT", "~/Movies/Video Encoder Package Test Inbox");
    setEnvDefault("ENCODER_DEFAULT_OUTBOX_ROOT", "~/Movies/Video Encoder Package Test Outbox");
}

function setEnvDefault(key, value) {
    if (!process.env[key]) {
        process.env[key] = value;
    }
}
