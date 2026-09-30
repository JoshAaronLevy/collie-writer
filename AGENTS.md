# Working in Collie Writer

This is a fresh Electron/React/TypeScript product. The authoritative specification and stage index is [mvp-implementation-plan.md](mvp-implementation-plan.md). `mvp-planning-prompt.md` is referenced by the planning history but is absent from this checkout; do not invent a replacement. The Cultural Analysis application is reference history, not a dependency; do not copy its code/private data or require its checkout. Make project changes only here.

## User-owned manual testing — standing instruction

Effective September 29, 2026, at Josh's explicit request. This overrides earlier repository plans, skill workflows and remembered preferences that ask the assistant to create or run tests. A routine implementation request does not waive it; only a later explicit user instruction changing this policy does.

- Do not add, write, extend or maintain ANY test code: unit, integration, Playwright/browser, end-to-end, smoke, regression, contract, snapshot, security, performance or other automated tests. Do not create test harnesses, fixtures/generators, mocks, fault-injection tools, benchmark/audit/verification scripts, testing-only UI/hooks, or CI automation that substitutes for tests. Existing test code is historical; leave it alone unless the user explicitly requests its removal.
- Do not perform testing or verification tasks yourself, directly or through agents, tools, skills or CI. Do not run test suites, typecheck, lint, audit, formatting checks, build/package checks or other validation commands. Do not start/launch/relaunch the app, a dev server, preview, browser automation or smoke probe; do not click through the app, take verification screenshots, benchmark, inject failures or run commands that do these things indirectly. Build/launch steps needed for manual verification belong in the user's guide, not assistant execution.
- Read and edit source, configuration and documentation to implement the requested work. Ordinary file inspection and Git status/diff reading are allowed. Keep production input validation, migration safety, error handling and recovery safeguards: runtime product behavior is not test code. Do not describe source inspection as a passed test.
- At the end of every implementation stage, provide a concise, ordered **manual test guide for the user**, with each action paired with an observable expected outcome. Include relevant setup/launch steps for the user only, describe only behavior actually implemented, and use disposable copies for data-risk scenarios. Do not ask the user to run automated suites or provide executable test scripts as the guide.
- Use the following handoff format, with natural wording rather than mandatory repeated phrases:

```markdown
Stage X complete. As a user:

1. When I [perform an action], [expected visible behavior].
2. When I [perform another action], [expected result].
3. When I [perform an edge-case action], [expected outcome].
```

“Complete” in that handoff means implementation is complete, not that testing has passed. Track **implementation complete — awaiting user testing** separately from user-confirmed acceptance. Record unverified behavior and release gates honestly. Stop after the guide and wait for the user's results before continuing to another stage. If implementation itself is blocked or incomplete, say so rather than using a false completion statement. Fix reported defects without adding or running tests, then return updated manual steps.

## Implementing a requested stage

A request such as “Please implement Stage 4 of the MVP implementation plan” means:

1. Read applicable repository guidance, the plan's current status, requested stage, prerequisite contracts and referenced completion evidence. Inspect actual code and Git state; preserve existing work and do not repeat completed setup.
2. Read prerequisite implementation and user-reported acceptance records, then implement only the requested stage plus necessary in-scope fixes. Do not execute prerequisite checks. Do not automatically proceed to the next stage, re-scaffold, migrate build pipelines or add deferred AI/mobile/sync infrastructure.
3. Use the stage's concrete contracts, data-safety rules and acceptance criteria. Resolve routine engineering choices and bounded spikes with evidence; record decisions. A missing material answer or external prerequisite blocks only its dependent work. Identify it precisely and continue independent authorized work; do not invent approval.
4. Do not write tests or run checks. Record implementation changes, known limitations and unverified behavior, then prepare the user-owned manual guide. Record results only when the user supplies them; keep historical results explicitly historical.
5. Update the plan's stage status, decisions and completion ledger; add the stage evidence file with changed paths, migrations, the manual guide, user-reported results if any and pending work. Preserve stable stage numbers. Stop after the requested stage. Publishing, store submissions, account creation and live commercial actions require separate authorization unless already explicitly authorized in the session.

