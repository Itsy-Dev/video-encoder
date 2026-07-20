# Video Encoder

Standalone video intake, encoding, review, and export app with a browser UI, background worker, persistent settings, and operator-focused logging.

## What It Does

The app is built around a simple operator workflow:

1. place source videos in `inbox/` or upload them through the browser
2. ingest sources into the configured Inbox
3. choose an encoding profile in Setup
4. run one active encode worker at a time
5. review the output
6. approve to `outbox/` or reject/discard the item

The current UI includes:

- Pending
- Setup
- Queue
- Review
- History
- Logs
- Settings

## Requirements

- Node.js 24.15.0 or newer

The app bundles `ffmpeg` and `ffprobe` for local and packaged runs. To override those binaries, set:

- `ENCODER_FFMPEG_BIN`
- `ENCODER_FFPROBE_BIN`

## Install

```bash
npm install
cp .env.example .env
```

## Run

Start the web server:

```bash
npm start
```

Run database migrations manually:

```bash
npm run migrate
```

Launch the Electron shell:

```bash
npm run desktop
```

The server also applies pending SQL migrations automatically at startup.

## Runtime Profiles

Real `.env*` files are local-only and ignored by git. Commit only `.env.example` templates.

Use the default/prod-style lane:

```bash
cp .env.example .env
npm start
```

Use the isolated dev lane:

```bash
cp .env.dev.example .env.dev
npm run start:dev
```

Use the isolated package-test lane from the repo:

```bash
cp .env.package-test.example .env.package-test
npm run desktop:package-test
```

Each lane should use its own `ENCODER_PORT`, `ENCODER_APP_DATA_ROOT`, `ENCODER_CACHE_ROOT`, `ENCODER_LOGS_ROOT`, Inbox, and Outbox. This allows a stable encoder to keep running while repo or packaged builds are tested separately.

To launch an unpacked packaged app against the package-test lane:

```bash
npm run pack
npm run packaged:package-test
```

## Package

Create an unpacked macOS app for local validation:

```bash
npm run pack
```

Create distributable macOS artifacts in `dist/`:

```bash
npm run dist
```

Install from the generated DMG by dragging `Video Encoder.app` into `Applications`. This local build is unsigned until Apple Developer signing/notarization is configured, so macOS may require right-clicking the app and choosing **Open** the first time.

The packaged app keeps user data outside the app bundle in the macOS Library locations listed below. Replacing the app during an update should not remove history, settings, cache, logs, Inbox, or Outbox files.

## Runtime Layout

The app uses two operator-facing handoff folders plus OS-managed app storage.

- `inbox/`: operator import location
- `outbox/`: completed output location
- `~/Library/Application Support/Video Encoder`: persistent app-managed state
- `~/Library/Caches/Video Encoder/uploads`: browser upload temp storage
- `~/Library/Caches/Video Encoder/working`: active encode working files
- `~/Library/Logs/Video Encoder`: persistent logs

Operators should treat only Inbox and Outbox as manual workflow folders. Cache and log storage is app-managed.

## Configuration

Each checkout reads its own local `.env`.

Important environment variables:

- `ENCODER_PORT`
- `ENCODER_APP_DATA_ROOT`
- `ENCODER_CACHE_ROOT`
- `ENCODER_LOGS_ROOT`
- `ENCODER_DEFAULT_INBOX_ROOT`
- `ENCODER_DEFAULT_OUTBOX_ROOT`
- `ENCODER_FFMPEG_BIN` optional binary override
- `ENCODER_FFPROBE_BIN` optional binary override

Path values may be:

- absolute paths
- repo-relative paths
- `~/...` paths

Inbox/outbox precedence is:

1. database setting
2. `.env` default
3. hardcoded Movies fallback

Once settings exist, `storage.inboxRoot` and `storage.outboxRoot` in the database become the runtime source of truth.

The app stores its SQLite database at `~/Library/Application Support/Video Encoder/encoder.sqlite`.

## Core Workflow

### Intake

- scans discover supported video files anywhere under `inbox/`
- files directly in `inbox/` are valid
- nested inbox subdirectories are preserved and later reused under `outbox/`
- browser uploads can also ingest directly into pending when enabled in Settings
- scans skip files that still look unstable by using an age window and a second size check

### Setup

- profile selection is based on real probed source metadata
- HD/QHD downscale profiles are disabled when they would not actually reduce the current source for that aspect family
- `Archive HD` remains available even when the source is already at or below HD
- Setup surfaces compatibility guidance such as:
  - `Copy Container Eligible`
  - `Browser Incompatible`

### Queue And Worker

- queueing an item wakes a single active worker
- only one encode runs at a time
- queued items can be moved up, down, front, or back
- the worker supports:
  - post-item cooldown
  - continuous-run rest cycle
  - manual pause
  - manual resume
  - manual stop

### Review And Export

- completed items move to Review
- operators can approve or reject outputs
- approval confirms the existing Outbox output
- reject moves the output to `Outbox/rejected` and keeps the source receipt available for requeue
- previously rejected items can be rediscovered from `inbox/` and returned to pending setup when scanned again

### Logs

- the Logs page reads the same app log files written under `~/Library/Logs/Video Encoder`
- multiline errors are grouped as a single log item
- log entries display both severity and subsystem badges

## Persistence

The main persistence layer is:

- `encoding_item`
- `encoding_item_metadata`
- `encoding_outcome`
- `app_setting`

`encoding_item_metadata` stores current source/output metadata for active items.

`encoding_outcome` stores per-attempt encode receipts, timing, and historical output metrics.

## Web Routes

- `/`
- `/encoding/pending`
- `/encoding/setup`
- `/encoding/setup/fragment`
- `/encoding/queue`
- `/encoding/review`
- `/encoding/review/item`
- `/encoding/history`
- `/encoding/logs`
- `/encoding/settings`

## API Routes

- `/api/health`
- `/api/encoding/summary`
- `/api/encoding/settings`
- `/api/encoding/logs`
- `/api/encoding/scan`
- `/api/encoding/pending/preflight`
- `/api/encoding/pending/import`
- `/api/encoding/pending/import/:jobId`
- `/api/encoding/items/:id/queue`
- `/api/encoding/items/:id/complete`
- `/api/encoding/items/:id/approve`
- `/api/encoding/items/:id/reject`
- `/api/encoding/items/:id/discard`
- `/api/encoding/items/:id/unqueue`
- `/api/encoding/items/:id/queue/move-up`
- `/api/encoding/items/:id/queue/move-down`
- `/api/encoding/items/:id/queue/move-front`
- `/api/encoding/items/:id/queue/move-back`
- `/api/encoding/items/:id/source`
- `/api/encoding/items/:id/encoded`
- `/api/encoding/control/pause`
- `/api/encoding/control/resume`
- `/api/encoding/control/stop`
- `/api/encoding/control/wake`

## Current Scope

This version is designed around the encoding workflow itself:

- ingest
- setup
- queue
- encode
- review
- export
- logs
- settings

Intentionally not built out yet:

- external player integration
- remote/hosted-safe desktop file opening
- multi-worker distributed encoding

## Notes

- runtime config is loaded from the local checkout's `.env`
- SQLite data is stored under the OS app data location
- SQL migrations live under `server/modules/database/migrations/`
- the app uses real `ffmpeg` and `ffprobe`, not mock encoding
- browser file intake is available but disabled by default
- watch folders are planned in Settings, but discovery currently uses the primary inbox folder
