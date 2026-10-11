# IH06 recovery and compatibility record

October 11, 2026 — **implementation complete — awaiting user testing**. Josh explicitly requested IH06 after IH05. The full [hybrid plan](../../import-hybrid-implementation-plan.md), current checkpoints, protected transport/attempt/handoff, portable import graph/review/commit and renderer recovery owners were reviewed. Earlier runtime acceptance is not inferred.

## Delivered

- Specific protected usage/request refusal typing, portable digest-bound refusal records and explicit quota-paused/rate-limited/retry-exhausted tasks. Generic HTTP 429 no longer becomes an account-usage assertion. Terminal streamed refusal and the HTTP metadata wrapper preserve the code; auth, unknown, invalid/incomplete output and local protection remain distinct.
- Explicit bounded Continue retries newly typed refused tasks with fresh identities, at most three lifetime attempts per task and within the existing 8/32 finite phase grants. Successful results remain selected and are not resent. Minimum Retry-After is respected without shortening it or inventing a quota reset. Protection/reconciliation precedes eligibility; no automatic retry or new grant.
- Early local partial summary, clear partial-Accept finalization, Cancel back to the preserved selection and continued use of immutable source evidence under a derived summary. Read-only ancestor progress restores unfinished tasks after Save/reopen/copy without inference authority.
- Quiet Manage usage navigation to the documented ChatGPT settings destination through the existing website confirmation owner. No usage endpoint/meter, API key, billing change, quota reservation or silent model fallback.
- Explicit transition of settled older unfinished selections using retained files/settings and a fresh revision. Earlier manual choices/summaries/originals/receipts stay saved. Ready summaries and exact old commit/output recovery retain their readers; the new summary does not reinterpret old manual edits as automatic choices.
- SQL/minimum reader 37, frozen schema-36 DDL, one strict refusal table, retained-copy migration and full-table project rekey/archive coverage. Execution/binding 12 and handoff 7 use frozen mapping/semantic framing and capture/run/output contracts; new session mutations 5/6/7 distinguish transition and source-evidence reuse. See [the recovery contract](../formats/import-recovery-v1.md).

## Cleanup and source review

Removed the ordinary legacy recognition review offers, finite dispatcher/grants and renderer continuation/pending-start authoring state. Removed obsolete continuation instructions that required selecting already retained files again. Kept saved-plan/partition/proposal/review readers and summary preparation, frozen older journal/binding/handoff validators, exact protected operation retirement and atomic commit receipt reconciliation because saved projects still need them. IH07 retains the final cross-layer compatibility/unused-code integration pass.

New functionality reuses one existing coordinator, journal/protection owner, intake revision writer, graph/automatic review/commit, original reader and safe website opener. Prior uncommitted IU/IH01–IH05 work, historical tests, vendor/generated source, user projects/originals and recovery history were preserved. React source review covered retained ownership, event-driven requests, bounded rendering, accessible named buttons and existing focus/dialog lifecycle. It did not establish visual/accessibility acceptance.

Official OpenAI source research confirmed the [usage-code distinction](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery), [streamed failures](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference), [Usage settings link](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions) and [temporary Retry-After meaning](https://developers.openai.com/api/docs/guides/rate-limits). No provider call or paid probe was performed. Unknown reset windows remain unknown.

## Required code checks

Scripts/ignore scope preserves vendored/generated files and historical tests. Pinned Node 24.21.0 was used. Final outcomes:

- `npm run format` — passed.
- `npm run lint` — passed without errors or warnings.
- `npm run typecheck` — node and web passed.

Intermediate unused imports and type errors were fixed. These outcomes are code checks, not runtime acceptance. No test code, harnesses/fixtures/mocks, test suites, builds, app launches, automated browser actions, sample imports, provider inference, screenshots, benchmarks, dependency audits or fault injection were added/performed.

Use [the user guide](../manual-testing/import-IH06.md). Actual quota/temporary refusal, retry timing and repeated-limit behavior, original fidelity, partial acceptance, older-state compatibility, native migration/Save/copy/reopen and accessibility await Josh. The 1,024 lifetime batch attempts, 256 MiB derived storage and existing wire/output/time bounds still apply. Unsupported semantic instructions/missing context and arbitrary reanalysis remain outside this stage. Commercial/installed/release gates remain unresolved. Stop at IH06; IH07 requires another request.
