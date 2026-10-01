# Collie Writer

An offline-first desktop workspace for research and writing, built with Electron, React and TypeScript. Permanently ad-free.

Stages 1–17 implement local rich-writing projects, durable recovery, human notes/annotations, sources/evidence/search, citations and portable `.collie` Save/Open. Five templates create independently owned sections, and every new project asks for its own first-save location. Save As, inspected incoming copies, Recent/Locate, conflict messages, cancellable file work and 30-second destination autosave are implemented. **Protect locally** commits recovery on this computer; **Saved to chosen location** refers to the verified file revision, never cloud-upload completion. The [implementation plan](mvp-implementation-plan.md) is authoritative; see [Stage 17 evidence](docs/validation/stage-17.md) and its [manual guide](docs/manual-testing/stage-17.md). Implementation is complete through Stage 17; runtime, native, archive, export-fidelity and performance acceptance remain pending user testing.


Stage 7 adds independent Backup/Restore/Duplicate, title rename, Move retaining the old file, reversible local Archive, a recovery catalog and Data Locations. Backup/Move require an unused filename. **Reset local work** requires review and native confirmation, retains recoverable local copies, and never removes chosen files; it does not reclaim recovery space. **Clear picker history** affects only the picker preference. Removing app data can still destroy unsaved local recovery. There is no automatic recovery expiry or permanent purge UI.
Stage 8 adds a rich active-section editor, section details, local debounced commits, managed PNG/JPEG images, literal text-only paste and native Edit actions. The app rejects external active HTML paste; users can explicitly paste its plain text. Image source paths do not remain project dependencies. Windows local spellcheck depends on a cached dictionary under the app's network filter; user observations are pending.
Stage 9 adds nested outline moves, block-boundary splits, merge tombstones, reversible section archive/trash, manual and coalesced checkpoints, comparison, restore into new revisions and explicit anchor repair. Unchanged history sections are shared; reviewed cleanup preserves explicit/pre-change checkpoints and never removes blobs or recovery. [Working schema 3](docs/formats/working-project-v3.md) copy-migrates older databases while retaining originals; new archives require the Stage 9 reader.

Stage 10 adds human note capture, an unfiled inbox, reusable tags/categories, many-section links and quoted passage annotations with visible orphan status. [Working schema 4](docs/formats/working-project-v4.md) copy-migrates older databases while retaining originals; new archives include notes and require the Stage 10 reader. Native and manual acceptance remain pending.

## Current implementation workflow

Josh owns all testing, effective September 29, 2026. The assistant must not write/maintain tests, add automated verification infrastructure or run any testing/check/build/launch/browser-verification activity. Each implemented stage ends with `Stage X complete. As a user:` and an ordered list of actions with expected outcomes, then waits for Josh's feedback. See the standing [instructions](AGENTS.md) and [Stage 17 manual guide](docs/manual-testing/stage-17.md).

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

The renderer has named information/status and local-project capabilities, including create/list/open/commit and native file flows using main-owned, purpose/window-bound selection tokens. The [command contract](docs/formats/working-project-v1.md) records their exact boundaries. Main checks the owning window, top frame, exact document URL and strict request schemas; preload validates responses and status events. No renderer environment, generic IPC or filesystem API exists. Help uses local native dialogs; the unpackaged Development menu can open the Electron security documentation only after a native confirmation. Historical tests suppress external browser launches.

Production loads `collie://app/index.html` and inventoried bundled HTML/JS/CSS. It denies network, frames, popups, downloads, permissions and renderer navigation. Development alone permits the exact Vite loopback origin/WebSocket and inline React refresh/style injection. Packaged apps ignore the development URL environment variable.

All builds currently use `com.colliewriter.app.dev`. Chromium settings live under its separate app-data directory. Project working data defaults to checked macOS Application Support or Windows OS LocalAppData, with a native picker if a safe default cannot be established. Known cloud/network/redirection paths are refused; arbitrary mirroring cannot be fully detected, so keep working data outside every sync tool. The UI displays the actual working location. The worker stores project revisions separately from local settings/jobs; new projects start without a destination; successful Save/Open/Locate persist their own device-local file mapping. Production/beta data is never selected by this shell.

Tests generate a marked `collie-writer-test-*` directory directly in the OS temporary directory and provide `COLLIE_TEST_ROOT` plus an ownership token before Electron starts. Missing/invalid ownership or unsafe paths fail closed. Cleanup revalidates ownership and only removes that generated root. Do not supply personal paths. Test-mode Node transports and Electron session networking deny outgoing requests; package installation and Playwright's local debugger connection are harness infrastructure, not app network capabilities.

Historical screenshots were generated in ignored `output/playwright/`. No tests, fixture preloads, source documents or development tools are intended for packaging. The target SQLite native binary is copied as a resource outside ASAR; native packaging still awaits Josh's manual results. The formerly proposed Stage 2 package/storage audit harness and later automated commands are cancelled under P7; do not add them.

## Editor and export implementation checkpoint

The internal [snapshot format](docs/formats/collie-v1.md) uses yazl 3.3.1/yauzl 3.4.0 and saxes 6.0.0 with bundled notices. Earlier working schemas copy-migrate to [schema 9](docs/formats/working-project-v9.md); prior database files and backups are retained. Stage 6 exposes the archive workflow through native pickers and a file-status panel. Staging and previous archives are retained on failure; Stage 7 exposes available retained versions through validated inspection and independent restore. Large-library costs and clean-machine archive restoration await the actual product workflow and user observations.

The Stage 3 Tiptap adapter is mounted for writing on AST schema v1. Stages 15–17 wire local APA 7/Chicago 18 processing, frozen DOCX/PDF/Markdown/text compilation, named recipes and text/Markdown import. The [D3 subset](docs/decisions/D3-editor-and-compilation.md), [D4 license/citation decision](docs/decisions/D4-citations-and-licenses.md), [D5 pagination decision](docs/decisions/D5-local-pdf-pagination.md) and [Stage 17 decision](docs/decisions/stage-17-interchange-and-recipes.md) govern these flows. DOCX/PDF, IME and visual fidelity results remain pending user observation.

Exact direct pins: Tiptap core/PM 3.31.3, citeproc 2.4.63 (CPAL 1.0), docx 9.8.1, Paged.js 0.4.3 and parse5 8.0.0. Fonts/styles/locales and the normal Paged browser bundle live in `resources/`; the builder copies only allowlisted resources. Help → Third-party licenses reveals notices and unmodified processor source. Preserve the required visible citeproc attribution when replacing the welcome screen. See the [license inventory](docs/licenses/stage-03.md).
