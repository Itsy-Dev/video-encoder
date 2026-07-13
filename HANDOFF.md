# Video Encoder Split

## Goal

Move video encoding out of `services/main` into a standalone Node.js application at `services/encoder`.

After the split:

- `services/main` can be one caller, but the encoder should not depend on `main`-specific metadata.
- `services/encoder` owns the inbox, queue, worker, review flow, UI, and outbound return handoff.
- Manual file movement remains part of the workflow between the two systems.

This document defines the boundary, file contract, lifecycle, and migration target so we can build the split without mixing responsibilities back together.

## Why This Split Makes Sense

Today, `services/main` still owns all of the following:

- Encoding request API
- Encoding admin UI
- Scan and queue logic
- Worker orchestration
- Review and commit/reject flow
- Returned encode import logic

That logic currently lives in files such as:

- `services/main/server/api/encoding.js`
- `services/main/server/jobs/encoding/VideoEncodingJob.js`
- `services/main/server/jobs/encoding/VideoEncodingScanJob.js`
- `services/main/server/services/EncodingService.js`
- `services/main/server/services/VideoEncodingFinalizeService.js`
- `services/main/server/services/VideoEncodingReturnedScanService.js`
- `services/main/server/services/VideoEncodingTransferService.js`
- `services/main/server/delegates/VideoEncodingDelegate.js`
- `services/main/public/admin/encoding/*`

If the encoder is meant to be a real standalone service, all encoder-specific state and workflow should move with it. `main` should stop owning the worker and review lifecycle.

## System Boundary

### `services/encoder` owns

- Monitoring the encoder inbox
- Registering discovered files as pending work
- UI for setup, queue, active work, review, and history
- Encoding profiles and profile validation
- Queue state and worker execution
- Progress reporting
- Completed output storage
- Review approve/reject workflow
- Encoder outbox generation for manually returning approved files
- Operational cleanup and retention rules

### Manual step between systems

- A person drops source videos into the encoder inbox
- A person later moves approved encoded files from encoder outbox to whatever calling system needs them

## Operating Model

### 1. File placed into encoder inbox

A human places a source video anywhere under `inbox/`.

Examples:

- `inbox/video.mp4`
- `inbox/library/video.mp4`
- `inbox/dev/client-a/video.mp4`
- `inbox/unlisted/tmp/test/video.mov`

The encoder preserves the file's relative subdirectory under `inbox/` and later reuses that same relative subdirectory under `outbox/`.

### 2. Encoder discovers pending files

The encoder scans its inbox, waits for stable video files, and ingests them into encoder-managed pending storage.

At this stage the file is not yet queued for work. It has been copied into encoder-managed storage and is awaiting setup.

### 3. User selects settings and queues the file

An encoder user chooses:

- encoding profile
- destination source class
- optional overrides
- optional notes

The encoder creates a queued job and moves the request into managed encoder state.

### 4. Worker processes the encoding

The encoder worker performs the job and writes encoded output into encoder-managed storage.

### 5. User reviews the output

The encoder UI shows source vs encoded details for approval.

### 6. Confirm or reject

If confirmed:

- the encoder moves or copies the approved encoded output into encoder outbox
- the outbox path matches the relative subdirectory the file came from under inbox, unless a user intentionally changes it during setup

If rejected:

- the encoder marks the job rejected
- the encoded artifact is retained according to retention rules
- the file may optionally be re-queued with different settings

## Directory Contract

Recommended layout with two separate roots:

```text
encoder-handoff-root/
  inbox/
    ...
  outbox/
    ...

encoder-internal-root/
  pending/
  working/
  encoded/
  review/
  rejected/
  failed/
  manifests/
  logs/
  tmp/
```

### Notes

- `inbox/` is the manual drop location.
- `outbox/` is the only manual export location.
- any relative subdirectory under `inbox/` should be preserved under `outbox/`
- `encoder-handoff-root/` is the only directory tree that should be touched by human import/export workflows.
- `encoder-internal-root/` is service-owned storage and should not be used for manual movement.
- `pending/` is encoder-managed state for discovered but not yet queued items.
- `working/` contains transient job files.
- `encoded/` contains completed raw outputs before human review approval.
- `review/` contains files staged for approval workflows when needed.
- `rejected/` contains outputs that failed human review.
- `failed/` contains failed job artifacts and diagnostic data.

## Safety Rule

Manual operators should only ever interact with:

- encoder inbox
- encoder outbox

They should never browse or move files from:

- pending
- working
- encoded
- review
- rejected
- failed
- manifests
- logs
- tmp

Keeping handoff storage separate from internal storage reduces the chance of accidental imports, accidental exports, or removal of in-progress encoder artifacts.

## Dumb Inbox Contract

The encoder should assume as little as possible:

- a supported video file appears anywhere under `inbox/`
- the file's relative subdirectory under `inbox/` becomes the default routing path
- the user chooses the encode profile in the encoder UI
- after approval, the output is written to the matching relative path under `outbox/`

That keeps the encoder independent of any requester-specific protocol.

## State Model

Recommended encoder-side states:

- `discovered`
- `pending`
- `ready`
- `queued`
- `encoding`
- `paused`
- `completed`
- `review`
- `approved`
- `rejected`
- `failed`
- `cancelled`
- `exported`

### Meaning

