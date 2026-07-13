# Encoder Service

Standalone video encoder scaffold.

## Start

```bash
npm run start --workspace @services/encoder
```

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

## Notes

- This scaffold currently uses an in-memory repository.
- It is intended as the first extraction step from `services/main`.
- The inbox scanner looks for `*.request.json` manifests under the encoder inbox root.
- Scan ingests the request package into internal `pending/` storage so queueing no longer depends on the handoff inbox copy.
- Human operators should only use the handoff root: `inbox/` for imports and `outbox/` for exports.
- Encoder-managed storage should live under a separate internal root and stay out of manual workflows.
