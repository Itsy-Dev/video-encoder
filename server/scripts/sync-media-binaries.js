const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const https = require("https");
const zlib = require("zlib");

const projectRoot = path.resolve(__dirname, "..", "..");
const vendorRoot = path.join(projectRoot, "vendor", "ffmpeg");
const ffmpegStaticPkg = require("ffmpeg-static/package.json");

async function main() {
    await syncMacosBinaries();
    await syncWindowsBinaries();
    console.log(`[MEDIA SYNC] Vendor media binaries are ready under ${vendorRoot}`);
}

async function syncMacosBinaries() {
    const macRoot = path.join(vendorRoot, "macos");
    await fsp.mkdir(macRoot, { recursive: true });

    const ffmpegSource = require("ffmpeg-static");
    const ffprobeSource = require("ffprobe-static").path;

    if (!ffmpegSource || !ffprobeSource) {
        throw new Error("Unable to resolve macOS ffmpeg/ffprobe binaries from installed dependencies.");
    }

    await copyBinary(ffmpegSource, path.join(macRoot, "ffmpeg"));
    await copyBinary(ffprobeSource, path.join(macRoot, "ffprobe"));
}

async function syncWindowsBinaries() {
    const windowsRoot = path.join(vendorRoot, "windows");
    await fsp.mkdir(windowsRoot, { recursive: true });

    const ffprobeSource = path.join(projectRoot, "node_modules", "ffprobe-static", "bin", "win32", "x64", "ffprobe.exe");
    await copyBinary(ffprobeSource, path.join(windowsRoot, "ffprobe.exe"));

    const ffmpegTarget = path.join(windowsRoot, "ffmpeg.exe");
    if (await pathExists(ffmpegTarget)) {
        return;
    }

    const overrideSource = String(process.env.ENCODER_VENDOR_WINDOWS_FFMPEG || "").trim();
    if (overrideSource) {
        await copyBinary(overrideSource, ffmpegTarget);
        return;
    }

    await downloadWindowsFfmpeg(ffmpegTarget);
}

async function downloadWindowsFfmpeg(destinationPath) {
    const release = ffmpegStaticPkg[ffmpegStaticPkg.name]["binary-release-tag"];
    const baseUrl = process.env.FFMPEG_BINARIES_URL || "https://github.com/eugeneware/ffmpeg-static/releases/download";
    const downloadUrl = `${baseUrl}/${release}/ffmpeg-win32-x64.gz`;

    console.log(`[MEDIA SYNC] Downloading Windows ffmpeg from ${downloadUrl}`);

    await new Promise((resolve, reject) => {
        const request = https.get(downloadUrl, response => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                response.resume();
                downloadRedirect(response.headers.location, destinationPath).then(resolve, reject);
                return;
            }

            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download Windows ffmpeg: ${response.statusCode}`));
                response.resume();
                return;
            }

            const gunzip = zlib.createGunzip();
            const output = fs.createWriteStream(destinationPath, { mode: 0o755 });

            response.on("error", reject);
            gunzip.on("error", reject);
            output.on("error", reject);
            output.on("finish", resolve);

            response.pipe(gunzip).pipe(output);
        });

        request.on("error", reject);
    });
}

async function downloadRedirect(url, destinationPath) {
    await new Promise((resolve, reject) => {
        const request = https.get(url, response => {
            if (response.statusCode !== 200) {
                reject(new Error(`Redirected Windows ffmpeg download failed: ${response.statusCode}`));
                response.resume();
                return;
            }

            const gunzip = zlib.createGunzip();
            const output = fs.createWriteStream(destinationPath, { mode: 0o755 });

            response.on("error", reject);
            gunzip.on("error", reject);
            output.on("error", reject);
            output.on("finish", resolve);

            response.pipe(gunzip).pipe(output);
        });

        request.on("error", reject);
    });
}

async function copyBinary(sourcePath, destinationPath) {
    if (!sourcePath || !fs.existsSync(sourcePath)) {
        throw new Error(`Missing source binary: ${sourcePath}`);
    }

    await fsp.mkdir(path.dirname(destinationPath), { recursive: true });
    await fsp.copyFile(sourcePath, destinationPath);
    await fsp.chmod(destinationPath, 0o755).catch(() => {});
    console.log(`[MEDIA SYNC] Copied ${path.basename(destinationPath)} -> ${destinationPath}`);
}

async function pathExists(targetPath) {
    try {
        await fsp.access(targetPath, fs.constants.F_OK);
        return true;
    }
    catch (_error) {
        return false;
    }
}

main().catch(error => {
    console.error("[MEDIA SYNC] Failed to sync vendor media binaries:", error);
    process.exit(1);
});
