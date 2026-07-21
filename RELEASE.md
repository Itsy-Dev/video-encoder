# Release Workflow

This project has three runtime lanes. Keep them separate so development and package testing never interrupt a stable production encode.

## Lanes

| Lane | Command/build | Port | App data | Purpose |
| --- | --- | --- | --- | --- |
| Production | `npm run dist` / `Video Encoder.app` | `4300` | `~/Library/Application Support/Video Encoder` | Real operator app and history |
| Dev | `npm run start:dev` or `npm run desktop:dev` | `14300` | `~/Library/Application Support/Video Encoder Dev` | Repo development |
| Package test | `npm run dist:package-test` / `Video Encoder Package Test.app` | `14310` | `~/Library/Application Support/Video Encoder Package Test` | Testing packaged app behavior safely |

Never launch the production packaged app while the current production encoder is active. Use the package-test app for packaged validation while production is still working.

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

4. Run the packaged app in the package-test lane if packaging changed.

```zsh
cp .env.package-test.example .env.package-test
npm run dist:package-test
```

Install or launch only `Video Encoder Package Test.app` for this step. It must use port `14310` and the `Video Encoder Package Test` Library folders.

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

## Windows Timing

Start Windows packaging after the macOS release workflow is repeatable:

1. Production app installs and runs from `/Applications`.
2. Dev and package-test lanes are isolated from production.
3. Release steps are documented and followed without terminal archaeology.
4. SQLite, runtime paths, logs, cache, bundled ffmpeg, and startup locking are stable on macOS.

Windows work should begin by validating the same abstractions on Windows app data, cache, logs, ports, SQLite path, bundled ffmpeg, installer identity, and runtime lock behavior.
