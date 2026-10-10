# IM08 implementation record

October 9, 2026. **Implementation complete — awaiting user testing.** Josh explicitly requested IM08 after IM07; no earlier runtime acceptance is inferred. IM09–IM12 remain outside this stage.

Implemented scope and exact bounds: [multipart contract](../formats/import-analysis-v2.md). User-owned observations: [manual guide](../manual-testing/import-IM08.md).

- Deterministic complete eligible-record/text/relationship fragmentation and bounded saved parts, stable original identities, explicit per-part proposal selections, exact portable evidence checks and local conservative consolidation.
- SQL/minimum reader 27 with retained-copy migration and preserved schema 26; full retention/snapshot/archive/rekey consumers. Version-2 capture/packet/proposal/run, direct operation/binding 8, framing 5 and handoff 3 preserve prior readers/digests.
- Main-memory finite grants over the shared AI owner, pre-dispatch Stop guard, one request at a time, protected handoff before advancement, 64-request ceiling and batch lifetime/derived-storage admission. No replay permission survives restart/copy. Remaining analysis excludes every attempted part; reanalysis requires separate explicit review/consent.
- Retained progress with dialog-exit transfer, dismissal/reopening, request disclosure, bounded part/result/group pages, per-file coverage and visible unavailable final import. Selection mutations are guarded while authorized work remains active. Exact uncertain start reconciliation and existing local protection/account recovery owners remain intact.

## Required code checks

Used the pinned repository Node 24.21.0 toolchain. Format/lint/typecheck script scope and ignores were inspected; vendored/generated and historical test files remain protected.

- `npm run format`: clean, exit 0.
- `npm run lint`: clean, exit 0, no warnings/errors.
- `npm run typecheck`: node and web clean, exit 0.

Intermediate findings included an unused union import, inherited private field collision, binding/catalog union narrowing and a missing return annotation. All were fixed without diagnostic suppression or weakened rules. Source review also tightened copy evidence, finite dispatch guards, result storage accounting and progress reopening. These are code-check outcomes, not runtime evidence.

## Pending acceptance

No tests, fixtures/generators, harnesses, mocks, test-only hooks, audit/verification scripts, builds, app/dev-server/browser launches, screenshots, benchmarks, injected failures or runtime verification were added/run. The assistant did not open/transmit the private reference collection. Its documented counts are historical planning context, not a new corpus result.

Josh must still observe live model compliance, complete collection/long-message coverage, duplicate/conflict quality, finite automatic advancement, Stop and reanalysis, dismissal/reopening, native migration/Save/reopen/independent copy, protected output recovery and accessibility. Small-request code consistency does not prove a successful live large import. Final review editing/confirmation and accepted-domain continuation remain later stages. Installed/commercial/provider and broader release gates remain unresolved; release stays **NO-GO**.
