# IU01 implementation and acceptance record

October 10, 2026. **Implementation complete — awaiting user testing.** Josh requested review of the revised plan and implementation of IU01 only. The stage adds automatic worker preparation and its exact summary; the visible simplified interface awaits IU02–IU03. No earlier import UX acceptance is inferred. Release remains **NO-GO**.

## Implemented

- The existing review owner now prepares system-owned decisions and a frozen manifest in one transaction. Original text/relationships remain authoritative; optional metadata/ancillary coverage no longer requires a human acknowledgment for automatic choices.
- Selection uses coherent conversation representations, eligible messages, literal notes, conservative source reuse/consolidation and recorded exclusions. Linked source occurrences share one destination and keep separate origins.
- Read-only summaries derive totals and each conversation's message count from all frozen entries, with bounded conversation paging and empty/already-present/material-omission states. Empty automatic manifests cannot be accepted. A wholly absent valid analysis is an error.
- Exact automatic-operation replay/reconciliation, stale preparation guards and existing atomic acceptance are connected through the shared/main/worker contracts. No inference, accepted domain write or UI is introduced by preparation.
- SQL/minimum reader 31 gates review revision 2 and manifest/entry 2. Existing schema-30 DDL and earlier review/provider/graph/origin/receipt contracts remain readable. Portable validators understand automatic evidence and source links. Same-table copy/retention/archive owners remain in use.

See the extension in [the existing review contract](../formats/import-review-v1.md#iu01-automatic-preparation-extension--october-10-2026) and the [user guide](../manual-testing/import-IU01.md).

## Cleanup and retained dependencies

Removed the duplicate inline fragment-identification traversal from review preparation in favor of the shared evidence reader. Extracted the existing manifest-preparation implementation so manual compatibility and automatic preparation use one writer. No second commit system or new dependency was added.

The old renderer review/intake/progress screens and their commands remain used by the current UI until IU02–IU03. Manual review readers, revision decoding, exact replay and older manifest handling also remain necessary for retained projects. Their presentation and unused command/helper removal are explicitly assigned to IU02–IU04 in the plan; IU01 does not claim the import-wide cleanup is finished. Historical tests, original files and project history were not removed or edited.

## Checks and limitations

Required checks used the pinned Node 24.21.0 toolchain in order: `npm run format` completed successfully; `npm run lint` completed with no warnings or errors; `npm run typecheck` completed both node and web checks successfully. An earlier lint pass reported formatting warnings; they were fixed without suppressions. These command outcomes do not establish native/runtime acceptance.

Source inspection covered the transaction/receipt consumers, source-origin writer, portable review/graph validation, schema/manifest migration and existing copy/retention ownership. This is not runtime evidence. No tests, builds, launches, sample imports, provider requests or runtime verification were performed.

Conservative omissions remain intentional: unresolved identities/order, incompatible metadata, indirect-only source matches and unsupported original bodies are left out. Invalid saved human corrections are preserved and can prevent preparation; IU04 owns recovery presentation. Extraction accuracy, live provider completion, native migration, Save/reopen/copy and source-origin navigation await user observations. The new operation has no standalone UI walkthrough until IU02–IU03; no debug screen or testing hook was added.
