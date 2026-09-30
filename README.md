# Collie Writer

An offline-first desktop workspace for research and writing, built with Electron, React and TypeScript. Permanently ad-free.

Stage 1 provides a development shell, native menus, a sandboxed narrow bridge and isolated tests. Project storage and editing are not implemented. The [implementation plan](mvp-implementation-plan.md) is the authoritative scope and stage index; see [Stage 1 evidence](docs/validation/stage-01.md) and [D1](docs/decisions/D1-runtime-and-shell.md) for exact results and pending platforms.

## Setup

Use Node **24.21.0** and npm **11.19.0** (`.nvmrc` / `.node-version`). For nvm users:

```sh
nvm install
nvm use
npm ci
npm run dev
```

Electron **44.5.0**, electron-vite **5.0.0**, and electron-builder **26.15.3** are pinned. Host Node and Electron's embedded Node are separate runtimes. Use the lockfile; do not replace this pipeline or copy code/data from the reference application.

## Checks and development packages

| Command                                   | Purpose                                                             |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `npm run typecheck`                       | Strict main, preload, renderer, shared contracts and test types     |
| `npm run lint`                            | ESLint, including shared-module import boundaries                   |
| `npm test`                                | Vitest security/schema/root and React shell tests                   |
| `npm run test:integration`                | Actual Electron IPC/frame/permission tests; synthetic fixture entry |
| `npm run test:desktop`                    | Build and launch the production protocol with Playwright Electron   |
| `npm run build`                           | Typecheck, then compile main/preload/renderer                       |
| `npm run build:unpack`                    | Build an unsigned native development directory                      |
| `npm run test:desktop:unpacked`           | Run desktop checks against that native unpacked artifact            |
| `npm run build:mac` / `npm run build:win` | Typecheck/build and package development DMG / NSIS; never publish   |
| `npm start`                               | Preview compiled output                                             |

Native CI is configured for macOS arm64, Intel macOS and Windows x64. Configuration is not a passing run. Windows Server CI does not establish Windows 11 interactive behavior. Linux is outside product support. Development artifacts retain temporary scaffold packaging icons; final branding, legal seller metadata, signing and production identities belong to Stage 21.

## Boundaries

The only renderer capability is `window.collie.getInfo()`. Main checks the owning window, top frame, exact document URL and a strict request schema; preload validates responses. No renderer environment, generic IPC or filesystem API exists. Help uses local native dialogs; the unpackaged Development menu can open the Electron security documentation only after a native confirmation. Tests suppress external browser launches.

Production loads `collie://app/index.html` and inventoried bundled HTML/JS/CSS. It denies network, frames, popups, downloads, permissions and renderer navigation. Development alone permits the exact Vite loopback origin/WebSocket and inline React refresh/style injection. Packaged apps ignore the development URL environment variable.

All builds currently use `com.colliewriter.app.dev`. Chromium settings live under its separate app-data directory. No project/recovery storage exists; verified non-roaming working roots remain Stage 4. Production/beta data is never selected by this shell.

Tests generate a marked `collie-writer-test-*` directory directly in the OS temporary directory and provide `COLLIE_TEST_ROOT` plus an ownership token before Electron starts. Missing/invalid ownership or unsafe paths fail closed. Cleanup revalidates ownership and only removes that generated root. Do not supply personal paths. Test-mode Node transports and Electron session networking deny outgoing requests; package installation and Playwright's local debugger connection are harness infrastructure, not app network capabilities.

Screenshots are generated in ignored `output/playwright/`. No tests, fixture preloads, source documents or development tools are packaged. Stage 2 owns the general native package/storage audit harness; its commands do not exist yet.
