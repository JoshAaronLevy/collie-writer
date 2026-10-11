# IH01 — Deterministic import evidence

October 10, 2026. Scope: [IH01](../../import-hybrid-implementation-plan.md#ih01--make-deterministic-extraction-valid-import-evidence) only. **Implementation complete — awaiting user testing.** Required-check results are recorded below; runtime acceptance is pending.

## Implemented

- Reviewed the full hybrid plan and traced known-reader graph → review/automatic choices → summary/manifest → atomic commit → accepted transcript/source/note/context consumers.
- Added compact local-reader evidence v1 and review v3, referencing retained pages and exact settings/original hashes through the graph. No AI attempt, plan, proposal or copied transcript bodies.
- Added guarded, idempotent `review-local` preparation and reused automatic choices/manifest/commit. Nonblank instructions and implicit conversion of prior AI/manual work are refused. Existing renderer Submit is unchanged.
- Added manifest v3 evidence binding, local candidate admission and honest partial coverage, including zero-page graphs and partially read duplicate selections.
- Added SQL/minimum reader 33 with frozen schema-32 DDL, retained-copy table migration preserving rowids, and archive schema admission. Existing full-table copy/rekey/retention and graph/blob validation owners carry the evidence; accepted-origin/context formats stay unchanged because they bind originals/graph/commit rather than provider plans.
- Kept historical AI validators, prompts/digests, manual history/reconciliation and current authoring intact. Existing prior-turn changes were preserved.

See the focused [contract](../formats/import-local-evidence-v1.md) and [manual guide](../manual-testing/import-IH01.md).

## Cleanup and boundary

Reused the graph/content, automatic choice, identity matching, summary and atomic commit owners instead of adding a second import framework. No unused replacement path was identified for deletion in IH01: existing AI authoring remains called by ordinary Submit until IH02, with unfamiliar/semantic replacement through IH04/IH05 and old-work transition in IH06. IH07 owns the final cross-layer removal pass. Local evidence has no synthetic provider artifacts to clean up. Historical tests, user projects and originals remain untouched.

No new local UI route is claimed. The existing summary-refresh consumer guards manifests without an AI plan; IH02 supplies normal local refresh/orchestration. Mapping/semantic evidence and quota retry remain later stages. No user acceptance of earlier stages is inferred.

## Required code checks

Pinned Node 24.21.0 / npm 11.19.0; repository scripts/ignore scope inspected before broad formatting. Vendor/generated/historical test files remain excluded by the existing narrow scopes.

- Initial format and lint passed. Initial node typecheck found nullable-plan narrowing and schema-33 archive type omissions; corrected without weakening rules.
- Final `npm run format`: passed (exit 0).
- Final `npm run lint`: passed (exit 0; no warnings/errors).
- Final `npm run typecheck` (node and web): passed (exit 0; no diagnostics).

No tests, fixtures, harnesses, builds, app launches, runtime probes, screenshots or automated acceptance were created/run. No user sample or project was imported, modified or used for runtime verification.

## Acceptance

Pending user-owned migration/open/Save/reopen/copy, prior accepted provenance/context and old pending-work recovery observations. Backend evidence/commit behavior has been implemented and inspected in source, not demonstrated at runtime. The visible zero-request route requires IH02. Release/installed/commercial gates remain unchanged.
