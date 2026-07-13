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

- `/encoding/pending`
- `/encoding/setup`
- `/encoding/queue`
- `/encoding/review`
- `/encoding/history`
- `/encoding/settings`
- `/api/health`
- `/api/encoding/summary`
- `/api/encoding/scan`
- `/api/encoding/items/:id/queue`
- `/api/encoding/items/:id/complete`
- `/api/encoding/items/:id/approve`
- `/api/encoding/items/:id/reject`

## Notes

- This scaffold currently uses an in-memory repository.
- MySQL config is loaded from `services/encoder/.env`.
- SQL patches live under `server/modules/database/migrations/` and are auto-applied once.
- `encoding_item` and `encoding_item_metadata` are now the intended persistence layer for the encoder workflow.
- It is intended as the first extraction step toward a standalone encoder service.
- The inbox scanner looks for supported video files anywhere under `inbox/`.
- Any relative subdirectory under `inbox/` is preserved and later reused under `outbox/`.
- `ffprobe` is now used to capture real source and encoded metadata. Set `ENCODER_FFPROBE_BIN` if it is not on the default PATH.
- Files placed directly in `inbox/` with no subdirectory are also valid.
- Scan ingests discovered videos into internal `pending/` storage so queueing no longer depends on the handoff inbox copy.
- Scan skips files that still look unstable by using an inbox age window and a second size check.
- The current vertical slice is: scan -> queue -> complete -> review -> export to outbox.
- `complete` currently creates a placeholder encoded artifact in internal `encoded/` storage until the real worker is wired in.
- Human operators should only use the handoff root: `inbox/` for imports and `outbox/` for exports.
- Encoder-managed storage should live under a separate internal root and stay out of manual workflows.
