# Stage 1 — Shell and test foundation

September 29, 2026. **Status: partial — external checks pending.** Local implementation and macOS arm64 checkpoint pass. Native Intel Mac/Windows execution and human interactive checks remain pending; the stage is not globally complete.

## Scope and review

Requested: thoroughly review the MVP plan, then implement Stage 1 only. Starting commit: `79079ef` (`main`), clean working tree. Changes remain uncommitted for review. Read the full plan, repository guidance, actual scaffold/configuration/lockfile and the downstream contracts. No reference checkout or private data was accessed.

Review findings:

- The plan separates local commit, destination save and cloud upload; scoped grants, transactional revisions, copy migrations and immutable compilation are compatible with a narrow Electron shell. Those contracts remain future-stage work.
- D1 is a real prerequisite for later native proof. The scaffold Electron 39 pin and broad toolkit preload needed replacement. D1 now records actual runtime/package evidence rather than relying on proposed versions.
- Editor/export/license feasibility (Stage 3), large snapshot behavior (Stage 5), destination semantics (Stage 6), paid-value evidence (Stage 18), and commerce/signing/store gates remain explicit dependencies. Stage 1 supplies no evidence for them and does not silently weaken them.
- `mvp-planning-prompt.md` is referenced by the planning history but absent from the current checkout and tracked file list. No replacement was invented. The authoritative plan is sufficient to execute Stage 1; the missing historical prompt is recorded in the plan and guidance.
- Stage status, historical starting audit and current evidence must stay distinct. The audit remains a dated snapshot, with a current Stage 1 addendum and updated ledger.

## Changes

