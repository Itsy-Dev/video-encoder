# Windows Support Status

## Status

Windows app support is complete for the current internal release target.

As of July 23, 2026, both packaged macOS and packaged Windows app flows are working in the current project state.

## Current Platform Scope

- macOS app flow is working
- Windows 11 app flow is working
- `x64` Windows packaging is supported
- operator workflow is working across intake, queue, encode, review, history, export, and logs

## Confirmed Windows Behavior

- Windows uses OS-native app data, cache, and logs paths
- bundled `ffmpeg` and `ffprobe` resolve correctly in packaged runs
- pause and resume work through the shared process-control layer
- stop finalizes a watchable partial file instead of promoting it to Review
- stopped partial outputs are saved under `Outbox/cancelled/...` with a `.part` filename
- process priority controls map to Windows-native priority classes
- packaged app behavior is aligned with normal Windows tray and launch expectations

## Notes For Future Changes

- treat this document as a status snapshot, not an active rollout plan
- if Windows behavior changes again, update this file and `README.md` together
- keep `WINDOWS_TEST_CHECKLIST.md` as the regression checklist for future releases
