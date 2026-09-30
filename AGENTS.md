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

Stages 1–2 implementation is complete and awaiting user testing under the standing policy above. Earlier macOS arm64 results in [docs/validation/stage-01.md](docs/validation/stage-01.md) and [D1](docs/decisions/D1-runtime-and-shell.md) are historical, not instructions to repeat them. Stage 2 has no assistant-run checks; its [record](docs/validation/stage-02.md), [D2](docs/decisions/D2-native-sqlite-and-worker.md) and [manual guide](docs/manual-testing/stage-02.md) are the current handoff. Native packaged behavior and real storage operations remain unverified.

Node 24.21.0, npm 11.19.0, Electron 44.5.0, electron-vite 5.0.0, builder 26.15.3 and better-sqlite3 13.0.3 remain pinned. Historical test scripts and dependencies remain for historical/user control; the product build path no longer includes `typecheck:tests`. Their presence does not authorize assistant use. Do not add the formerly proposed package/storage/export/benchmark/entitlement test commands. The former automatic native-check workflow is archived outside `.github/workflows/` and must not be re-enabled by the assistant.

Use `rg` and ordinary file/Git reads when inspecting source or guidance. Edit only relevant files; do not run formatters or validation commands to verify the edits. Never use normal app data, saved user projects or the reference workspace for test activity. For user-owned verification, give safe manual actions and expected outcomes rather than scripts or agent-driven checks.
