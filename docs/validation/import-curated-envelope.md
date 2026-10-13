# Import follow-up — curated conversation without a provider ID

October 12, 2026 — **user testing exposed a further acceptance failure; span identity correction implemented, awaiting user testing**. Earlier findings and check outcomes below are historical. The latest diagnosis supersedes the earlier seven-source/local-only expectation for this sample.

## Report and cause

Josh restarted the app and imported `cultural-analysis.conversation-sample.json`. His screenshot shows local processing, zero conversations, zero sources, disabled Accept, and an unresolved-work notice promising a reason that was absent. This is a user-reported failure, not acceptance of RF12 or the hybrid Import stages.

Ordinary inspection of the supplied original finds one titled envelope containing nine ordered messages (five `You`, four `LLM`) and seven distinct references in `sources.kept`. It has no `conversation_id` or thread inventory. Its retained `message_counts.total` says 265, but only nine messages are actually present; metadata must not manufacture additional messages.

The local curated reader recognized the format but required an exported conversation ID. It marked the envelope unresolved, could not attach the messages, and consequently withheld their source references. Discovery did not request AI mapping because the file was already recognized as curated data. The summary omitted the stored reader issues. Restarting could not correct either source behavior; an unchanged selection also deliberately reuses saved findings.

## Implementation

- `src/worker/projects/import-readers/graph.ts`: an envelope without thread descriptors or any declared conversation IDs receives a local identity derived from the original SHA-256, JSON pointer and record kind. Its external original ID remains null; the internal membership key uses the `curated:` prefix. Nested messages keep array order, original roles, text, timestamps and message IDs. Existing source extraction preserves reference occurrences and message links. Explicit thread claims still need their existing resolution; this does not turn bare message arrays into guessed conversations.
- `src/worker/projects/import-normalization.ts`: the existing unresolved-record predicate returns its records, allowing coverage counts and summary explanations to share exactly the same category filtering.
- `src/worker/projects/import-review.ts`, `src/shared/import-review.ts`, and `src/renderer/src/features/imports/ImportResults.tsx`: the transient summary includes the first available file, unresolved-record or exclusion reason, with a fallback when no specific reason is available. Results display it without promising an absent explanation. Existing prepared evidence supplies the reason; no new storage owner or request is introduced.

No SQL, graph, review, manifest, receipt or protected-operation version changes. Earlier stored findings and validators remain intact. Only Accept writes destination content. The supplied JSON, historical tests, existing RF12 changes, user projects and recovery data are preserved. The new local identity is scoped to unchanged original bytes and location; it is not a claim of provider identity across edited exports.

This follow-up adds **34 net application-source lines**, separate from documentation and relative to the starting RF12 worktree. The addition fixes missing-ID membership and surfaces existing omission evidence. The resulting cumulative source change against pre-RF01 `2b4307a` is **−4,876 lines**; the RF stages' historical ledger remains −4,910.

## Code checks and pending acceptance

Using the repository's pinned Node 24.21.0 toolchain, `npm run format`, then `npm run lint`, then `npm run typecheck` completed successfully, with no warnings or errors; both node and web typechecks passed. Formatting scope already excludes the supplied original, vendor/generated artifacts and historical tests.

No tests, builds, app launches, actual imports or runtime verification were performed. The expected fresh-import result is one conversation, nine messages and seven sources with both categories selected and blank instructions. See the [manual guide](../manual-testing/import-curated-envelope.md). Retesting, Accept, source links and Save/reopen remain pending user observation.

## Follow-up: opening retained Import shut down storage

Josh subsequently reported that opening Import disabled Add files and Submit, followed by Storage unavailable, an unconfirmed Save, and disabled ChatGPT controls. Four supplied screenshots document this regression; the original retest did not pass.

The previous change added `ImportSummary.reason` and emitted it from every summary, but omitted it from `isReviewValue`'s exact runtime key list. Source inspection establishes this path:

1. Restoring Import reads the retained summary before any new Submit or provider request.
2. `isProjectValue('importAnalysis', ...)` delegates through `isAnalysisValue` to `isReviewValue`. The extra `reason` key makes the reply invalid even when its value is null.
3. `StorageWorker` treats the invalid reply as an unavailable worker, rejects pending requests, and requests cooperative shutdown. Save and Import then cannot confirm their operations.
4. The workspace becomes unavailable; ChatGPT account controls depend on that availability and are disabled. Their message incorrectly described this as missing storage setup.

The corrective change in `src/shared/import-review.ts` admits the exact summary fields and validates `reason` as null or a string of at most 4,000 units, matching retained graph issue bounds. An exhaustive `Record<keyof ImportSummary, true>` now supplies the key list, so a future added or removed summary field without a corresponding key-list update fails typecheck. This is production validation; unknown fields and invalid field values remain rejected.