| Paths                                                                                                                            | Result                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main/index.ts`, `ipc.ts`, `protocol.ts`, `security.ts`, `windows.ts`                                                        | Explicit sandbox/isolation, restricted assets/network/CSP, exact top-frame/window validation, bounded app information command, lifecycle                                           |
| `src/main/menus.ts`, `profile.ts`, `test-root.ts`, `test-network.ts`                                                             | Native File/Edit/View/Window/Help, guarded developer external link, isolated development settings and owned temporary test roots, fail-closed test transports                      |
| `src/shared/commands.ts`, `schemas.ts`, `src/preload/*`                                                                          | Named typed `getInfo` bridge and strict runtime request/response schemas; no generic toolkit/environment/fallback                                                                  |
| `src/renderer/index.html`, `src/renderer/src/{App,main}.tsx`, `components/ErrorBoundary.tsx`, `assets/main.css`                  | Selectable responsive shell, skip link, live status, error boundary; template logos/background/Versions and unused resource icon removed                                           |
| `package.json`, `package-lock.json`, `.nvmrc`, `.node-version`, `tsconfig*.json`, `electron.vite.config.ts`, `eslint.config.mjs` | Runtime/build pins, strict TS including tests/shared, bundled sandbox-compatible preload, new checks, removal of runtime toolkit dependencies                                      |
| `electron-builder.yml`, `build/entitlements.mac.plist`                                                                           | Development identifier, positive resources, no Linux/updater/unused privacy permissions, typechecked package commands, JIT-only entitlements, explicit unsigned development output |
| `tests/`, `scripts/`, `vitest.config.ts`, `playwright.config.ts`, `.github/workflows/checks.yml`, `.gitignore`                   | Synthetic unit/renderer/Electron/desktop harness, native macOS arm64/Intel and Windows CI, ignored test/build/tool outputs                                                         |
| `README.md`, `AGENTS.md`, plan, `docs/decisions/D1-runtime-and-shell.md`, this record                                            | Current commands, D1 decision, review findings, truthful stage/ledger/acceptance status                                                                                            |

## Machine and artifacts

- Host: macOS **27.0**, build **26A428**, **arm64**. Original host Node 22.22.3/npm 10.9.8 was not used for final validation. A repository-local ignored Node toolchain ran Node **24.21.0** / npm **11.19.0**, without changing the user's global installation.
- Electron process: **44.5.0**, embedded Node **24.21.0**, Chromium **152.0.7977.130**, V8 **15.2.124.28-electron.0**, ABI **149**, N-API **10**. Its runtime version listing includes SQLite, but no SQLite driver/feature was loaded or tested; that is Stage 2.
- Retained tools: electron-vite **5.0.0**, builder **26.15.3**, application Vite **7.3.6**, React/DOM **19.3.0**, TypeScript **5.9.3**.
- Artifact: `dist/mac-arm64/Collie Writer.app`, **unsigned development package**. Plist identity: `com.colliewriter.app.dev`. No production identity, notarization, signing, installer install, store or commerce result is claimed.
- `Contents/Resources/app.asar` SHA-256: `321b46e38364bee9304f42327347a83218ddf1131daa1f4fd59a60fc2c167570`.
- ASAR file inventory: `out/main/index.js`, `out/preload/index.js`, `out/renderer/index.html`, `out/renderer/assets/index-DdklLbGU.css`, `out/renderer/assets/index-NboY2fyE.js`, `package.json`. No node_modules, test/attack preload, fixtures, source files, prompts, tools, credentials or updater feed. Builder retains temporary scaffold packaging artwork until Stage 21.

## Commands and results

Final commands run with Node 24.21.0 first on PATH (locally `PATH="$PWD/.tools/node-v24.21.0-darwin-arm64/bin:$PATH"`). All following results are local, not remote CI.

| Command / check                              | Result                                                                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                     | Exit 0; exact lockfile installed, postinstall selected Electron 44.5.0                                                                                  |
| `npm run typecheck`                          | Exit 0; main/preload/shared, renderer and tests                                                                                                         |
| `npm run lint`                               | Exit 0; no errors or warnings in final pass                                                                                                             |
| `npm test`                                   | Exit 0; 9 tests in 2 files                                                                                                                              |
| `npm run build`                              | Exit 0; compiled main, single preload and renderer                                                                                                      |
| `npm run test:integration`                   | Exit 0; real Electron IPC workflow, child frame and second window rejection, malformed/oversized input, unknown command, denied notification permission |
| `npm run test:desktop`                       | Exit 0; actual shell workflow under production protocol                                                                                                 |
| `npm run build:unpack`                       | Exit 0; native arm64 unsigned app; expected missing-author warning because legal seller is not invented                                                 |
| `npm run test:desktop:unpacked`              | Exit 0; same desktop checks in unpacked app, including hostile dev-URL environment ignored                                                              |
| `npm audit`                                  | Exit 0; zero reported vulnerabilities after updating the new Happy DOM test dependency                                                                  |
| ASAR listing + SHA-256; PlistBuddy bundle ID | Positive resource inventory and `.dev` identity confirmed                                                                                               |
| Targeted Prettier; `git diff --check`        | Exit 0                                                                                                                                                  |

Security coverage includes unknown commands without a handler, real same-origin iframe and separate-window senders, invalid URL schemes/credentials, traversal and encoded/backslash forms, symlinked assets/test roots, unexpected schema fields, million-character payloads, bounded response validation, inline-script CSP enforcement, production remote-fetch/Node-fetch/Electron-net rejection, blocked popups/navigation, sandboxed preload and absent renderer Node/environment/generic IPC globals. Network transport denial is exercised before any external request can be sent.

The integration fixture deliberately permits child frames and exposes a hostile fixture preload to attack the IPC boundary independently. Actual desktop tests use production restrictions. Playwright's main-process evaluation is privileged test instrumentation, not a shipped renderer capability. `getLastWebPreferences` is an internal Electron accessor used only by the test; future runtime upgrades may require adapting that assertion.

Initial harness failures were corrected: React JSX test transform, macOS `/var` realpath expectations, fixture preload path normalization, a frame test stopped by navigation protection, and a native menu invocation that needed a real keyboard shortcut. Electron's first binary download exceeded the initial test timeout; subsequent native runs passed. The initially selected Happy DOM version had an advisory; the final 20.14.5 pin clears it. No failing product check is hidden by a skipped assertion.

## Interactive and visual checks

- Started actual `npm run dev -- --remoteDebuggingPort 9333` with a newly generated owned temporary profile; stopped the owned process group and removed only that root afterwards. This was a developer-controlled smoke launch, not a normal user profile.
- Agent-browser attached to that Electron window: expected heading/status rendered, `getInfo` was the only exposed method, renderer Node was absent, no Vite overlay/page errors or horizontal overflow. Inspected `output/playwright/stage-01-dev.png` visually: readable layout and spacing, all content visible.
- Packaged desktop screenshot: `output/playwright/stage-01-shell.png`. Automated keyboard Tab→skip link→main focus, text selection and Cmd+A passed. Actual macOS close→activate→new window and app shutdown passed. Screenshots are ignored reproducible evidence, not included in packages.
- React review: effect cancellation handles unmount/StrictMode, failures are bounded, error boundary works, semantic landmarks/status/focus and selectable text are present; no unnecessary fetching library, memoization or external resource is introduced.

Pending human checks: full native-menu pointer operation and dialog confirmation, VoiceOver, high contrast and prolonged zoom/keyboard use. Windows 11 interactive close/menus and Intel/oldest-supported Mac execution are unavailable here. CI jobs are authored for `macos-15`, `macos-15-intel`, `windows-2025`; none was pushed/dispatched or observed passing. Windows Server CI will still need Windows 11 human QA.

## Contracts, limits and handoff

[D1](../decisions/D1-runtime-and-shell.md) specifies runtime pins, protocol/CSP development exceptions, profiles and packaging. No persistent project format exists and no migration is required. All new projects/destination-null/save/recovery behavior remains unimplemented. The current `.dev` preference root is not the future verified working-storage root. Native code rebuild policy remains a Stage 2 decision.

Acceptance on the available host: shell without broad API, attack rejection, bundled assets, native CI definitions, removal of Linux/template permissions and protected test roots all pass. Overall stage remains **partial — external checks pending**, because native cross-platform claims require execution. The local checkpoint is sufficient to request Stage 2's local work. Stage 2 has **not** been started. No accounts, purchases, publication, deployments or remote CI runs were performed.
