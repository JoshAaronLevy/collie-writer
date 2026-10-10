# IM04 implementation record

October 9, 2026. **Implementation complete — awaiting user testing.** Josh explicitly requested IM04 after IM03. Earlier stage/runtime acceptance is not inferred. IM05–IM12 remain unimplemented and require separate requests.

## Delivered scope

- Strict bounded UTF-8/JSON readers; structural raw/aggregate/curated/message-array recognition; text/Markdown note candidates; existing CSL/BibTeX/RIS parsing adapters. Original bytes, unknown fields, unsupported input and individual file failures remain accounted for.
- Selected-parent-chain ordering, alternate/cyclic/missing-parent coverage, historical time lexemes, external/local identity separation, thread membership and cross-file evidence matching. Raw/curated bodies remain separate variants; source decisions and originating-message pointers are occurrence-specific. Internal reasoning has no previewable text reference. Search/image/widget metadata is not promoted to verified research.
- Immutable graph/page artifacts, exact original locators/text digests, bounded fragments, record/relation paging and text slices. Local Inspect/View controls reuse the retained intake/recovery owner; no provider work or accepted domain mutations occur.
- SQL/minimum reader **23** with frozen schema 22 and retained-copy migration, prepare mutation/revision **2**, graph format **1**, unchanged session receipt **2**. Complete manifest/page/blob semantic admission, Save/Open/snapshot/archive/copy/retention coverage, outer-project rekey and conservative working-copy removal protection.

See the [graph contract](../formats/import-graph-v1.md) and [manual guide](../manual-testing/import-IM04.md). Existing provider/capture/conversation/editor contracts remain unchanged.

## Required code checks

Used the repository-local Node 24.21.0 toolchain. Script/ignore scope was inspected before broad formatting, preserving vendor/generated artifacts and historical tests. Only format, lint and typecheck are authorized checks.

Initial checks identified an unwired preview/action, an unused digest destructuring binding, literal-inferred numeric defaults and a React ref access during render. These were corrected without suppressions or weakened rules. Final source outcomes:

- `npm run format`: passed, exit 0.
- `npm run lint`: passed, exit 0, no errors or warnings.
- `npm run typecheck`: node and web passed, exit 0.

These outcomes establish only the authorized code checks; native and corpus acceptance remain pending.

## Pending acceptance and limitations

No tests, fixtures/generators, harnesses, builds/packages, app launches, screenshots, browser automation, injected failures, benchmarks or runtime verification were added/run. Source inspection and type/lint checks are not observed native behavior. No corpus was imported or sent to ChatGPT during implementation. Only the permitted conversation-data files in the reference repository informed structural reading; no reference-app code, private corpus copies, fixed sample IDs/topics or directory scans were introduced.

The collection's 34-chat identity coverage, Harlow inclusion, overlapping variants, kept/rejected provenance and internal exclusions remain user-owned observations. Record/reference-occurrence totals intentionally include separate evidence representations; they are not accepted-content counts. Unknown JSON and ambiguous bibliography boundaries receive limitations rather than guessed transformations. Bounded metadata summaries retain a pointer to omitted original fields; source snippets and imported grades remain unverified annotations. Full reference quality and normalization are later review work.

Native schema migration, Save/reopen/independent-copy behavior, old-project flows, input limits, manuscript preservation, accessibility/focus/IME and actual collection coverage remain pending under the manual guide. A local-inspection request can outlive its acknowledgment; existing exact receipt lookup/retry ownership remains authoritative. Completed inspection never authorizes a provider request. Installed/commercial/provider and broader release gates remain unresolved; release remains **NO-GO**.

Stop after IM04's guide and await Josh's results.
