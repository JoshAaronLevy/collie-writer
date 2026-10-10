# IU02 implementation and acceptance record

October 10, 2026. **Implementation complete — awaiting user testing.** Josh requested review of the revision plan and implementation of IU02 after IU01. This stage delivers setup and processing; the short results modal and Accept still require IU03. No runtime or prior UX acceptance is inferred. Release remains **NO-GO**.

## Implemented

- Import uses one compact setup modal: selected filenames with accessible remove buttons, three categories, optional instructions, the connected account's actual model catalog, Cancel and Submit. Retained history, local previews, per-item review, consent checkboxes, request ceilings and payload/part dashboards are gone from this path.
- Setup retains native multi-file selection, protected originals and exact local mutation recovery. Re-selecting a removed retained original adds it back. Cancel protects choices and closes; account management transfers after modal exit without discarding input. Ordinary project Save uses the existing draft flush owner to protect form changes.
- Submit captures scope, choices and displayed account/model. It protects form/project drafts, prepares graph/plan, checks the click-time binding in main and authorizes one finite grant of at most 64 sequential requests. Oversized plans are refused before sending. Main's original guards, reservations, provider isolation and protected handoff remain in place.
- In-place processing announces preparation, analysis, saving and stopping. Cancel latches before awaits and main dispatch; controls also have live mutation guards. Polling and change events read current state without granting dispatch. Failures pause, retaining exact uncertain start/automatic operations. Check status and Try saving again are local recovery actions.
- Settled usable results automatically run IU01. Exact prepared results remain owned for IU03; unchanged Submit reuses a current saved summary without another request. Partial usable work can be prepared after a stopped/failed run, with a brief saved-findings notice. Canceled runs remain paused until explicit Submit. No content is accepted in IU02.
- Setup uses existing Mantine controls/tokens, a 38rem viewport-bounded dialog, one scrolling body and a stable footer. It labels file removal, respects reduced motion, retains composition/after-exit focus guards and does not submit on Enter from the instructions field.

See [the submission extension](../formats/import-analysis-v2.md#iu02-one-submit-extension--october-10-2026) and [the user guide](../manual-testing/import-IU02.md).

## Cleanup and retained dependencies

Deleted these unconsumed renderer files and their entry points:

- `ImportGraphPreview.tsx`, `ImportContentPreview.tsx`, `ImportSourceFields.tsx` and `ImportAnalysisText.tsx`.
- `useImportAnalysis.tsx` and `useImportReview.tsx`, including the old single-request analysis/item-review presentation.

Replaced the multipart dashboard with a retained processing controller; removed saved-batch inventory, pagination controls, selection-discard/keep actions, per-part authorization/reanalysis controls and unused review styles. The former item-review UI became unused when setup was replaced, so its deletion moved forward from IU03. No obsolete screen is hidden under Advanced.

`useImportAnalysisRecovery.tsx` retains only saved v1/v2 attempt status/reconcile/protect/cancel operations used by the shared AI work notice. `ImportTranscriptPreview.tsx` and its bounded transcript styles remain actively used by ordinary Chats/Research/Notes origin navigation. Main/worker old analysis readers, manual decision revision decoding, exact operation reconciliation/replay, confirmation preparation and atomic commit/report contracts remain dependencies for retained projects and IU03 acceptance. IU03–IU04 must trace and remove any supporting mutation routes/helpers that become unused after compatibility is adapted; the import-wide cleanup is not claimed complete. No package/asset was made unused by this stage, no new dependency was added, and retained originals/history/historical tests were not removed or edited.

## Checks and limitations

Required checks completed with the pinned Node 24.21.0 toolchain, in order: `npm run format` succeeded; `npm run lint` finished with no warnings or errors; `npm run typecheck` passed both node and web checks. Earlier lint findings (JSX escaping, explicit return types and reading a ref during render) were corrected without rule changes or suppressions. Script and ignore scope have been inspected to preserve vendor/generated files and historical tests. Source/diff inspection is not runtime evidence. No tests, builds, launches, sample imports, provider requests, browser automation or runtime verification were performed.

The revised import cannot yet be accepted through the UI: IU03 owns summary paging, Cancel/Re-Analyze/Accept and atomic completion. IU04 owns full restart/older unfinished-import adaptation, active-slot retirement and final supporting-route cleanup. Existing shared AI work recovery remains available for retained outcomes; no failed/unknown request is automatically retried. Extraction/provider quality, native persistence, cancellation timing, layout, focus, keyboard/zoom and accessibility await Josh's observations.
