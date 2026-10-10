# IM07 implementation record

October 9, 2026. **Implementation complete — awaiting user testing.** Josh explicitly requested IM07 after IM06. Earlier runtime acceptance is not inferred. IM08–IM12 require separate requests.

## Implemented scope

- SQL/minimum reader 26; retained-copy 25→26 migration, frozen older DDL. Dedicated import capture/run tables, exact graph/file/text evidence validation, full-row snapshot/archive/retention coverage and outer-project rekey. Existing import-bearing local working-copy removal stays refused.
- Import capture/packet/proposal/run v1, direct execution/binding v7, framing v4 and import handoff v2. Conversation/proofreading requests, digests and v1 receipts retain their earlier formats. The new adapter shares protected execution/settlement/handoff, native lifecycle and access guards.
- One complete, reviewed selected-input packet: no implicit project context, no binary upload, no tools, no neighboring-file access. Strict complete-request bounds and conservative retained-result/database/disk admission refuse excessive selections before inference. Graph/intake mutations count retained-analysis reservations.
- Terminal raw response retention, strict JSON/evidence validation and atomic proposal settlement. Valid proposals remain distinct from partial/invalid/unknown output, provider failure and local protection failure. No automatic repair, provider replay, alternate account/model, or acceptance write.
- Retained renderer sharing review and explicit consent, after-exit intake/progress handoff, honest state/summary, Stop, exact pending submission recovery, local protection retry, 20-row saved analyses and paged 12,000-unit text. Shared AI work routes import actions to the right owner; account management/diagnostics stay shared. Final import is visibly unavailable.

Contract: [import-analysis-v1](../formats/import-analysis-v1.md). User observations: [manual guide](../manual-testing/import-IM07.md). Request requirements were compared with the official route documentation linked in the contract; that comparison is not live provider evidence.

## Required checks

Used pinned repository Node 24.21.0. Script/ignore scope was inspected; vendor/generated files and historical test code remain protected. Final outcomes:

- `npm run format`: passed, exit 0.
- `npm run lint`: passed, exit 0, no errors or warnings.
- `npm run typecheck`: node and web passed, exit 0.

During implementation the checks identified a malformed type union, a preload subscription name mismatch, union narrowing issues and React purity/component-placement findings. These were corrected without suppressions or rule changes before the final clean pass. Checks establish source/toolchain consistency only.

## Acceptance pending

No tests, fixtures/generators, harnesses, mocks, audit/verification scripts, builds/packages, app/dev-server/browser launches, screenshots, benchmarks, injected failures or runtime verification were added/run. No sample corpus was imported or transmitted. Source inspection is not a passed test.

Josh must still observe a real permitted analysis and the model's strict proposal compliance, sharing boundaries, before-send over-limit refusal, Stop/failure/recovery, exact retry behavior, ordinary conversation/proofreading continuity, dirty-manuscript preservation, migration/Save/reopen/copy and accessibility. Invalid model output remains a retained invalid result; it does not count as live-analysis acceptance. UI/runtime issues discovered during that walkthrough require fixes and another required code-check pass.

IM07 deliberately handles one part only. The complete cultural collection and long-message partitioning belong to IM08; user correction/review to IM09; final atomic import to IM10; ordinary imported-chat continuation to IM11. No release/provider permission, installed-platform readiness or commercial acceptance is established. Release remains **NO-GO**. Stop here for Josh's observations.
