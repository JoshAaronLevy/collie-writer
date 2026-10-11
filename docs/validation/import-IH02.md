# IH02 — Complete local Submit path

October 10, 2026. Scope: [IH02](../../import-hybrid-implementation-plan.md#ih02--deliver-the-complete-local-path-for-known-formats) only. **Implementation complete — awaiting user testing.** Required-check results and runtime acceptance are separate.

## Implemented

- Reviewed the full hybrid plan, IH01 evidence/portable boundary, current graph readers, retained renderer/account/draft owners, automatic summary and atomic acceptance consumers.
- New Submit protects choices, reuses an existing exact graph or prepares one through the existing intake writer, then calls `review-local` and the shared automatic summary owner. It creates no analysis plan, provider attempt, request grant or copied transcript JSON. It uses the existing raw/curated conversation, bibliography and literal-note readers across selected files/categories.
- Removed account/catalog/model readiness from new local Submit. The model field remains, with contextual description; connection recovery/sharing copy appears for old AI continuation rather than blocking local work.
- Added honest Reading files / Extracting content locally / Preparing summary working states and a small zero-request completion note. No invented progress percentage, request count or usage estimate. Existing AI progress remains confined to old retained plans.
- Nonblank instructions retain their form/files/graph and explain the later semantic-interpretation limitation. Unknown/unread/unsafe selected content produces an honest partial/empty summary; usable independent local findings remain available. No silent instruction bypass or old-recognition fallback.
- Local and historical evidence share automatic choices, exact summary counts/conversation pagination, duplicate/source matching, stale-summary refresh after draft protection, and the existing atomic Accept/receipt/head-refresh owner. Original body/order/source occurrence and source-only origin policies are unchanged. Accept alone creates destination content.
- Cancel latches before subsequent graph/review/summary work, lets the current finite local command settle and keeps preparation. Unchanged Submit reuses graph/review/current manifest; reopen reads saved local review/summary/receipt without writing or sending. Stale local summaries can regenerate their exact manifest locally without a fake plan.
- Retained exact unknown local-review, automatic and commit commands under the existing draft owner. Check status reconciles local review identity, exact automatic operation or acceptance receipt before another explicit action. Transient `review-found.local` identifies local recovery; it is not a persisted format change.

See the [contract](../formats/import-local-evidence-v1.md#ih02--ordinary-submit-and-recovery) and [manual guide](../manual-testing/import-IH02.md). SQL/minimum reader remains **33**; IH01 evidence/review/manifest and all historical provider/commit/transcript/origin/context formats are unchanged.

## Cleanup and retained compatibility

Removed normal Submit's unconditional AI readiness/binding and plan-find/plan-prepare/inference sequence. Removed forced graph rebuilding merely because form intent changed: the existing configuration writer already invalidates changed graph settings. Extracted common draft protection and automatic-summary preparation for both evidence routes, and reused an already-current manifest instead of writing another automatic revision. Removed the local null-plan refresh refusal and irrelevant ordinary AI attention/sharing copy.

Reference inspection confirms the remaining renderer `plan-prepare` adapts a retained valid single-request result; `plan-review`/`plan-start` are reachable only for explicit continuation of a restored historical plan. Stop/protection/reconciliation, account readiness, paged plan readers and frozen AI evidence validators remain necessary for saved old attempts, unknown outcomes and pending acceptance. No second new-selection recognition route remains. IH06 owns settled old-selection transition and removal of its remaining authoring, and IH07 owns the final cross-layer cleanup. No import-only dependency or style became unused in IH02. Historical tests, originals, projects and prior uncommitted changes remain intact.

The React best-practices skill was used for source review of changed components: stable hooks/ref ownership, explicit event actions, bounded lists, accessible labels/status, guarded focus and existing Mantine controls were retained. No runtime/accessibility pass is claimed.

## Required code checks

Pinned Node **24.21.0** / npm **11.19.0**. Inspected scripts and narrow format/lint ignore scope; vendored/generated files and historical test code are protected. The scripts do not run tests, builds or app launches.

- `npm run format`: passed, exit 0.
- `npm run lint`: passed, exit 0, no warnings/errors.
- `npm run typecheck` (node and web): passed, exit 0, no diagnostics.

No automated tests, fixtures, harnesses, builds, app launches, runtime probes, screenshots or benchmarks were created/run. No sample or user project was imported or modified by the assistant.

## Acceptance and limits

Pending user-owned local large-file/disconnected/mixed/category/duplicate content observations, Cancel/reopen/Save/copy and naturally encountered exact recovery, older-project compatibility, layout and accessibility. Source inspection and code checks do not establish provider usage or native runtime success.

Known-reader limits remain finite; unfamiliar structures, arbitrary prose-reference extraction and semantic instructions are not yet implemented. IH03 supplies the mapping interpreter, IH04 AI discovery, IH05 semantic extraction, IH06 usage/legacy transition, and IH07 final integration/cleanup. No quota query, silent model switch or new Re-Analyze behavior. No earlier acceptance or release readiness is inferred; existing release/installed/commercial gates remain unchanged.