- `discovered`: file seen in inbox but not yet normalized
- `pending`: metadata loaded, waiting for user decisions
- `ready`: valid settings chosen, ready for queue
- `queued`: waiting for worker capacity
- `encoding`: actively processing
- `paused`: intentionally paused
- `completed`: encode finished successfully
- `review`: awaiting human approve/reject
- `approved`: reviewer accepted output
- `rejected`: reviewer rejected output
- `failed`: technical failure during processing
- `cancelled`: manually removed before completion
- `exported`: approved result has been placed in outbox

## Main-Side State Model

Any calling system should keep its own external state model if it needs one. The encoder itself should not require that state to operate.

## Source Class Handling

The `src/{library|dev|unlisted}` distinction is a good idea and should be kept.

It should influence:

- inbox placement
- default review routing
- outbox placement
- any later importer rules in `main`

### Rule

The relative subdirectory from the inbox path should survive the full lifecycle unless a user intentionally changes it during setup or review.

## Partial Copy Safety

This is easy to miss and important for manual workflows.

The encoder scanner should not process files that are still being copied.

Current recommended approach:

- only scan supported video files inside `inbox/`
- ignore files newer than a configured stability window
- recheck file size after a short delay before ingesting
- copy the discovered file into internal pending storage before queueing or processing

## Identity And Idempotency

The encoder must be able to detect duplicate imports safely.

Initial duplicate key options:

- inbox-relative path
- checksum later, if needed

Rules:

- importing the same inbox-relative path twice should not create two unrelated jobs
- the scanner should report duplicates clearly in the UI
- the outbox should preserve enough identity for a human operator to reconcile results later

## Review Contract

Review should compare:

- original metadata
- encoded metadata
- size delta
- duration delta
- resolution
- codec/container
- bitrate
- file paths

Reviewer actions:

- approve
- reject
- requeue with new settings

If approved:

- move approved file to the matching relative directory under `outbox/`
- generate a return manifest

If rejected:

- move artifact to `rejected/`
- keep review notes

## Return Package Contract

Approved outputs only need to be dropped into the matching outbox source-class folder unless a future integration requires extra sidecar metadata.

## UI Scope For `services/encoder`

The encoder UI should include at least these pages:

- `Pending`
  - discovered inbox files awaiting setup
- `Setup`
  - per-file metadata, profile selection, destination confirmation, queue action
- `Queue`
  - active jobs, queued jobs, paused jobs, failures
- `Review`
  - completed encodes awaiting approval
- `History`
  - approved, rejected, failed, exported records
- `Settings`
  - profiles, directory config, retention config, worker concurrency, ffmpeg paths

## Recommended Internal Modules For `services/encoder`

Suggested initial modules:

- `src/modules/encoding/encoding.routes.js`
- `src/modules/encoding/encoding.service.js`
- `src/modules/encoding/encoding.repository.js`
- `src/modules/encoding/encoding-worker.service.js`
- `src/modules/encoding/encoding-scan.service.js`
- `src/modules/encoding/encoding-review.service.js`
- `src/modules/encoding/encoding-profiles.js`
- `src/modules/filesystem/handoff-paths.js`
## What Should Move Out Of `main`

These current concerns should move into `services/encoder`:

- ffmpeg orchestration
- job queue and queue state
- scan job logic
- review and commit/reject logic
- encoding admin UI
- encoding-specific persistence
- handoff path rules that are encoder-owned

## What Can Stay In `main`

- any optional export helper for dropping files into the encoder inbox
- shallow request tracking if another system wants it
- optional status pages from the caller's point of view

## Persistence Recommendation

The standalone encoder should have its own datastore.

Minimum records:

- request package metadata
- discovered file metadata
- selected profile and settings
- queue state transitions
- worker progress snapshots
- output metadata
- review decision and notes
- export/outbox timestamps

Avoid making the encoder depend on `main`’s database for queue correctness.

## Retention Rules To Decide Early

We should define these before implementation:

- how long inbox originals remain after discovery
- whether approved outputs remain in `encoded/` after export
- how long rejected outputs are retained
- whether failed working directories are retained for debugging
- whether manifests and logs are retained permanently

## Migration Plan

### Phase 1

- Create `services/encoder` app skeleton
- Define config and directory layout
- Add encoder datastore
- Port encoding profiles and ffmpeg service

### Phase 2

- Port scan, queue, worker, and review logic from `main`
- Build encoder UI pages
- Add source-class-driven inbox and outbox handling
  Note: this now means preserving inbox-relative subdirectories into outbox-relative subdirectories.

### Phase 3

- Reduce `main` to request creation plus export
- Remove encoding worker registration from `main`
- Remove encoding admin pages from `main`

### Phase 4

- Add return/import flow if desired
- Harden cleanup, duplicate handling, and operator workflows

## Open Decisions

- Should `main` write directly into a shared handoff root, or into its own outbound that is manually moved later?
- Should review approval move the file or copy the file into outbox?
- Should rejected items be re-queued from the same request or create a new revision?
- Should routing-path changes be allowed during setup, or should they stay locked to the original inbox-relative directory by default?
- Should the encoder support more than one worker concurrently?
- Should `main` poll encoder status through an API, or remain fully manual?

## Recommended Direction

Recommended initial build:

- keep `main` outbound-only
- keep manual movement between systems
- give `services/encoder` full ownership of queue and review state
- use manifest-driven handoff
- preserve inbox-relative subdirectories on outbox
- keep `main`’s state shallow and operational

This gives us a clean split now without over-coupling the two systems again.
