# UAT01 — Stable focus and Save feedback

October 6, 2026. **Implementation complete — awaiting user testing.** Implements only UAT01 of the [UAT plan](../../uat-implementation-plan.md). UAT02–UAT05 remain unstarted; release remains NO-GO.

## Changes and source evidence

- `WorkspaceStatus` previously treated any active file job or `checking` state as attention, opening a large panel above Write. The shared presentation predicate now opens attention for a scoped external change, unavailable/interrupted destination, failed job, required consent/choice, or unconfirmed Save. Background checks remain enabled in main/worker. Confirmed cancellation does not create a failure banner.
- `SaveMenu` uses a scope-matched Save presentation derived from the controller's explicit action interval, retained request and worker job. Its primary control reserves width, reads **Saving…**, is disabled and exposes `aria-busy` during local flush, picker, dispatch, progress and acknowledgment. Backup/check activity cannot impersonate a Save. Native File → Save uses the same controller path.
- An unconfirmed request shows **Retry Save** and an explanation. Retry preserves its exact operation ID, minimum head, destination generation and token. Save As cannot replace that unresolved request. Only a matching terminal job or the existing authoritative rejection path settles it; a thrown/unavailable reply does not claim success. A later matching terminal event also settles a retained request after the original caller has returned. The pre-existing explicit retry behavior reconciles the old Save before capturing newer edits.
- The existing `pendingSave` owner now registers with the retained draft registry as an operation. Section navigation no longer clears it, and project replacement, close and access transitions cannot silently discard it. Save preparation and presentation add no second job owner or persistent request format. Normal close still protects local writing without starting a destination Save.
- Write's **Save and local protection** disclosure has a stable summary; details contain existing protection/file status, bounded phase/byte progress, Cancel when allowed and the original file actions. Outside Write, a persistent collapsed file-status disclosure keeps long jobs reachable, including from Settings/Projects. Project actions no longer removes its normal file panel during a check or Save. File-panel heading IDs are instance-specific. Rejected cancellation/choice/consent calls report uncertainty without clearing the job.
- Write no longer renders its Back link. Research/inspector/Settings return controls and the app's Return to work retain existing captured destinations. The prior setup-acquisition fix remains intact. No editor key, manuscript payload or destination is replaced by routine Save/status updates.

The source review also followed `RetainedRegion`, `RichDraft`'s editable-state effect, the native picker/focus recheck path, and startup ChatGPT prompting. The focus recheck changes file status, not navigation. Save does not select a new editor; retained navigation focus still depends on actual navigation, and startup prompting retains its existing activity/modal/focus guards. No additional route defect was established in those paths. This does not prove that every reported flicker has the same cause.

A terminal file event can precede the original request's running reply. `applyFiles` now rejects that stale running snapshot using the existing bounded finished-job cache, so the late reply cannot restore an already-settled Saving indicator or old destination status. This does not invent a new outcome or job owner.

## Scope and compatibility

Changed renderer owners: `project-file-presentation.ts`, `FilePanel.tsx`, `ProjectFileActions.tsx`, `SaveMenu.tsx`/CSS, `WorkspaceStatus.tsx`, `WorkspaceViews.tsx`, `WritingWorkspace.tsx`, and `useWorkspaceController.ts`.

SQL/minimum reader 13, editor/archive 1, compilation 3, selected-file journals, credentials and AI formats are unchanged. No dependency, IPC, worker publication/retention, native consent or cleanup policy changed. The 900 ms/5-second local protection and explicit Save contract remain. Later typing remains distinct from the captured file head; the details disclosure retains that distinction. Chapter semantics, caret restoration across item changes/restarts, split-button icons, subtitles and the review-options dialog belong to later UAT stages.

## Required code checks

After inspecting package scripts and formatter/linter scope, ran in order:

1. `npm run format` — exit 0; no formatting warnings/errors. Existing ignores preserved vendor/generated artifacts and historical tests. The UAT plan's tables were normalized by the formatter.
2. `npm run lint` — exit 0; no warnings/errors.
3. `npm run typecheck` — exit 0; node and web targets both passed without diagnostics.

The React best-practices source checklist covered stable editor ownership, derived Save presentation, existing event-driven request ownership, effect dependencies, accessible busy/disabled controls and unique disclosure-panel headings. This was source review, not runtime testing.

No tests or test code, builds, app launches, screenshots, runtime probes or manual acceptance were performed by the assistant. The [manual guide](../manual-testing/uat-UAT01.md) belongs to Josh. Native picker/Save/cancellation, remaining flicker, continued typing, focus/zoom/accessibility and naturally occurring failure/reconciliation paths remain unobserved. No user acceptance is recorded.
