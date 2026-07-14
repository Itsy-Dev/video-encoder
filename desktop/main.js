const path = require("path");
const { spawn } = require("child_process");

const { app, dialog, Menu, Tray, nativeImage, shell } = require("electron");

const { startEncoderServer } = require("../server/app");

const APP_NAME = "Encoder";
const APP_URL_PATH = "/encoding/pending";
const APP_ICON_ABS = path.join(__dirname, "assets", "icon.png");
const APP_TRAY_ICON_ABS = path.join(__dirname, "assets", "trayTemplate.png");

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

    isQuitting = true;
    event.preventDefault();

    try {
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
