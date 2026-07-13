# Video Encoder Split

## Goal

Move video encoding out of `services/main` into a standalone Node.js application at `services/encoder`.

After the split:

- `services/main` becomes the requester and handoff origin.
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

### `services/main` owns

- Requesting that a video be encoded
- Exporting the source video to a handoff location
- Creating a request manifest for the encoder
- Tracking the external request at a high level
- Importing or consuming returned approved outputs later if needed

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

- A person moves source files from `main` outbound to encoder inbox
- A person later moves approved encoded files from encoder outbox back to the calling system

## Operating Model

### 1. Request created in `main`

`main` creates a new encoding request record and exports:

- the source video file
- a sidecar manifest

`main` places these into its outbound handoff area.

### 2. File moved to encoder inbox

A human manually moves the request package from `main` outbound into the encoder inbox.

### 3. Encoder discovers pending files

The encoder scans its inbox and creates pending items that are visible in the encoder UI.

At this stage the file is not yet queued for work. It is only discovered and awaiting setup.

### 4. User selects settings and queues the file

An encoder user chooses:

- encoding profile
- destination source class
- optional overrides
- optional notes

The encoder creates a queued job and moves the request into managed encoder state.

### 5. Worker processes the encoding

The encoder worker performs the job and writes encoded output into encoder-managed storage.

### 6. User reviews the output

The encoder UI shows source vs encoded details for approval.

### 7. Confirm or reject

If confirmed:

- the encoder moves or copies the approved encoded output into encoder outbox
- the outbox path reflects the intended destination source class

If rejected:

- the encoder marks the job rejected
- the encoded artifact is retained according to retention rules
- the file may optionally be re-queued with different settings

## Directory Contract

Recommended layout with two separate roots:

```text
encoder-handoff-root/
  inbox/
    src/
      library/
      dev/
      unlisted/
  outbox/
    src/
      library/
      dev/
      unlisted/

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

- `inbox/src/{library|dev|unlisted}` is the manual drop location.
- `outbox/src/{library|dev|unlisted}` is the only manual export location.
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

## Request Package Contract

Each inbound request should contain:

- the source video file
- a sidecar manifest file

Recommended manifest name:

- `<basename>.request.json`

Recommended manifest fields:

```json
{
  "requestId": "enc_20260713_0001",
  "sourceSystem": "main",
  "sourceClass": "library",
  "requestedAt": "2026-07-13T12:00:00.000Z",
  "requestedBy": "user-or-system",
  "originalFilename": "example.mov",
  "originalRelativePath": "videos/example.mov",
  "handoffFilename": "example.mov",
  "videoUuid": "optional-video-uuid",
  "entityType": "video",
  "entityId": "optional-caller-id",
  "requestedProfileId": "browser_compatibility",
  "allowedProfileIds": [
    "browser_compatibility",
    "hq_h264"
  ],
  "destination": {
    "system": "main",
    "sourceClass": "library"
  },
  "notes": null,
  "checksum": {
    "algorithm": "sha256",
    "value": "optional"
  }
}
```

## Why The Manifest Matters

The manifest is important because manual file movement alone is not enough to preserve intent.

It carries:

- who requested the encode
- where the output is meant to go
- whether the request came from `library`, `dev`, or `unlisted`
- what profile was requested or allowed
- how the encoder should correlate the result back to the requester

Without this, the UI and outbox process will end up depending on fragile filename conventions.

## State Model

Recommended encoder-side states:

- `discovered`
- `pending_setup`
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
- `pending_setup`: metadata loaded, waiting for user decisions
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

`main` should keep a smaller external state model:

- `requested`
- `exported_to_encoder`
- `awaiting_return`
- `returned`
- `imported`
- `rejected`
- `cancelled`

`main` should not attempt to replicate the encoder worker internals. It only needs enough state to understand where the request sits operationally.

## Source Class Handling

The `src/{library|dev|unlisted}` distinction is a good idea and should be kept.

It should influence:

- inbox placement
- default review routing
- outbox placement
- any later importer rules in `main`

### Rule

The source class from the request manifest should survive the full lifecycle unless a user intentionally changes it during setup or review.

## Partial Copy Safety

This is easy to miss and important for manual workflows.

The encoder scanner should not process files that are still being copied. Use one of these approaches:

- copy into a temporary name and rename when complete
- require a manifest flag like `"ready": true`
- require a separate `.ready` marker file
- ignore files younger than a configured age threshold

Preferred approach:

- move the source video first
- move the manifest second
- only treat the item as discoverable when both are present

## Identity And Idempotency

The encoder must be able to detect duplicate imports safely.

Use a stable request identity:

- `requestId` from `main`

Optionally strengthen with:

- checksum
- original filename
- file size
- requested timestamp

Rules:

- importing the same `requestId` twice should not create two unrelated jobs
- the scanner should report duplicates clearly in the UI
- the outbox should preserve enough identity for the requester to reconcile results later

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

- move approved file to `outbox/src/<sourceClass>/`
- generate a return manifest

If rejected:

- move artifact to `rejected/`
- keep review notes

## Return Package Contract

Approved outputs should also use a sidecar manifest.

Recommended fields:

```json
{
  "requestId": "enc_20260713_0001",
  "sourceSystem": "encoder",
  "destinationSystem": "main",
  "sourceClass": "library",
  "approvedAt": "2026-07-13T14:00:00.000Z",
  "approvedBy": "reviewer",
  "status": "approved",
  "profileId": "browser_compatibility",
  "inputFilename": "example.mov",
  "outputFilename": "example.mp4",
  "outputContainer": "mp4",
  "outputCodec": "h264",
  "checksum": {
    "algorithm": "sha256",
    "value": "optional"
  },
  "reviewNotes": null
}
```

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
- `src/modules/filesystem/handoff-manifest.js`

## What Should Move Out Of `main`

These current concerns should move into `services/encoder`:

- ffmpeg orchestration
- job queue and queue state
- scan job logic
- review and commit/reject logic
- encoding admin UI
- encoding-specific persistence
- outbound/inbound handoff path rules that are encoder-owned

## What Can Stay In `main`

- initiating the request
- exporting source video plus request manifest
- shallow request tracking
- optional page showing request status from `main`’s point of view

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
- Add request manifest and return manifest support

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
- Should source-class changes be allowed during setup, or should they be locked to the request manifest?
- Should the encoder support more than one worker concurrently?
- Should `main` poll encoder status through an API, or remain fully manual?

## Recommended Direction

Recommended initial build:

- keep `main` outbound-only
- keep manual movement between systems
- give `services/encoder` full ownership of queue and review state
- use manifest-driven handoff
- preserve `src/{library|dev|unlisted}` on both inbox and outbox
- keep `main`’s state shallow and operational

This gives us a clean split now without over-coupling the two systems again.
