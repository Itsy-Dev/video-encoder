# Encoder Service

Standalone video encoder scaffold.

## Start

```bash
npm run start --workspace @services/encoder
```

## Migrations

```bash
npm run migrate --workspace @services/encoder
```

The server also runs pending SQL migrations automatically at startup.

## Routes

- `/`
- `/encoding/pending`
- `/encoding/setup`
- `/encoding/setup/fragment`
- `/encoding/queue`
- `/encoding/review`
- `/encoding/review/item`
- `/encoding/history`
- `/encoding/settings`
- `/api/health`
- `/api/encoding/summary`
- `/api/encoding/settings`
- `/api/encoding/scan`
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

## Notes

- MySQL config is loaded from `services/encoder/.env`.
- SQL patches live under `server/modules/database/migrations/` and are auto-applied once.
- `encoding_item`, `encoding_item_metadata`, and `app_setting` are the intended persistence layer for the encoder workflow.
- It is intended as the first extraction step toward a standalone encoder service.
- The inbox scanner looks for supported video files anywhere under `inbox/`.
- Any relative subdirectory under `inbox/` is preserved and later reused under `outbox/`.
- `ffmpeg` is now used for the actual encode step. Set `ENCODER_FFMPEG_BIN` if it is not on the default PATH.
- `ffprobe` is used to capture real source and encoded metadata. Set `ENCODER_FFPROBE_BIN` if it is not on the default PATH.
- Files placed directly in `inbox/` with no subdirectory are also valid.
- Scan ingests discovered videos into internal `pending/` storage so queueing no longer depends on the handoff inbox copy.
- Internal storage currently in use is `pending/`, `working/`, `encoded/`, and `logs/`.
- Scan skips files that still look unstable by using an inbox age window and a second size check.
- The current vertical slice is: scan -> queue -> automatic worker encode -> review -> export to outbox.
- Queueing an item now wakes a single active worker that processes one encode at a time.
- The queue UI supports moving queued items forward/backward and exposes active worker controls.
- The worker supports a post-item cooldown, continuous-run rest cycle, manual pause, manual resume, and manual stop.
- Settings persistence and API endpoints now exist, but the Settings page is still a UI-first mock and runtime hot-apply wiring is still in progress.
- Human operators should only use the handoff root: `inbox/` for imports and `outbox/` for exports.
- Encoder-managed storage should live under a separate internal root and stay out of manual workflows.
