# RF02 — Predictable Save and Open

October 11, 2026. **Implementation complete — awaiting user testing.** Josh explicitly requested RF02 and clarified that simplification must reduce unnecessary implementation complexity as well as user steps. The standing instruction and [refactor report](../../refactor-report.md) now record that requirement. RF01 runtime acceptance is not inferred; RF03–RF18 remain unrequested.

## Delivered and removed

- `project-file-presentation.ts` provides one Save label, explanation and action label for the toolbar, library, workspace status, settings summary and project file actions. Dirty editor/form state never becomes a claim that the selected file is current. Inactive rows say **Last saved to…**, without claiming current file availability. Exact pending Save requests retain **Retry Save**; matching active saves show **Saving…**.
- The single-consumer `FilePanel.tsx` wrapper and its old CSS are removed. `ProjectFileActions.tsx` renders the compact file controls directly, with one scoped mount in project actions. The duplicate full-controls panel in workspace status is gone. Shared CSS covers the file path and wrapping actions; repeated library status branches, summary paragraphs and revision-oriented Backup success copy are removed.
- `FileOperation.tsx` derives progress and choices from the existing file job. Routine work has concise progress and available cancellation. Existing local work, explicit saved-version inspection and restore use a focused dialog with the selected file's title/date/path, clear consequences and Cancel. RF01's recovery dialog remains the presenter for file work it initiates.
- `ProjectFiles.open()` directly promotes a fully validated file when no local version exists. The redundant renderer `import` answer is removed from both bridge validators. Existing local projects still require an explicit choice; this stage does not infer that a local version matches a selected file or silently replace local work.
- Save As automatically shows the existing main-owned native replacement confirmation once its exact challenge arrives. The existing consent action remains available if that dialog cannot be presented. Native consent, generation checks and previous-file retention remain mandatory. Known external changes explain that ordinary Save replaces the assigned file with local work, retaining the previous version; Save As remains available.

## Preserved ownership and limits

`useWorkspaceController` continues to own draft protection, exact pending Save requests, terminal-result handling, editor buffers and transitions. No second save controller, workflow engine, database or dependency was introduced. Save, Save As, Backup, normal close, cancellation and recovery still use the established main/worker owners. First Save chooses a location; Save As assigns its new destination; Backup requires an unused filename and leaves the destination unchanged; normal close retains local work without saving the selected file.

Opening retains and validates the incoming archive before promotion, rechecks the selected generation, and keeps atomic promotion and downstream project admission. Opening a file whose project already exists locally deliberately still asks which version to use, even if they might match. Comparing inactive project content to eliminate more choices is not part of this stage. Unknown IPC outcomes retain the exact request rather than silently starting another write. No project content, recovery history, historical tests or frozen validators were removed. SQL/minimum reader **37** and all persisted formats are unchanged. Release gates remain unresolved.

## Source size

RF02's formatted authored-source delta is **−38 lines** relative to the completed RF01 working tree. Cumulative RF01–RF02 is **+930 lines** relative to the pre-RF01 source at `2b4307a` (RF01 was +968). Counts include new/deleted TS/TSX/CSS files and exclude docs/Markdown, vendor/generated material and historical tests. The overall refactor reduction goal remains unachieved. The shared presentation and focused operation component replace duplicated rendering and handlers; the old implementation is removed in this stage. Detailed storage-space errors now use the existing global error presentation after removal of FilePanel.

## Required checks and pending acceptance

Script and ignore scopes were inspected. Pinned Node 24.21.0/npm 11.19.0 ran:

1. `npm run format` — passed, no warnings/errors.
2. `npm run lint` — passed, no warnings/errors.
3. `npm run typecheck` — passed for node and web.

The React skill's source checklist was applied: derived presentation, existing state owners, event-driven file actions, accessible controls, shared dialogs and reduced motion. This does not establish runtime or accessibility acceptance. No tests, harnesses, builds, launches, provider calls or runtime verification were performed. No user project/recovery data was inspected or changed. The [manual guide](../manual-testing/refactor-RF02.md) covers native Save/Open, cancellation, destination policy, retained edits, focus and uncertain outcomes. All those observations remain pending Josh's results.
