# AC07 implementation record

October 8, 2026. Scope: save chat references as project Research, preserve provenance and open the existing manuscript citation form. **Implementation complete — awaiting user testing.** See the [plan](../../ai-conversations-implementation-plan.md), [contract](../formats/conversation-sources-v1.md) and [manual guide](../manual-testing/ai-conversations-AC07.md).

- Added contextual Add to Research, selected-text Save reference, Open source and Cite controls. The small review form supports existing bibliographic types, unknown metadata, explicit verification, duplicate candidates, Use existing and deliberate separate-source creation.
- A retained review owner preserves edits across dismissal and freezes uncertain saves. Existing draft guards protect project replacement, Close and access changes. No unsent form is silently persisted or submitted to a provider.
- Reused source normalization, creation and duplicate logic. One worker transaction records the source/link, original reference, immutable receipt and project commit. Exact retries reconcile; candidate changes require review. Existing-source reuse does not rewrite metadata, merge or verify it.
- SQL/minimum reader 21 adds a retained-copy migration from 20, preserving frozen readers. Portable graph, manifest, copy rekey, full-table retention and transcript export retain the new provenance. Merged source identities resolve for presentation; archived chats retain their sources/citations.
- Project-head and source-view refresh preserve dirty forms/editor ownership. Cite captures an exact editor/document/selection, waits for the source dialog to exit and opens ReferenceTools with a preselected source. Its existing explicit Apply citation, stale-document guard, history and protection remain authoritative.
- Research shows paged conversation provenance. No inferred quotation becomes an inspected excerpt; no inference, fetch, attachment, credential or billing change was added.

## Evidence and remaining acceptance

Source inspection covered command validation/access classification, transaction/replay identity, immutable provenance and source merges, bounded readers, migration/rekey/archive/retention consumers, retained draft ownership and citation selection guards. The React best-practices skill informed the retained-state, effects, stale async and accessibility review. Source inspection is not a passed runtime test.

`npm run format`, `npm run lint` and `npm run typecheck` (node and web) passed cleanly on the final code with the pinned Node 24.21.0 toolchain. Initial lint findings and nullable-scope type errors in new code were corrected without suppressions; all three commands were rerun in order and finished without warnings or errors.

No tests, builds, app launches, browser automation, probes or other runtime verification were run. Native migration/Save/reopen/copy, live source quality, citation placement/export, natural uncertain saves and accessibility remain user-owned and unobserved. Prior AC02/AC06 provider milestones are not promoted to acceptance. AC08 remains unimplemented; existing release/commercial/installed-platform gates remain unchanged.