## Non-negotiable contracts

- Product name: Collie Writer. Seller country/initial market: United States; USD pricing. Selected app ID: `com.colliewriter.app`, with `.dev`/`.beta` variants and separate local data. Verify namespace/registration and actual legal seller identity before production setup; do not invent ownership or seller details.
- No ads anywhere, ever: all modes/channels and future editions, including controlled app/help/tutorial/checkout/website surfaces. No advertising SDKs, ad tracking, sponsored/affiliate promotions or promotional upsell placements. Factual product/pricing information and user-initiated purchase controls remain available.
- macOS/Windows, strong offline non-AI first release; retain electron-vite/electron-builder unless a concrete requirement justifies a recorded alternative.
- No vendor manuscript/research/history/backup hosting or content-bearing diagnostics. Only necessary purchase/update metadata may reach those services. Any examples described for the user must be synthetic or licensed public material; do not generate test fixtures.
- Every new project starts with no destination; first Save uses a native picker. Working SQLite/recovery stays device-local. A local recovery commit, selected-file save and customer cloud upload are distinct states. Never purge unsaved recovery as cache or overwrite an observed external conflict.
- Copy-migrate persistent formats with verified backups, update all consumers and preserve originals on failure. Narrow validated IPC and trusted filesystem grants; no generic renderer filesystem/IPC API.
- No timed trial. The plan's free/paid matrix is approved. Reading/export/backup/recovery survive entitlement changes. Paid users have unlimited projects; lifetime means all future updates to the purchased edition, not one major version.
- Later AI must use an approved supported SDK/runtime and eligible subscription session checked before every operation, with authoritative included-only funding. No API-key, paid-credit or top-up fallback. Proposed writing changes require a separate reversible user action.

## Commands and repository state

Stages 1–8 implementation is complete and awaiting user testing under the standing policy above. Earlier macOS arm64 results in [docs/validation/stage-01.md](docs/validation/stage-01.md) and [D1](docs/decisions/D1-runtime-and-shell.md) are historical, not instructions to repeat them. Stage 2 has no assistant-run checks; its [record](docs/validation/stage-02.md), [D2](docs/decisions/D2-native-sqlite-and-worker.md) and [manual guide](docs/manual-testing/stage-02.md) describe its handoff. Native packaged behavior and real storage operations remain unverified.

Node 24.21.0, npm 11.19.0, Electron 44.5.0, electron-vite 5.0.0, builder 26.15.3 and better-sqlite3 13.0.3 remain pinned. Historical test scripts and dependencies remain for historical/user control; the product build path no longer includes `typecheck:tests`. Their presence does not authorize assistant use. Do not add the formerly proposed package/storage/export/benchmark/entitlement test commands. The former automatic native-check workflow is archived outside `.github/workflows/` and must not be re-enabled by the assistant.

Use `rg` and ordinary file/Git reads when inspecting source or guidance. Edit only relevant files; do not run formatters or validation commands to verify the edits. Never use normal app data, saved user projects or the reference workspace for test activity. For user-owned verification, give safe manual actions and expected outcomes rather than scripts or agent-driven checks.

## Stage 3 adapter checkpoint

[Stage 3](docs/validation/stage-03.md) and its [manual guide](docs/manual-testing/stage-03.md) record the adapter checkpoint. Read [D3](docs/decisions/D3-editor-and-compilation.md), [D4](docs/decisions/D4-citations-and-licenses.md) and [D5](docs/decisions/D5-local-pdf-pagination.md) before extending editor/compilation schema v1. Stage 4 adopts the document schema for plain-text persistence; Stage 8 mounts the rich editor while citation/footnote and export product flows remain later stages. Do not add test-only UI or probes. IME, clipboard, citation and DOCX/PDF fidelity/native results are unverified.

