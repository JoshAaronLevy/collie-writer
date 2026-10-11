# RF06 — Unused code and nonfunctional UI

October 11, 2026. **Implementation complete — awaiting user testing.** The full report and current callers were reviewed. This stage implements **D01–D10 and D14**; export simplification remains RF07. Earlier stage progression does not establish acceptance.

## Changes and source evidence

- **D01–D02:** removed the definition-only `copyDocument` helper and `templateNames` map. `readDocument`, schema validation, templates/type names and the actual project/clipboard duplication owners remain. Source searches found no caller of either removed export, including historical tests.
- **D03:** App imports WorkspaceViews directly; the two-line Projects forwarding module is deleted. The existing session/provider hierarchy and retained views stay in place. Projects.css retains its live WorkspaceViews consumer.
- **D04–D07:** removed commented-out attribution markup and its exclusive CSS, unused shell storage selectors, the listed unused AI selectors, and the unmounted compact variant. Shared grouped AI selectors and live responsive styling remain. About/native Help license access, bundled source/notices and licensing obligations are unchanged.
- **D08:** removed the dormant Grok runtime and always-refusing deployment owner. Only AiService consumed the provider registry, always at the fixed Codex entry. Its two call sites now instantiate that same CodexRuntime directly, and the redundant registry is deleted. Current direct ChatGPT execution, Codex/registered compatibility, auth, runtime contracts, operation identities/digests, encrypted historical readers and protected outcomes are unchanged. No provider ID/format/route was broadened, account accessed, binary installed or inference sent. The former Grok research/runbook is explicitly historical.
- **D09:** removed ReviewOptionsDialog and its stylesheet, WritingWorkspace's local selection/context/reset state and callback, and RichDraft's optional prop/wand trigger/import. The dialog had only a disabled Submit and no executor. Actual saved proofreading/findings/correction application and conversation UI remain; chat is not relabeled as review.
- **D10:** removed the disabled Re-Analyze block, its useId/description and exclusive futureAction/responsive CSS. Cancel, Accept, findings, explicit continuation/retry, cancellation, local recovery and atomic acceptance remain with their existing owners. RF06 supersedes older placeholder requirements; no new reanalysis handler exists.
- **D14:** successful startup renders no footer. Loading remains a status message and failure an alert. The retained footer is also visible during focused writing; useful build identity stays in the header and version information stays in About. No new notice owner was introduced.

Current AGENTS/README, provider/privacy documentation and import presentation guidance reflect the removals. Dated implementation/manual records and research are retained as history. No dependency, framework, schema migration or test code was added or removed.

## Boundaries and source size

SQL/minimum reader remains **37**. Portable files, editor/import/conversation evidence and frozen digests, exact pending operations, account isolation, drafts, composition, undo, local protection, explicit Save, copy/rekey and retention/deletion proofs are unchanged. No user project, original, recovery or saved-history data was inspected or changed.

RF06 removes **771 net authored-source lines** relative to completed RF05. Cumulative RF01–RF06 is **−658** from pre-RF01 `2b4307a` (RF01 +968; RF02 −38; RF03 −693; RF04 +22; RF05 −146; RF06 −771). Tracked source contributes −1,765; new untracked source from earlier stages contributes 1,107. Counts include authored src additions/deletions and exclude docs/Markdown, vendor/generated material and historical tests. The cumulative code count is now below the baseline; remaining feature work still must preserve that reduction and simplify actual ownership/behavior.

## Required checks and pending acceptance

Script/ignore scope was inspected before formatting; vendor/generated artifacts and historical testing infrastructure are preserved. With pinned Node 24.21.0/npm 11.19.0, `npm run format`, `npm run lint` and `npm run typecheck` passed cleanly, with no lint warnings and both node/web typechecks passing. The existing React skill/checklist informed direct imports, removal of unused state/props and accessible status/working controls; Mantine remains the UI owner.

No tests, harnesses, audits, builds, app/dev-server launches, browser automation, screenshots, provider calls, benchmarks or runtime verification were performed. Native/content/provider/accessibility acceptance remains user-owned through the [manual guide](../manual-testing/refactor-RF06.md); release gates remain unresolved. RF07–RF18 require separate requests.
