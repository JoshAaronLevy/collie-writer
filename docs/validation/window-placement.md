# Window placement — October 6, 2026

Status: **implementation complete — awaiting user testing**. Required format, lint and node/web typechecks passed cleanly. Runtime/manual acceptance remains pending.

## Change

Josh requested that Collie reopen at its last size/position, with an available-desktop-sized default like the supplied screenshot. `src/main/windows.ts` now supplies native bounds from `src/main/window-placement.ts` instead of a fixed 1280 × 720 window. An absent, invalid or unreadable preference uses the primary display's work area. Restoring a saved window clamps its size and position to an available display; a disconnected display falls back to the primary display. Existing 420 × 400 minimum dimensions are reduced only when necessary to fit a smaller work area.

The main process records ordinary window bounds and maximized state. It applies saved maximization when ready to show, never requests full screen, and excludes minimized/full-screen geometry from capture. Move/resize/maximize/restore events maintain the in-memory snapshot; `close` refreshes it before destruction and `closed` writes it. A cancelled close does not write. No timers, renderer IPC, renderer remounts or changes to `ProjectLifecycle` are involved.

## Local preference

`window-state-v1.json` lives under the existing channel-specific Electron `userData` profile. It contains only `{ version: 1, bounds: { x, y, width, height }, maximized }`, with integer bounds in Electron's device-independent coordinates. The reader accepts at most 4 KiB, exact keys, finite bounded integer coordinates/dimensions and a boolean maximized value. The file is non-authoritative presentation data and never enters a `.collie` archive or working project database. No project-format migration is needed.

The writer uses an exclusive, randomly named temporary file with mode 0600 and a synchronous rename, finishing before ordinary process exit. Failure logs only `WINDOW_STATE_SAVE_FAILED`, retains the previous preference when replacement fails, and never blocks existing writing protection or close. Force-quit/crash placement recovery is not promised. A future launch can use the default if the preference is unavailable. Operating-system Dock/taskbar auto-hide settings remain under the user's control.

API basis: Electron documents [normal window bounds and maximization](https://www.electronjs.org/docs/latest/api/browser-window/) and [display matching/work areas](https://www.electronjs.org/docs/latest/api/screen). Native window-manager behavior still requires user observation.

## Checks and acceptance

Scripts and ignore scope were inspected before formatting; existing exclusions protect vendor/generated files and historical testing code. Using the pinned local Node 24.21.0/npm 11.19.0 toolchain, `npm run format`, then `npm run lint`, then `npm run typecheck` (node and web) completed with exit 0 and no warnings/errors on the final code. The sequence was repeated after tightening temporary-file cleanup on a failed preference write. No automated tests, builds, app launches, browser automation, screenshots or runtime verification were performed.

Follow the [manual guide](../manual-testing/window-placement.md). macOS zoom/maximize transitions, normal quit/reopen, same-process Dock reopening, minimized/full-screen exit and display changes await Josh's observations. This bounded change does not advance the UAT plan or change existing release gates.