Preserve citeproc CPAL initial-session attribution, same-media source and complete notices when changing the shell or packaging. Do not describe citeproc as MIT. Pinned APA 7/Chicago 18, en-US and OFL font assets have independent notices. Keep Paged.js selected with its explicit pending footnote gate and bounded Typst fallback decision; never silently substitute endnotes. Resource/version origins are in `resources/asset-manifest.json` and the lockfile.

## Stage 4 storage checkpoint

[Stage 4](docs/validation/stage-04.md) and its [manual guide](docs/manual-testing/stage-04.md) record the initial storage checkpoint. Read the [local-storage decision](docs/decisions/stage-04-local-storage.md) and [initial working schema/command contract](docs/formats/working-project-v1.md). Projects have separate local settings/operations, an ownership lock, UUID revisions and idempotent commits. Do not recreate the scaffold, put device-local paths in portable SQL, copy a live SQLite main file without its journal, delete sidecars or migrate in place. Schema 1 was the first persistent format; Stage 5 now copy-migrates it to schema 2 while preserving originals and backups.

The production UI supplies untitled local projects and an explicit Protect locally action. Stage 6 now adds portable Save/Open and 30-second destination autosave. Stage 8 adds rich editing and debounced local commits; user-observed behavior is pending. Preserve current typing and exact retry operations on failure. Working roots are checked independently of Chromium userData; arbitrary third-party mirroring is not fully detectable. All native root, lock, migration and durability evidence remains pending user results. No assistant launch or checks are authorized by this checkpoint.

## Stage 5 snapshot checkpoint

[Stage 5](docs/validation/stage-05.md) and its [manual guide](docs/manual-testing/stage-05.md) record the earlier internal checkpoint. Read [D6](docs/decisions/D6-portable-snapshots.md), [archive v1](docs/formats/collie-v1.md) and [working schema 2](docs/formats/working-project-v2.md) before Stage 6. The streaming archive/capture/job/open services are internal; do not expose filesystem paths or invent a test UI to exercise them. Native Save/Open, path grants, selected-file acknowledgment and destination conflicts belong to Stage 6.

Capture and domain mutations share a boundary. Exact durable blob leases must be established from the copied database before releasing it. Keep completed candidates across failed/unknown transfers; interrupted or corrupt journals retain conservative leases until recovery inspection. GC must consult both current/history references and snapshot leases. All registered assets currently travel with the snapshot. Extend SQL, validators, blob graphs and copy migrations together when later domain entities ship. Schema 2 adds managed assets; it does not add an attachment/source UI or historical payload snapshots.

Archive round trips, native backup, cancellation and 1/5/10 GiB timing/memory/space are unverified. D6 is an implementation selection, not an accepted format/performance freeze. Keep these gates pending until user evidence; no tests, checks, fixture generation or launches are authorized.

## Stage 6 selected-file checkpoint

[Stage 6](docs/validation/stage-06.md) and its [manual guide](docs/manual-testing/stage-06.md) record the selected-file implementation handoff. Read the [native-location decision](docs/decisions/stage-06-file-locations.md) before extending lifecycle/storage. Native Save/Open/Save As/Locate, bounded progress/cancel, independent incoming copies, 30-second destination autosave and close flushing are implemented; all native/cloud/interruption behavior is unverified.

Workspace `destination-v1.json` is authoritative for selected-file lineage; the old settings catalog's null destination rows remain historical. Picker hints never assign a destination. Retain local `file-operations/` intents/incoming archives, completed snapshot candidates and `.collie-<operation ID>.previous.collie` siblings. Do not expire or remove them as caches. Stage 7 must add recovery/retention controls without bypassing strict inspection or overwriting local branches.

