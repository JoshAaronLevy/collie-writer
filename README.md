# Collie Writer

An offline-first desktop workspace for research and writing, built with Electron, React and TypeScript. Permanently ad-free.

Stages 1–4 provide a development shell, native menus, a sandboxed narrow bridge, a SQLite utility process, untitled local projects with plain-text drafts, and internal editor/citation/export adapters with pinned local assets. **Protect locally** commits a draft for recovery on this computer; portable Save/Open, automatic commits and rich editing remain later stages. The [implementation plan](mvp-implementation-plan.md) is authoritative; see [Stage 4 evidence](docs/validation/stage-04.md), [storage decision](docs/decisions/stage-04-local-storage.md) and [D3–D5 decisions](docs/decisions/D3-editor-and-compilation.md). Implementation is complete through Stage 4; native behavior and user acceptance remain pending.

## Current implementation workflow

Josh owns all testing, effective September 29, 2026. The assistant must not write/maintain tests, add automated verification infrastructure or run any testing/check/build/launch/browser-verification activity. Each implemented stage ends with `Stage X complete. As a user:` and an ordered list of actions with expected outcomes, then waits for Josh's feedback. See the standing [instructions](AGENTS.md) and [Stage 4 manual guide](docs/manual-testing/stage-04.md).

Existing Stage 1 tests, package scripts and results remain historical. The former automatic native CI is archived under `.github/disabled-workflows/` and no longer runs on push/pull request. Do not re-enable or extend it. Implementation completion is recorded separately from user-confirmed acceptance.

## Setup for the user

Use Node **24.21.0** and npm **11.19.0** (`.nvmrc` / `.node-version`). For nvm users:

```sh
nvm install
nvm use
npm ci
npm run dev
```

Electron **44.5.0**, electron-vite **5.0.0**, and electron-builder **26.15.3** are pinned. Host Node and Electron's embedded Node are separate runtimes. Use the lockfile; do not replace this pipeline or copy code/data from the reference application.

## User-owned launch and packaging

`npm run dev` opens development; `npm start` previews an existing build. The user can create a development artifact with `npm run build:unpack`, `npm run build:mac` or `npm run build:win` when needed. These commands are instructions for the user, not permission for the assistant to execute them. Package commands include product typecheck/build steps and never publish; the historical `typecheck:tests` is no longer in the product build path.

Automated-test scripts and dependencies remain in `package.json` as history, and their earlier results are documented in the Stage 1 record. They are not part of the current manual handoff and must not be run or maintained by the assistant. No additional test/benchmark/audit commands are planned.

The former native CI configuration for macOS arm64, Intel macOS and Windows x64 is disabled and retained only as history. Its commands are not an assistant checklist. Windows Server CI does not establish Windows 11 interactive behavior. Linux is outside product support. Development artifacts retain temporary scaffold packaging icons; final branding, legal seller metadata, signing and production identities belong to Stage 21.

## Boundaries

The renderer has named information/status and local-project capabilities, including create/list/open/commit and a main-owned working-folder picker. The [command contract](docs/formats/working-project-v1.md) records their exact boundaries. Main checks the owning window, top frame, exact document URL and strict request schemas; preload validates responses and status events. No renderer environment, generic IPC or filesystem API exists. Help uses local native dialogs; the unpackaged Development menu can open the Electron security documentation only after a native confirmation. Historical tests suppress external browser launches.

Production loads `collie://app/index.html` and inventoried bundled HTML/JS/CSS. It denies network, frames, popups, downloads, permissions and renderer navigation. Development alone permits the exact Vite loopback origin/WebSocket and inline React refresh/style injection. Packaged apps ignore the development URL environment variable.

All builds currently use `com.colliewriter.app.dev`. Chromium settings live under its separate app-data directory. Project working data defaults to checked macOS Application Support or Windows OS LocalAppData, with a native picker if a safe default cannot be established. Known cloud/network/redirection paths are refused; arbitrary mirroring cannot be fully detected, so keep working data outside every sync tool. The UI displays the actual working location. The worker stores project revisions separately from local settings/jobs; no project-file destination is assigned. Production/beta data is never selected by this shell.

Tests generate a marked `collie-writer-test-*` directory directly in the OS temporary directory and provide `COLLIE_TEST_ROOT` plus an ownership token before Electron starts. Missing/invalid ownership or unsafe paths fail closed. Cleanup revalidates ownership and only removes that generated root. Do not supply personal paths. Test-mode Node transports and Electron session networking deny outgoing requests; package installation and Playwright's local debugger connection are harness infrastructure, not app network capabilities.

Historical screenshots were generated in ignored `output/playwright/`. No tests, fixture preloads, source documents or development tools are intended for packaging. The target SQLite native binary is copied as a resource outside ASAR; native packaging still awaits Josh's manual results. The formerly proposed Stage 2 package/storage audit harness and later automated commands are cancelled under P7; do not add them.

## Editor and export implementation checkpoint

The Stage 3 adapters are not yet mounted in a writing screen or wired to export jobs. They define schema v1, immutable compilation, local APA 7/Chicago 18 processing, native DOCX structures and isolated Paged.js PDF printing. The [D3 subset](docs/decisions/D3-editor-and-compilation.md), [D4 license/citation decision](docs/decisions/D4-citations-and-licenses.md) and [D5 pagination decision](docs/decisions/D5-local-pdf-pagination.md) govern their later integration. No DOCX/PDF, IME or visual fidelity result is claimed.

Exact direct pins: Tiptap core/PM 3.31.3, citeproc 2.4.63 (CPAL 1.0), docx 9.8.1, Paged.js 0.4.3 and parse5 8.0.0. Fonts/styles/locales and the normal Paged browser bundle live in `resources/`; the builder copies only allowlisted resources. Help → Third-party licenses reveals notices and unmodified processor source. Preserve the required visible citeproc attribution when replacing the welcome screen. See the [license inventory](docs/licenses/stage-03.md).
