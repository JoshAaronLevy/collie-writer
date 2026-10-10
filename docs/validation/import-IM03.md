# IM03 implementation record

October 9, 2026. **Implementation complete — awaiting user testing.** Josh explicitly requested IM03 after IM02. No prior stage/runtime acceptance is inferred. IM04–IM12 remain unimplemented and require separate requests.

## Delivered

- Shared Write/Research/Project actions Import entry and one retained dialog/controller under existing workspace/draft and account owners. Destination disclosure, whole-original retention, selected names/sizes, categories/instructions, independent saved selections, discard, Keep for later and guarded shared Manage ChatGPT transfer.
- Trusted native multi-file selection and repeated Add files. Exact original-project/frame/process binding; bounded regular-file/UTF-8 reading/hash capture; immediate existing-worker staging/receipts; exact byte duplicates; named unsupported/unreadable/interrupted outcomes. No directory traversal, embedded-path resolution or reference-repo coupling.
- Revision-backed removal/reselection, current-revision file paging, newest-first selection paging, exact local pending writes and picker-outcome reconciliation. Failed native-file retry/abandon retains main path authority until a matching receipt or explicitly abandoned absence; no automatic retries.
- Existing draft registry protects dirty choices/composition/unresolved local work. Metadata-only project-head refresh preserves editor state. Analysis is unavailable; no extraction graph, proposal, final confirmation, provider call or accepted domain content is implemented.

Contract: [import-intake-v1](../formats/import-intake-v1.md). User observations: [manual guide](../manual-testing/import-IM03.md). SQL/minimum reader remains **22**; portable bodies/artifacts/receipts and provider formats are unchanged. Existing preservation consumers continue to own Save/migration/reopen/copy/retention. The list's newest-first ordering is a local read/presentation change only.

## Required code checks

Toolchain: repository-local Node **24.21.0**, npm **11.19.0**. Script and ignore scope inspected before broad formatting; vendored/generated files and historical test infrastructure remain protected. Only the authorized scripts are run.

- `npm run format`: passed, exit 0 on final code.
- `npm run lint`: passed, exit 0 with no warnings/errors on final code.
- `npm run typecheck`: node and web passed, exit 0 on final code; an initial web diagnostic about narrowing `ProjectResult` in a failure message was corrected without suppressions.

## Pending evidence and limits

Source inspection of Mantine’s exit-transition ordering led to deferring the shared Manage ChatGPT transfer until the following frame, after the intake modal is removed. Its native focus behavior remains user-owned acceptance.

No automated tests, fixtures/harnesses, builds/packages, app launches, native picker exercises, browser automation, screenshots, injected failures or runtime verification were added/run. Source review and code checks are not native acceptance. The user owns file intake/reopen/Save/copy, manuscript preservation, cancellation, access changes, close/focus/composition and accessibility observations. Failed-write recovery is production behavior, not fault-injection tooling.

Only completed manifests and settings/revisions are portable. Picker notices and unprocessed native selections are session-only; originals already staged survive input removal. Dirty unsaved instructions remain in the retained window until protected or explicitly restored; no claim of surviving renderer/process loss for those window-only bytes is made. Close pauses unresolved work and never grants new import-write authority. No corpus was imported during implementation. Format 22 migration and existing IM02 flow observations remain pending. Provider/installed/commercial permission and broader release gates are unchanged; release remains **NO-GO**.

Stop after IM03's guide and await Josh's results.
