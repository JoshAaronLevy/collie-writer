# RF12 — Simpler Import internals

October 12, 2026 — **implementation complete — awaiting user testing**.

Josh explicitly requested RF12 after intentionally deferring it until the other refactor stages were implemented. The full [refactor report](../../refactor-report.md), current repository guidance, [hybrid plan](../../import-hybrid-implementation-plan.md), [recovery contract](../formats/import-recovery-v1.md) and affected source owners/callers were reviewed. Earlier validation/manual records linked by the plans are absent from this checkout; source inspection and the available contracts inform this implementation, without inventing prior acceptance.

## Changes

- [ImportProvider](../../src/renderer/src/features/imports/ImportProvider.tsx) now handles dialog presentation. [useImportSelection](../../src/renderer/src/features/imports/useImportSelection.ts) holds the same retained intake state, exact pending mutation recovery, selected files/settings, draft registration, focus and account transfer. It calls the existing flow hook once within the same mounted provider; no second selection store or provider was introduced. Concrete actions replace rendering callbacks that directly patched state.
- [useImportFlow](../../src/renderer/src/features/imports/useImportFlow.ts) reuses the submitted mapping callback instead of retaining a duplicate ref. Mapping/interpretation share dispatch and cancellation handling; legacy cancellation and saved-summary reads also share their existing paths. Explicit binding/readiness checks, pending operation identity and cancellation-before-advancement remain.
- [import-review](../../src/worker/projects/import-review.ts) retains current review/manifest construction and the local adapters needed for saved historical summaries. [import-review-admission](../../src/worker/projects/import-review-admission.ts) contains stored review/choice/manifest readers and frozen portable admission. Import analysis, graph admission and commit import these readers directly. Read-only manifest access now requires only database/project identity, without a fabricated full write context.
- Review construction no longer builds unused warning paragraphs; the same acknowledgement conditions remain a boolean. Manifest construction reuses its existing record-group index. Portable graph evidence decodes each review once instead of five times; schema admission reuses one schema-version read. These removals accompany the responsibility split rather than leaving duplicate implementations behind.

No product steps or controls were added. Files/categories/instructions/model → Submit → short summary → Accept/Cancel remains the ordinary flow. Known-format copying stays local; unfamiliar structure and necessary interpretation retain bounded own-account requests. Only Accept creates domain content. Results Cancel retains the selection; unchanged Submit reuses saved findings. Reopen, Check status, Save and copies grant no inference or acceptance.

## Compatibility and scope

No migration or persisted format changed: SQL/minimum reader 37, execution/binding 12, handoff 7 and existing review/manifest/graph/capture/receipt versions remain. Exact originals, ancestry, frozen validators/prompts/digests, saved choices, protected outcomes, deduplication and atomic commit remain required. Historical summary adapters are active compatibility code, not obsolete authoring. Save/copy/rekey/retention and manuscript lifecycle owners remain in place.

The existing untracked `cultural-analysis.conversation-sample.json` was neither read nor used. Its exact root path was added to `.prettierignore` before broad formatting to protect user-owned input. Existing vendor/generated/historical-test exclusions were retained; no authored application code was excluded. No data, historical tests or recovery records were removed.

## Source ledger

RF12 is **1,980 added / 1,989 removed = −9 application-source lines** relative to starting HEAD `eddc9d8`. This includes both new modules (869 and 851 lines), so moved code is counted on both sides. Documentation, `.prettierignore`, generated/vendor files and historical tests are excluded. The cumulative authored-source delta against pre-RF01 `2b4307a` is **−4,910 lines**.

The stage is nearly flat by line count. Its improvement is the separation of presentation and retained coordination, a read-only stored-admission boundary, and removal of concrete duplication. The retained compatibility and recovery paths account for most remaining code; no data reader was removed just to reduce this count.

## Required code checks and acceptance

Using the repository's pinned Node 24.21.0 toolchain:

| Command             | Outcome                       |
| ------------------- | ----------------------------- |
| `npm run format`    | Passed                        |
| `npm run lint`      | Passed, no warnings or errors |
| `npm run typecheck` | Passed, both node and web     |

An initial lint finding about exposing the dialog ref through the same object as action methods was fixed by destructuring that ref separately in the presentation component. The clean outcomes above apply to the final source.

No automated tests, builds, app launches, imports, provider calls or runtime/native/browser/accessibility verification were performed. No user-reported RF12 result is available. Source inspection and the three code checks do not establish runtime behavior, import quality, native portability or release readiness. Existing release gates remain unresolved.

Follow the [manual guide](../manual-testing/refactor-RF12.md) with disposable project copies. Stop for Josh's observations; all RF stages are implemented, but user acceptance remains pending.

## User follow-up — October 12, 2026

After a full restart, Josh reported zero conversations and sources for `cultural-analysis.conversation-sample.json`. The [follow-up record](import-curated-envelope.md) documents the reader's missing-provider-ID defect and absent summary reason, their correction, and clean code checks. This supersedes the initial handoff's absence of user results; it does not establish successful acceptance. The [focused retest](../manual-testing/import-curated-envelope.md) remains pending. The RF12 source ledger above is the historical stage delta; the fix adds 34 source lines separately.

Josh's subsequent retest exposed a regression in that fix: the summary's new reason field was omitted from its runtime validator, shutting down storage access on summary restoration. The same follow-up record now documents the protocol correction and paused account-control explanation. Neither the initial fix nor these latest changes has user-confirmed acceptance.

The next retest reached one conversation, nine messages and nine sources but looped on Accept. The follow-up record documents the distinct-span identity collision, confirmed current saved head/review, and correction with retained-copy format 38 compatibility. RF12's original stage scope and source delta remain historical; the correction has its own ledger and manual retest.
