# IM06 implementation record

October 9, 2026. **Implementation complete — awaiting user testing.** Josh explicitly requested IM06 after IM05; earlier runtime/corpus acceptance is not inferred. IM07–IM12 require separate requests.

## Implemented scope

- SQL/minimum reader 25 adds immutable imported source-occurrence/note origins; schema 24 remains frozen with retained-copy migration. AC07/live attempt provenance and prior import/capture/message contracts remain unchanged.
- Read-only source/note destination preparation uses protected original fields, existing bibliography parsing/normalization/candidate matching, bounded canonical merge resolution, removed-source disclosure, connected strong-identifier groups and explicit metadata conflicts. Occurrence decisions/grades stay independent of destination grouping and verification.
- Literal note conversion retains original text, unspecified/declared unverified authorship, supported label proposals and loss notices. Imported note origin is distinct from native human notes. Notes do not infer manuscript/source links.
- Scoped category counts and bounded UI pages with original-record/message navigation. Existing transcript preview and text slices remain available. No automatic fetch, model call, accepted record or final-confirmation bypass.
- Internal worker-only transactional writer preparations, explicit destination/metadata choices, exact existing-source revisions, note labels/explicit local links and occurrence receipts. No IPC exposes these writers; IM10 still owns review-bound confirmation, operation receipts/replay and atomic settlement.
- Portable SQL/graph evidence admission, initial note revision/text digest preservation, project rekey, full-row retention/snapshot/archive coverage, accepted-origin read contract and truthful bibliography export losses.

Contract: [imported-content-v1](../formats/imported-content-v1.md). User observations: [manual guide](../manual-testing/import-IM06.md).

## Required checks

Pinned repository Node 24.21.0; script/ignore scope inspected. Format protects vendor/generated files and historical test code. Final source outcomes:

- `npm run format`: passed, exit 0.
- `npm run lint`: passed, exit 0 with no errors or warnings.
- `npm run typecheck`: node and web passed, exit 0.

An initial React cleanup warning was corrected before the clean final pass. These are source/toolchain checks only, not native/corpus acceptance.

## Acceptance pending

No tests, fixtures/generators, harnesses, audits, builds/packages, app/dev-server/browser launches, screenshots, benchmarks, injected failures or runtime verification were added/run. No sample corpus was imported or sent to ChatGPT. Source inspection does not establish runtime acceptance.

Josh still needs to observe occurrence decisions/repeats, missing metadata, matched/merged/removed sources, category counts, literal note text/labels/losses, pagination, access/error/navigation behavior, native migration/Save/reopen/copy, manuscript preservation and accessibility. Accepted source/note writes/readback/edit history/export require the later real confirmation path; no fake rows were seeded to exercise them.

Release remains **NO-GO** with existing provider/installed/commercial and broader acceptance gates unchanged. Stop after the IM06 guide for Josh's results.
