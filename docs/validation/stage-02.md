# Stage 2 — Native SQLite in development packages

**Status: implementation complete — awaiting user testing.** D2 is selected for implementation but packaged/native acceptance is pending. No target platform, installed artifact, FTS result, rollback, backup or crash behavior was verified by the assistant.

## Implementation

| Path                                                                                                                                       | Change                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`, `package-lock.json`                                                                                                        | Exact production driver `better-sqlite3` 13.0.3 and type package 9.6.0; removed the former native rebuild postinstall.          |
| `src/worker/index.ts`, `src/worker/storage/driver.ts`                                                                                      | Fixed startup/shutdown protocol, runtime compatibility gate, trusted file connection settings, transaction and backup adapters. |
| `src/main/storage-worker.ts`, `src/main/index.ts`, `src/main/ipc.ts`                                                                       | One utility process, bounded lifecycle and ready/unavailable state, narrow top-frame status command/event.                      |
| `src/shared/storage.ts`, `src/shared/commands.ts`, `src/shared/schemas.ts`, `src/preload/index.ts`                                         | Typed and validated status crossing worker, main and preload boundaries.                                                        |
| `src/renderer/src/App.tsx`, `src/renderer/src/assets/main.css`                                                                             | Visible SQLite engine load state and runtime version without implying project storage exists.                                   |
| `electron.vite.config.ts`, `electron-builder.yml`, `tsconfig.node.json`                                                                    | Worker entry/dependency packaging, one native binding per target, and worker TypeScript source inclusion.                       |
| `docs/decisions/D2-native-sqlite-and-worker.md`, `docs/manual-testing/stage-02.md`, `README.md`, `mvp-implementation-plan.md`, `AGENTS.md` | Decision, user guide, current implementation status and pending gates.                                                          |

No persistent project format or migration was introduced. The worker opens an in-memory connection only to gate SQLite compatibility on startup. Stage 4 owns non-roaming working roots, project tables, command/revision durability and copy migrations. No renderer-supplied path or SQL enters the worker. Failed load or process exit changes the UI to an unavailable state; the app does not claim a write succeeded.

## Evidence and limits

Dependency installation updated the lockfile with scripts and audit disabled. The installed source package declares bundled SQLite 3.53.4 and contains macOS/Windows arm64/x64 Node-API prebuilds. This is a package inventory, not execution of the binary. The assistant did not run tests, typecheck, lint, audit, formatter, build/package commands, the app or any native probe. No user results have been received for Stage 2.

User-owned checks still needed: native packaged launch and displayed versions on each target, target binding/resource inventory, clean exit without an orphan worker, and offline startup. FTS/rollback/WAL/backup/crash behavior is not yet exposed through a real product workflow and remains pending for Stage 4 acceptance. Native Intel Mac/Windows, signed packages and Windows arm64 remain explicitly pending. Record reported platform, OS, architecture, artifact, observed SQLite/Node/Node-API versions and any failure here when supplied.

The [D2 decision](../decisions/D2-native-sqlite-and-worker.md) records the packaging/rebuild policy and fallback. Follow the [Stage 2 manual guide](../manual-testing/stage-02.md). Stop before Stage 3 until the user responds or requests a documented implementation checkpoint.
