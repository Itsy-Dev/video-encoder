# Encoder Test Plan

This file is the reference checklist for hardening the standalone encoder service before and during test implementation.

It is intentionally written as a behavior plan, not as a specific test framework implementation.

## Purpose

The goal of test coverage is to lock down the current `v1` behavior of the encoder service:

- inbox intake
- internal ownership of source files
- queue and worker lifecycle
- encode and review flow
- outbox export
- restart recovery
- logging side effects

## Priority Order

Recommended order for implementation:

1. service lifecycle tests
2. recovery and restart tests
3. API endpoint tests
4. logger tests

## Core Lifecycle Coverage

### Scan

- discovers supported video files in `inbox/`
- ignores unsupported file extensions
- ignores unstable files that still appear to be copying
- moves stable source files from `inbox/` to `pending/<item-id>/<filename>`
- preserves the original filename exactly
- preserves the original inbox relative subdirectory for later outbox routing
- stores source metadata after ingest
- does not create duplicates when the same relative inbox path is scanned again

### Queue

- `queueItem` changes item status to `queued`
- `queueItem` stores the selected profile
- `queueItem` clears stale export/review fields when requeueing
- queueing wakes the worker automatically

### Encode

- worker processes only one item at a time
- worker writes active temp output into `working/<item-id>/`
- ffmpeg temp output uses `.tmp.<ext>`
- successful encode moves final output into `encoded/<item-id>/<filename>`
- successful encode stores encoded metadata
- `encoded/` does not mirror inbox subdirectories
- `working/` does not mirror inbox subdirectories

### Review Outcomes

- `approve` moves the final encoded file into `outbox/<relative-subdir>/<filename>`
- `approve` preserves the original filename exactly
- `approve` cleans `pending/<item-id>`
- `approve` cleans `working/<item-id>`
- `approve` cleans `encoded/<item-id>`
- `reject` removes encoded output
- `reject` removes working output
- `reject` keeps source material in `pending/<item-id>`
- `reject` returns the item to an actionable state

### Stop / Cancel

- `stop` cancels active ffmpeg work
- `stop` removes partial encoded output
- `stop` removes partial working output
- `stop` keeps source material in `pending/<item-id>`
- `stop` returns the item to an actionable state

## Queue And Worker Coverage

- only one item encodes at a time
- a second queued item waits until the first finishes
- post-item cooldown delays the next queued item
- manual `pause` changes state to `paused`
- manual `resume` changes state back to `encoding`
- manual `wakeQueue` starts queued work when the worker is idle
- queued work resumes automatically on server startup

## Recovery Coverage

### Startup Recovery

- server startup resumes already queued items
- startup handles previously interrupted `encoding` items according to current policy
- startup handles previously interrupted `paused` items according to current policy
- startup removes stale `.tmp` artifacts from `working/`
- startup removes stale `.tmp` artifacts from `encoded/`
- startup prunes empty leftover directories from `pending/`
- startup prunes empty leftover directories from `working/`
- startup prunes empty leftover directories from `encoded/`

### Interrupted Runs

- interrupted active encode does not leave ghost temp files after restart
- interrupted active encode does not leave stuck worker state after restart
- interrupted queued items do not remain stuck after restart

## Filesystem And Pathing Coverage

- item IDs are opaque safe IDs, not raw inbox relative paths
- files directly in `inbox/` export to root `outbox/`
- files in nested inbox subdirectories export to matching nested `outbox/` subdirectories
- only `outbox/` mirrors the inbox relative subdirectory
- source stays in `pending/<item-id>/<filename>` with no extra `source/` folder

## API Coverage

- `POST /api/encoding/scan` performs a real scan
- `POST /api/encoding/items/:id/queue` queues an actionable item
- `POST /api/encoding/items/:id/approve` exports and cleans internals
- `POST /api/encoding/items/:id/reject` removes encoded output and keeps source
- `POST /api/encoding/control/pause` pauses active work
- `POST /api/encoding/control/resume` resumes active work
- `POST /api/encoding/control/stop` stops active work safely
- `POST /api/encoding/control/wake` wakes queued work

## Logging Coverage

- logger keeps normal terminal output working
- daily log file is created in `internal/logs/`
- file log lines are timestamped
- ANSI color codes are stripped from file logs
- `console.error` writes to both the daily log and `error.log`
- workflow events emit useful log lines:
  - server start
  - server shutdown
  - scan start and finish
  - inbox ingest
  - item queued
  - worker pickup
  - pause
  - resume
  - stop request
  - encode complete
  - encode failure
  - approve/export
  - reject
  - startup recovery

## Edge Cases

- approving without an encoded output fails cleanly
- rejecting without an encoded output behaves safely
- stop while paused behaves safely
- duplicate scan attempts do not create duplicate rows
- corrupted inputs fail cleanly and remain recoverable
- empty directories under inbox do not break scans
- unsupported files under inbox do not break scans

## Suggested Test Layers

### Service-Level Tests

Best place to cover:

- lifecycle behavior
- queue transitions
- cleanup behavior
- pathing rules
- restart recovery rules

### API Tests

Best place to cover:

- endpoint contract
- request/response shapes
- route wiring
- action endpoints

### Logger Tests

Best place to cover:

- daily log creation
- `error.log` duplication
- ANSI stripping

## Suggested First Test Batch

If only a small first batch is implemented, start here:

1. scan moves inbox file to pending
2. queue wakes worker
3. approve exports file and cleans internals
4. reject removes encoded output and keeps source
5. stop removes partial output and keeps source
6. restart resumes queued items and clears stale temp files
