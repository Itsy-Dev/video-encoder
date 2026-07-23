# Windows Test Checklist

## Goal

Validate the Windows 11 packaged app flow end to end, with extra focus on long-running ffmpeg control behavior.

## Build

1. Build the production Windows installer:

```bash
npm run dist:win
```

2. Optional: build the dev Windows installer:

```bash
npm run dist:dev:win
```

3. Confirm expected artifact exists:

```text
dist/Video Encoder-<version>-x64.exe
```

## Install

1. Copy the installer to the Windows 11 desktop if it was built on macOS.
2. Run the `.exe` installer.
3. Launch `Video Encoder`.
4. If Windows shows a warning for an unsigned build, continue with the install and first launch.

## Startup Checks

Confirm the app starts without crashing and logs the expected Windows runtime roots.

Expected production-style paths:

```text
Runtime paths: appData=C:\Users\<user>\AppData\Roaming\Video Encoder
Runtime paths: cache=C:\Users\<user>\AppData\Local\Video Encoder\Cache
Runtime paths: logs=C:\Users\<user>\AppData\Local\Video Encoder\Logs
Handoff paths: inbox=C:\Users\<user>\Videos\Video Encoder Inbox
Handoff paths: outbox=C:\Users\<user>\Videos\Video Encoder Outbox
```

Verify:

- app launches normally
- browser opens correctly
- tray icon appears
- settings page loads
- SQLite database is created in the app data root
- logs are written in the Windows logs root

## FFmpeg Binary Checks

Verify:

- ffmpeg starts successfully
- ffprobe starts successfully
- a packaged encode can begin without missing-binary errors

## Encode Control Checks

Use a real file that runs long enough to exercise control behavior.

### Pause

Verify:

- Pause action succeeds
- item state changes to `paused`
- ffmpeg process remains alive
- CPU usage drops as expected
- no output corruption or crash occurs

### Resume

Verify:

- Resume action succeeds
- same ffmpeg process continues
- item state returns to `encoding`
- progress continues forward from the paused job

### Stop

Verify:

- Stop action succeeds
- encode ends cleanly
- job does not remain stuck in `stopping`
- partial output is not promoted as completed output
- partial output is saved under `Outbox/cancelled/...`
- partial output filename includes a `.part` suffix before the extension
- item ends in the expected interrupted/cancelled state

### Forced Recovery

If stop hangs or the process must be killed, verify:

- app recovers safely
- item is not treated as completed
- job must be requeued from the source

## Performance Checks

Verify:

- ffmpeg thread settings affect runtime behavior
- process priority setting does not crash the encode
- low-priority settings reduce system impact
- the system remains responsive during a long encode

## Workflow Checks

Run the normal operator flow:

1. ingest file into Pending
2. configure profile in Setup
3. queue item
4. encode item
5. pause and resume during encode
6. stop at least one test encode
7. complete one successful encode
8. review output
9. approve or reject
10. confirm Outbox behavior

## File And Path Checks

Verify:

- paths with spaces work
- nested inbox subdirectories still work
- outbox export works under Windows paths
- logs remain readable
- app restart preserves settings and history

## Regression Checks

Verify:

- launching a second app instance does not create duplicate active instances
- the configured port is respected
- runtime lock still works
- startup recovery behavior still works after an interrupted run

## Record Results

Capture:

- pass/fail for each section
- any crash or hang
- any Windows security prompt behavior
- screenshots of installer, first launch, and queue control behavior if something looks wrong
- exact log lines or error messages for any failure

## Exit Criteria

Windows validation is good enough to move forward when:

- the installer works
- the app launches reliably
- bundled ffmpeg tools work
- pause, resume, and stop behave correctly on Windows
- one full encode completes successfully
- one intentional interrupted encode is handled safely
- the standard operator workflow works end to end
