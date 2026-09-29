# Working in Collie Writer

This is a fresh Electron/React/TypeScript product. The authoritative specification and stage index is [mvp-implementation-plan.md](mvp-implementation-plan.md). [mvp-planning-prompt.md](mvp-planning-prompt.md) records the original documentation request. The Cultural Analysis application is reference history, not a dependency; do not copy its code/private data or require its checkout. Make project changes only here.

## Implementing a requested stage

A request such as “Please implement Stage 4 of the MVP implementation plan” means:

1. Read applicable repository guidance, the plan's current status, requested stage, prerequisite contracts and referenced completion evidence. Inspect actual code and Git state; preserve existing work and do not repeat completed setup.
2. Verify prerequisites and implement only the requested stage plus necessary in-scope fixes. Do not automatically proceed to the next stage, re-scaffold, migrate build pipelines or add deferred AI/mobile/sync infrastructure.
3. Use the stage's concrete contracts, data-safety rules and acceptance criteria. Resolve routine engineering choices and bounded spikes with evidence; record decisions. A missing material answer or external prerequisite blocks only its dependent work. Identify it precisely and continue independent authorized work; do not invent approval.
4. Run appropriate checks, fix in-scope failures and record exact results, platform/artifact, manual checks still pending and limitations. Mocks, cross-compilation and unsigned packages do not prove real purchases, native execution, signing or store approval.
5. Update the plan's stage status, decisions and completion ledger; add the stage evidence file with changed paths, checks/results, migrations and pending work. Preserve stable stage numbers. Stop after the requested stage. Publishing, store submissions, account creation and live commercial actions require separate authorization unless already explicitly authorized in the session.

## Non-negotiable contracts

- Product name: Collie Writer. Seller country/initial market: United States; USD pricing. Selected app ID: `com.colliewriter.app`, with `.dev`/`.beta` variants and separate local data. Verify namespace/registration and actual legal seller identity before production setup; do not invent ownership or seller details.
- No ads anywhere, ever: all modes/channels and future editions, including controlled app/help/tutorial/checkout/website surfaces. No advertising SDKs, ad tracking, sponsored/affiliate promotions or promotional upsell placements. Factual product/pricing information and user-initiated purchase controls remain available.
- macOS/Windows, strong offline non-AI first release; retain electron-vite/electron-builder unless a concrete requirement justifies a recorded alternative.
- No vendor manuscript/research/history/backup hosting or content-bearing diagnostics. Only necessary purchase/update metadata may reach those services. Fixtures must be synthetic or licensed public material.
- Every new project starts with no destination; first Save uses a native picker. Working SQLite/recovery stays device-local. A local recovery commit, selected-file save and customer cloud upload are distinct states. Never purge unsaved recovery as cache or overwrite an observed external conflict.
- Copy-migrate persistent formats with verified backups, update all consumers and preserve originals on failure. Narrow validated IPC and trusted filesystem grants; no generic renderer filesystem/IPC API.
- No timed trial. The plan's free/paid matrix is approved. Reading/export/backup/recovery survive entitlement changes. Paid users have unlimited projects; lifetime means all future updates to the purchased edition, not one major version.
- Later AI must use an approved supported SDK/runtime and eligible subscription session checked before every operation, with authoritative included-only funding. No API-key, paid-credit or top-up fallback. Proposed writing changes require a separate reversible user action.

## Commands and repository state

At planning time only the scaffold exists. Existing checks are `npm run typecheck`, `npm run lint` and `npm run build`; `npm run build:unpack`, `npm run build:mac` and `npm run build:win` exist but are not proof of production readiness. The current Mac packaging script bypasses typecheck until Stage 1 fixes it. `npm run dev` starts development; `npm start` previews a build.

There is **no test script yet**. The plan explicitly assigns introduction of test/package/benchmark commands to stages; verify a command exists before claiming to run it. Use the lockfile (`npm ci` when installation is needed), inspect installed versions and follow the stage's runtime compatibility decision.

Use targeted formatting, for example `./node_modules/.bin/prettier --check mvp-implementation-plan.md AGENTS.md`; avoid `npm run format` for narrow changes because it rewrites the repository. Prefer `rg` for searches. Never run destructive fixtures against normal app data, saved user projects or the reference workspace.