Existing-file replacement has an unavoidable last-comparison-to-rename race against other writers; there is no cloud CAS/upload claim. Supported-volume queries and runtime validation are production safeguards, not executed acceptance. Network/unknown/FAT/exFAT save volumes and Windows removable destinations are currently refused. Native replacement, Windows directory durability, cloud hydration and large-file costs remain release gates. Stage 7 now exposes retained recovery without changing these external/native limits; do not add or run tests/checks/launches.


## Stage 7 lifecycle checkpoint

[Stage 7](docs/validation/stage-07.md) and its [manual guide](docs/manual-testing/stage-07.md) are the current implementation handoff. Read the [recovery/lifecycle decision](docs/decisions/stage-07-recovery-and-lifecycle.md) before extending lifecycle or retention. All behavior remains awaiting user testing. Stage 8 now mounts the editor without establishing Stage 7 acceptance.

Backup has its own strict `backup.json` journal/catalog and cannot acknowledge the active destination. Backup/Duplicate compare the exact head within capture; Save/Move retain the minimum-head contract. Backup and Move require fresh filenames; Move always retains the old file. Restore/recovery inspection only open a new independent identity. Rename changes portable title/head, not filename or document revision. Archive is local `organization-v1.json`; copies start unarchived.

Startup scans local work and reconciles proven local acknowledgments; cloud/selected-file validation is deferred to opening the project through cancellable file jobs. Do not call a catalog entry proof of current file availability. Recovery artifact UUIDs resolve only to worker-discovered paths. Keep malformed/unknown/interrupted material retained.

Reset moves closed workspaces together into `reset-recovery/<UUID>/workspaces/`, guarded by the reviewed head/mapping/organization digest, typed acknowledgment and native confirmation. Recovery is reversible, rejects identity collisions, has no automatic expiry and is not disk-space reclamation. Cleanup only clears picker history; there are no disposable content caches or blob GC yet. Never delete recovery as cache, remove chosen files, copy a live SQLite main file, or add timed worker kills. Stage 21 must reuse the close/flush handshake before update installation. User OS app-data deletion/uninstall may still destroy local-only recovery; do not promise otherwise.

## Stage 8 editor checkpoint

[Stage 8](docs/validation/stage-08.md), its [decision](docs/decisions/stage-08-editor-and-assets.md) and [manual guide](docs/manual-testing/stage-08.md) record five flat templates, active-section editing, section metadata, local commit cadence, managed images and narrow clipboard handling. SQL schema 2, AST schema 1 and archive v1 remain unchanged. All runtime, native, IME, clipboard, large-section and file round-trip behavior awaits Josh's results. Nested outline operations and history belong to Stage 9; citation/footnote editing remains Stage 15. Do not add or run tests, checks or launches when extending this checkpoint.

## Stage 9 implementation checkpoint

Stage 9 outline/history is implemented, awaiting user testing: see [evidence](docs/validation/stage-09.md), [decision](docs/decisions/stage-09-outline-and-history.md), [schema 3](docs/formats/working-project-v3.md) and [manual guide](docs/manual-testing/stage-09.md). Parts/chapters are containers; `text` is the section kind. Structural changes check the head and every document revision, retain a pre-action checkpoint and atomically update mappings/projections. Archive/trash and merge tombstones are reversible through item/history restore. Restore creates new revisions and retains later work.

SQL/minimum reader is 3; AST/container remain 1. Preserve retained-copy 1→2→3 migration, prior schema-2 archive reads and all new table ownership when copying projects. Checkpoint indexes reference immutable shared section/anchor records; never treat an arbitrary domain commit as materializable history. Only reviewed old automatic history can be pruned, with referenced chunk accounting; no blob or recovery deletion. Extend these mappings/history/portable consumers when Stage 10 introduces annotation ranges and Stage 11 introduces sources. Runtime conservation, native migration/archive behavior, accessibility and history growth are unverified. P7 remains in force; Stage 10 is not started.
