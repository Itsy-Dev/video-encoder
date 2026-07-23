# Release Workflow

This project has two runtime lanes. Keep them separate so development never interrupts a stable production encode.

## Lanes

| Lane | Command/build | Port | App data | Purpose |
| --- | --- | --- | --- | --- |
| Production | `npm run dist` or `npm run dist:win` | `4300` | OS-native app data root for the production lane | Real operator app and history |
| Dev | `npm run start:dev`, `npm run desktop:dev`, `npm run dist:dev`, or `npm run dist:dev:win` | `14300` for repo dev, `14310` for packaged dev | OS-native app data root for the dev lane | Repo and packaged development |

Never launch the production packaged app while the current production encoder is active. Use the dev lane for repo or packaged validation while production is still working.

## Before A Release

1. Confirm the repo is clean.

```zsh
git status --short --branch
```

2. Confirm Node is new enough.

```zsh
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
hash -r
node -v
```

Node must be `v24.15.0` or newer.

3. Run the app in the dev lane if code changed.

```zsh
cp .env.dev.example .env.dev
npm run desktop:dev
```

4. Run the packaged app in the dev lane if packaging changed.

```zsh
npm run dist:dev
```

Install or launch only the packaged dev build for this step. It must use port `14310` and the dev-lane OS storage roots.

## Build Production Artifacts

Build the real production app from the normal package config.

```zsh
npm run dist
ls -lh dist
```

Expected artifacts:

```text
dist/Video Encoder-<version>-arm64.dmg
dist/Video Encoder-<version>-arm64.zip
```

Windows artifacts are produced with:

```zsh
npm run dist:win
```

Expected Windows artifact:

```text
dist/Video Encoder-<version>-x64.exe
```

Do not open the production app yet if the current production encoder is still running.

## Install Production

Only do this during a production encode break.

1. Quit the currently running production app cleanly.
2. Open the generated production DMG.

```zsh
open "dist/Video Encoder-<version>-arm64.dmg"
```

3. Drag `Video Encoder.app` into `/Applications`.
4. Launch `Video Encoder.app` from `/Applications`.
5. If macOS blocks the unsigned app, right-click it and choose `Open`.

On startup, verify logs show the production lane:

```text
Runtime paths: appData=/Users/<user>/Library/Application Support/Video Encoder
Runtime paths: cache=/Users/<user>/Library/Caches/Video Encoder
Runtime paths: logs=/Users/<user>/Library/Logs/Video Encoder
```

On Windows, verify the same startup log lines point to the Windows production lane:

```text
Runtime paths: appData=C:\Users\<user>\AppData\Roaming\Video Encoder
Runtime paths: cache=C:\Users\<user>\AppData\Local\Video Encoder\Cache
Runtime paths: logs=C:\Users\<user>\AppData\Local\Video Encoder\Logs
```

The production app should use port `4300`. If another process is already using that port, the app must refuse to start before database recovery or working-file cleanup runs.

## Tagging

After the production app is built and smoke-tested:

```zsh
git status --short --branch
git tag v<version>
git push origin main
git push origin v<version>
```

If the tag already exists, stop and inspect before changing anything.

## Windows Workflow

Windows release packaging is part of the normal release flow now.

For Windows validation:

1. Build with `npm run dist:win` or `npm run dist:dev:win`.
2. Install from the generated `.exe`.
3. Confirm startup paths, runtime lock behavior, bundled ffmpeg, and SQLite location.
4. Test intake, encode, pause, resume, stop, review, export, and logs on Windows 11.
5. Confirm stopped encodes save partial outputs under `Outbox/cancelled` with a `.part` filename.
