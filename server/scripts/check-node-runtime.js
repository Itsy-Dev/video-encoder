const MIN_NODE_MAJOR = 24;
const MIN_NODE_MINOR = 15;

function main() {
    const [major, minor] = process.versions.node.split(".").map(Number);
    const hasRequiredVersion = major > MIN_NODE_MAJOR || (major === MIN_NODE_MAJOR && minor >= MIN_NODE_MINOR);

    if (!hasRequiredVersion) {
        fail(`Node ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}.0 or newer is required.`);
    }

    try {
        require("node:sqlite");
    }
    catch (error) {
        fail(`This Node build does not include node:sqlite (${error.code || error.message}).`);
    }
}

function fail(reason) {
    console.error("[RUNTIME] Unsupported Node runtime.");
    console.error(`[RUNTIME] ${reason}`);
    console.error(`[RUNTIME] Current node: ${process.version}`);
    console.error(`[RUNTIME] Current path: ${process.execPath}`);
    console.error("[RUNTIME] On macOS/Homebrew, run:");
    console.error("[RUNTIME]   export PATH=\"/opt/homebrew/opt/node@24/bin:$PATH\"");
    console.error("[RUNTIME] Then retry the npm command from this project directory.");
    process.exit(1);
}

main();
