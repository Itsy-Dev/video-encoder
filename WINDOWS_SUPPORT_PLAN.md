# Windows Support Plan

## Goal

Add Windows 11 support for Video Encoder in a way that works for internal use first, while staying aligned with a customer-facing release path.

## Scope

- Windows 11 only
- `x64` first
- Internal-use rollout first
- Standard Windows app behavior and paths

## Progress

- Completed: Windows packaging targets and installer setup
- Completed: runtime profile defaults now resolve by lane and OS at runtime
- Completed: Windows-safe ffmpeg job controls
- Completed: Windows process priority mapping
- In progress: Windows desktop app behavior cleanup

## Game Plan

### 1. Define the Windows release target

Confirm the support contract for the first Windows release:

- Windows 11 only
- `x64` architecture
- unsigned internal builds first
- installer-based distribution

### 2. Add Windows packaging

Set up a standard Windows installer flow for the Electron app.

Summary:

- use a normal `.exe` installer
- keep the packaging structure aligned with future customer-facing releases
- make packaged builds easy to test on a real Windows desktop

### 3. Adopt Windows-native storage paths

Move Windows defaults to the expected OS locations for app-managed data and operator handoff folders.

Summary:

- app data uses Windows-standard locations
- cache and logs use Windows-standard locations
- Inbox defaults to `C:\Users\<user>\Videos\Video Encoder Inbox`
- Outbox defaults to `C:\Users\<user>\Videos\Video Encoder Outbox`

### 4. Make runtime defaults platform-aware

Ensure packaged app defaults, environment templates, and startup behavior choose the right values for Windows without affecting macOS behavior.

Summary:

- keep platform defaults isolated
- preserve the current macOS behavior
- make Windows first-run setup predictable

### 5. Validate bundled FFmpeg and FFprobe

Keep shipping bundled media binaries on Windows the same way the app does on macOS.

Summary:

- bundle Windows `ffmpeg`
- bundle Windows `ffprobe`
- verify packaged builds can find and launch both binaries correctly

### 6. Implement Windows job controls

Support long-running encodes safely on Windows so operators can manage CPU-heavy jobs without losing progress unnecessarily.

Summary:

- `Pause` should suspend the running encode without ending it
- `Resume` should continue the same encode
- `Stop` should end the encode cleanly
- emergency kill remains a last-resort action

Current status:

- graceful stop now uses ffmpeg stdin control instead of direct termination
- process pause and resume are now isolated behind a shared process-control layer
- Windows pause and resume use a dedicated Windows thread suspend/resume helper

### 7. Map performance controls to Windows

Keep the existing safety mindset while using Windows-native behavior where needed.

Summary:

- keep ffmpeg thread limits
- map process priority controls to Windows equivalents
- avoid settings that can make the machine unstable or unresponsive

Current status:

- ffmpeg thread settings continue to apply cross-platform
- Windows process priority now maps to Windows-native priority classes
- UI label is now platform-neutral instead of Unix-specific

### 8. Finish Windows app behavior

Make the desktop app feel natural on Windows during launch and normal use.

Summary:

- remove mac-only assumptions from startup behavior
- make browser opening behave correctly on Windows
- ensure tray and packaged app behavior are Windows-safe

Current status:

- Windows now uses the normal app icon for tray behavior instead of the macOS template tray image
- packaged dev launcher instructions now switch to Windows-friendly commands when run on Windows

### 9. Update documentation

Document the Windows install path, runtime paths, and testing expectations.

Summary:

- add Windows setup notes
- document installer use
- document default Windows storage locations
- capture Windows testing expectations for future releases

### 10. Run a Windows validation pass

Test the full packaged app flow on a real Windows 11 machine.

Summary:

- install the packaged app
- launch and confirm startup behavior
- verify settings persistence
- test intake, queue, encode, review, and export
- test pause, resume, stop, and logs

## Recommended Implementation Order

1. Windows-native paths and runtime defaults
2. Windows packaging
3. Bundled FFmpeg and FFprobe validation
4. Windows job controls
5. Windows performance controls
6. Remaining desktop app behavior
7. Documentation updates
8. Full Windows 11 validation pass

## Main Risks

- Windows pause and resume behavior needs careful validation
- packaged binary resolution may behave differently on Windows than macOS
- path handling and permissions may expose Windows-specific edge cases
- installer and first-launch behavior may need iteration

## Phase 1 Exit Criteria

Phase 1 is successful when:

- the app installs on Windows 11
- packaged builds launch cleanly
- defaults use Windows-native paths
- bundled ffmpeg tools run correctly
- long encodes can be paused, resumed, and stopped safely
- the full operator workflow works on a real Windows desktop
