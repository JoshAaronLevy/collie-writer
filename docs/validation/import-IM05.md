# IM05 implementation record

October 9, 2026. **Implementation complete — awaiting user testing.** Josh explicitly requested IM05 after IM04. Earlier native/corpus acceptance is not inferred. IM06–IM12 remain unimplemented and require separate requests.

## Implemented scope

- SQL/minimum reader **24**, frozen schema 23 and retained-copy migration. Empty external-conversation/message tables with strict v1 bodies, immutable input evidence, separate import/historical dates, visibility, body variants and original-order witnesses. No acceptance writer, fake attempts or seeded content.
- Unified v1 transcript entries, imported-prefix/native-suffix ordering, revision-bound bidirectional cursors, exact targets, bounded slices with original/display mapping and finite Find continuation. Repeated roles remain independent messages; unknown roles stay excluded, internal bodies omitted.
- Shared projection/resolver for staged and accepted reads. Project intake now offers an ordered transcript, original/variant details, long-message continuation and Find. Existing native history/Find remains intact; accepted UI integration and context/memory continuation remain IM11.
- List summaries expose optional external metadata. Existing explicit transcript export can read an external prefix with truthful historical labels before genuine native history. Imported Send/recall remains refused until the later context contract.
- SQL and cross-page evidence admission, exact descriptor/variant correspondence, stable sequence/commit ancestry, protected original hash/text resolution, outer-project rekey, full-row snapshots/retention and archive validation. Earlier import/provider/message/capture formats stay frozen.

Contract: [external-conversations-v1](../formats/external-conversations-v1.md). User observations: [manual guide](../manual-testing/import-IM05.md).

## Required checks

Repository-local Node 24.21.0 toolchain. Script/ignore scope inspected before formatting; vendor/generated and historical test files remain protected. Only format, lint and node/web typecheck were run. Final source outcomes:

- `npm run format`: passed, exit 0.
- `npm run lint`: passed, exit 0 with no errors or warnings.
- `npm run typecheck`: node and web passed, exit 0.

These are source/toolchain checks only; no native or corpus result is inferred.

## Acceptance still pending

No automated tests, fixtures/harnesses, builds/packages, app/dev-server launches, screenshots, browser automation, benchmarks, injected failures or runtime verification were added/run. No corpus was imported or sent to ChatGPT, and no private corpus was copied into the repository. Source inspection and code checks are not native acceptance.

User observations are needed for staged message counts/order, raw/curated variants, dates, exclusion labels, large-message slicing, Find boundaries/navigation, existing native history/export, schema migration, Save/reopen/independent copy, manuscript preservation and accessibility/IME. Accepted imported rows remain absent until IM10; their visible persistence/export/continuation acceptance cannot be claimed in IM05. The schema/readers represent an arbitrary bounded sequence, including the planned 95-user/170-assistant aggregate, without fabricated pairs; actual corpus results remain unobserved.

The current display mapping preserves exact text parts without cleaning provider markers or rendering imported HTML/remote images. Variant selection and order witnesses prepare later explicit review, not implicit acceptance. The existing native paired-history API remains for ordinary chat; unified accepted presentation and new imported context/capture versions belong to IM11. Originals and graphs remain protected portable project data.

Provider/installed/commercial and broader release gates remain unresolved; release remains **NO-GO**. Stop after IM05's guide and await Josh's results.