`ChatGptConnectionDialog.tsx` now distinguishes unavailable storage, a missing working folder and storage still becoming ready. It does not enable account writes against unavailable storage. No storage shutdown/retry policy, acceptance authority, database, credentials, saved import graph or recovery receipt is changed. No user data was read or altered in diagnosing this regression.

The earlier format/lint/typecheck success did not establish protocol or runtime correctness. The earlier claim of implementation completion is superseded by this reported failure and corrective handoff. The updated [manual guide](../manual-testing/import-curated-envelope.md) begins with reopening the existing project and its retained Import, before a fresh sample import. Recovery of the prior unconfirmed Save still requires its existing user-visible status check; this change does not mark that Save successful.

Correction code checks, using pinned Node 24.21.0: `npm run format`, then `npm run lint`, then `npm run typecheck` all passed without warnings or errors; both node and web typechecks passed. No test code, tests, builds, launches, runtime probes or deliberate invalid-message injections were added or run. **Implementation complete — awaiting user testing.**

This correction adds **7 net source lines**, excluding documentation: four for the complete, typed summary key list and reason bound, and three for accurate storage-state copy. Combined with the initial +34-line fix, the follow-ups add 41 lines; cumulative authored source is **−4,869 lines** against pre-RF01 `2b4307a`. The original RF-stage ledger remains unchanged.

## Follow-up: Accept repeatedly claims the project changed

Josh's next screenshot shows one conversation, nine messages, nine sources and two saved ChatGPT attempts. Accept repeatedly returns “Your project changed. Review the updated summary and Accept again.” Save As does not resolve it. This is a further user-reported failure, not acceptance.

Read-only inspection of the existing local SQLite file (no app execution or writes) found that the latest manifest's expected project head and review revision both match current state, and there are zero accepted import receipts. Its saved semantic result contains two source extractions from the same response range, at offsets 561–607 and 1257–1300. No manuscript text or account secrets were needed. This diagnoses the saved state; it does not establish runtime success of the correction.

The semantic graph distinguishes those exact spans, but `importIdentity` reduced every source in one original JSON string to `[kind, file hash, JSON pointer]`. Acceptance found an in-batch duplicate and threw `STALE_REVISION`. The renderer then reused the still-current manifest and unconditionally claimed it had refreshed a changed project. Each Accept therefore repeated the same failure. Seven sources come from structured `sources.kept`; the two saved prose extractions explain this summary's nine sources and two attempts. The earlier claim that this sample must finish entirely locally with seven sources was incomplete.

The correction changes:

- `import-identities.ts`: semantic source/note acceptance identities include their exact original text spans. Structured references and provider message/conversation identities keep their existing formulas. Fingerprints, graph records and original text stay unchanged.
- `import-commit.ts`: genuine changed heads/reviews still refuse stale acceptance. Inconsistent saved findings or duplicate items inside one summary now return a specific application-error explanation, rather than claiming that user writing changed. Exact outcome lookup remains ahead of all current-state checks.
- `migrations.ts`, `schema.ts`, `manifest.ts`: SQL/minimum reader **38** preserves schema-37 DDL. The existing retained-copy migration validates old receipts using their frozen pointer-only identity, rekeys only already-accepted semantic index rows, and validates the candidate using span identities before publishing it. Originals, saved analysis, choices, manifests, receipts, operation IDs and destination content are not rewritten. An unaccepted summary requires no fresh analysis. Saved schema-38 files require this updated reader; older builds refuse them as too new.
- `shared/projects.ts`: the import-specific validation context is admitted through the existing exact error protocol. The message says nothing was imported and asks the user to retain/report the findings for a fix, rather than retry analysis or Save As.
- `useImportFlow.ts`: summary recovery takes precedence over the discovery status branch; a refresh must actually produce a new summary before asking for another Accept. A real refresh clearly says it used saved findings and sent no new analysis.

Only Accept commits destination content. No storage reset, source deletion, fresh provider request or user-data mutation was performed by the assistant. No test code, tests, builds, launches or runtime acceptance were performed. Code checks and the source ledger are recorded below; use the updated [manual guide](../manual-testing/import-curated-envelope.md).

Final correction checks with pinned Node 24.21.0: `npm run format`, then `npm run lint`, then `npm run typecheck` all passed without warnings or errors, including both node and web typechecks. These results apply to the final source, including the semantic source/note scope guard and error copy. **Implementation complete — awaiting user testing.**

This acceptance correction adds **58 net application-source lines**, excluding documentation: nine for exact-span identities and the frozen old formula, 31 for retained-copy migration, seven for schema/manifest compatibility, three for the admitted error explanation, and eight for summary recovery. Commit validation is reorganized with no net line change. The additions correct observed acceptance failure and preserve existing accepted history; there is no new workflow or storage owner. All three follow-ups total +99 source lines; the cumulative authored-source delta against pre-RF01 `2b4307a` is **−4,811 lines**, including untracked authored modules. The RF stages' original −4,910 ledger remains historical.
