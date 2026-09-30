# Collie Writer

An offline-first desktop workspace for research and writing, built with Electron, React and TypeScript. Permanently ad-free.

Stage 1 provides a development shell, native menus, a sandboxed narrow bridge and isolated tests. Project storage and editing are not implemented. The [implementation plan](mvp-implementation-plan.md) is the authoritative scope and stage index; see [Stage 1 evidence](docs/validation/stage-01.md) and [D1](docs/decisions/D1-runtime-and-shell.md) for exact results and pending platforms.

## Current implementation workflow

Josh owns all testing, effective September 29, 2026. The assistant must not write/maintain tests, add automated verification infrastructure or run any testing/check/build/launch/browser-verification activity. Each implemented stage ends with `Stage X complete. As a user:` and an ordered list of actions with expected outcomes, then waits for Josh's feedback. See the standing [instructions](AGENTS.md) and [Stage 1 manual guide](docs/manual-testing/stage-01.md).

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

`npm run dev` opens development; `npm start` previews an existing build. The user can create a development artifact with `npm run build:unpack`, `npm run build:mac` or `npm run build:win` when needed. These commands are instructions for the user, not permission for the assistant to execute them. The package commands include their existing typecheck/build steps and never publish.

Automated-test scripts and dependencies remain in `package.json` as history, and their earlier results are documented in the Stage 1 record. They are not part of the current manual handoff and must not be run or maintained by the assistant. No additional test/benchmark/audit commands are planned.

The former native CI configuration for macOS arm64, Intel macOS and Windows x64 is disabled and retained only as history. Its commands are not an assistant checklist. Windows Server CI does not establish Windows 11 interactive behavior. Linux is outside product support. Development artifacts retain temporary scaffold packaging icons; final branding, legal seller metadata, signing and production identities belong to Stage 21.

## Boundaries

The only renderer capability is `window.collie.getInfo()`. Main checks the owning window, top frame, exact document URL and a strict request schema; preload validates responses. No renderer environment, generic IPC or filesystem API exists. Help uses local native dialogs; the unpackaged Development menu can open the Electron security documentation only after a native confirmation. Tests suppress external browser launches.

Production loads `collie://app/index.html` and inventoried bundled HTML/JS/CSS. It denies network, frames, popups, downloads, permissions and renderer navigation. Development alone permits the exact Vite loopback origin/WebSocket and inline React refresh/style injection. Packaged apps ignore the development URL environment variable.

All builds currently use `com.colliewriter.app.dev`. Chromium settings live under its separate app-data directory. No project/recovery storage exists; verified non-roaming working roots remain Stage 4. Production/beta data is never selected by this shell.

Tests generate a marked `collie-writer-test-*` directory directly in the OS temporary directory and provide `COLLIE_TEST_ROOT` plus an ownership token before Electron starts. Missing/invalid ownership or unsafe paths fail closed. Cleanup revalidates ownership and only removes that generated root. Do not supply personal paths. Test-mode Node transports and Electron session networking deny outgoing requests; package installation and Playwright's local debugger connection are harness infrastructure, not app network capabilities.

Historical screenshots were generated in ignored `output/playwright/`. No tests, fixture preloads, source documents or development tools are packaged. The formerly proposed Stage 2 package/storage audit harness and later automated commands are cancelled under P7; do not add them.
