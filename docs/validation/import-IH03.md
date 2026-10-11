# IH03 — Constrained mapping interpreter

October 11, 2026. Scope: [IH03](../../import-hybrid-implementation-plan.md#ih03--build-the-small-mapping-interpreter) only. **Implementation complete — awaiting user testing.** Required code checks and runtime acceptance are separate.

## Implemented

- Reviewed the complete hybrid plan and applicable IH01/IH02, original graph/content/transcript, portable database/blob, migration, Save/archive/copy and retention owners.
- Added an exact, versioned finite mapping contract: typed own-field/index/array paths, per-rule admitted profile scopes, nested current-item rules, original IDs/titles/dates, role aliases, conversation grouping, source occurrences and original body references. Finite source-decision aliases preserve mixed kept/rejected/search/cited records within one collection. No executable language, mapping editor, inference call or new user step.
- Added whole-input field/type/collection profiling with structural variants, first/last examples, original pointers and explicit omitted sample detail. Input/profile/program/derived limits fail explicitly; profiling and interpretation yield and accept cancellation signals.
- Added full local interpretation with explicit missing/type/variant/duplicate/overlap failures, unique admitted original parent joins, proven array/numeric/selected-parent order, retained alternate/broken branches, original source metadata normalization and stable scoped fallback identities. Each output uses the existing graph record/relation/text evidence shape.
- Added compact protected profile/normalization/page families through existing import artifacts and managed blobs. Deterministic result lookup, finite bundle/capacity limits, current selection/head guards and atomic family installation preserve local recovery boundaries. Preparation does not accept conversations, sources or notes.
- Added schema/minimum reader **34**, preserving frozen schema-33 DDL and all earlier import/provider/receipt formats. Existing retained-copy migration, full-table Save/archive/copy/rekey/retention owners include the new family. Portable admission regenerates whole-file profiles, replays mappings against the protected originals and compares complete pages, records, relationships and coverage; orphaned/unknown/mismatched artifacts are refused.
- Added a focused [format contract](../formats/import-mapping-v1.md) and [user guide](../manual-testing/import-IH03.md).

## Cleanup and compatibility

Moved existing original-reference/record/text/fragment emission into one shared reader helper. Known readers and the mapping interpreter now share the same emission rules and digests. Moved the existing original CSL/curated source metadata adapter into one shared production utility, preserving known import normalization rather than copying it. Exposed the existing graph page constructor and shared full-result structural admission; reused the current strict JSON parser, source normalizer, managed assets, blobs and transaction/head owners. No experimental transformation framework, conversion-file export, test hooks or duplicate storage manager was added.

Frozen known graph and intake validators remain unchanged in meaning. Local-reader review v3 and confirmation manifest v3 remain authoritative only for known-reader evidence; mappings cannot masquerade as those results. Historical AI capture/plan/protection/acceptance readers and saved explicit continuation are still required; IH06/IH07 own their remaining ordinary-route transition and cleanup. Historical tests, generated/vendor files, selected originals and projects were left intact, along with prior uncommitted work.

## Required checks

Inspected the repository's format/lint/typecheck scripts and ignore scope. All required commands passed on the final code with the pinned Node/npm toolchain:

| Command             | Outcome                       |
| ------------------- | ----------------------------- |
| `npm run format`    | Passed                        |
| `npm run lint`      | Passed; no errors or warnings |
| `npm run typecheck` | Node and web checks passed    |

Initial lint/typecheck findings in new/shared code were corrected; no diagnostics were suppressed and no rules were weakened. The final documentation checkpoint was formatted after these code checks; application code remained unchanged.

No tests, builds, app launches, provider requests, sample imports, runtime verification, browser automation, screenshots, audits or benchmarks were performed. Source inspection is implementation evidence, not a passed runtime test.

## User acceptance and later work

IH03 is an **internal prerequisite**. Known-format IH02 import is expected to behave as before. Ordinary unfamiliar-file mapping discovery/summary/Accept remains IH04; free-form instruction interpretation is IH05. The new internal preparation functions have no IPC/UI authoring route in this stage. Existing ordinary known-format saving/reopening can be observed now; mapped artifact/runtime cancellation/provider/native portability and the eventual unfamiliar-data quality must be observed through IH04's production flow.

Use disposable project copies for migration/Save/copy observations. Report actual counts, exact error text and original early/late messages/source relationships rather than assuming sample counts. Required checks do not establish runtime acceptance; existing release gates remain unchanged. Stop after the IH03 guide.
