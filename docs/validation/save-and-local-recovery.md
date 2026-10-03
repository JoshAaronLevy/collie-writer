# Save and local recovery correction

October 3, 2026. **Implementation complete — awaiting user testing.**

User evidence: Josh reported external-change warnings after ordinary chapter editing, Save refusal, apparently matching contents on inspection, and needing Save As or force quit. This is a reported failure of the prior implementation, not acceptance of the correction. The exact filesystem event responsible is unknown.

Source changes:

- `src/worker/projects/file-state.ts`: distinct full-content comparison alongside strict file-generation comparison.
- `src/worker/projects/project-files.ts`: content-based saved-status checks; explicit assigned-file Save retains the currently observed target and writes local work without comparing it against the stale saved fingerprint; content changes during the operation still stop publication. Existing mappings and journals require no migration.
- `src/renderer/src/features/workspace/useWorkspaceController.ts`: removes destination idle autosave and close-time Save; retains first-save picker, editor flush, exact operation replay, local protection and last-project reopening. Close cancels a background file check before local protection.
- `src/main/lifecycle.ts`: accepts locally protected close outcomes without requiring a current selected file or separate recovery confirmation. Existing local-dirty, active file-write, AI, timeout and cancellation guards remain.
- `src/shared/projects.ts`, `FilePanel.tsx`, `ProjectLibrary.tsx`, `WritingWorkspace.tsx`, `WorkspaceStatus.tsx`: actionable Save guidance and explicit unsaved-versus-protected status.
- Repository instructions, plans, README and decision notes now point to the superseding Save/close contract.

Work consisted only of source/document reads, edits and Git status/diff reads. No tests were added or maintained. No tests, typechecks, lint, formatting checks, builds, app launches, browser work, login or inference were performed. No user projects or working data were opened or modified by the assistant.

Pending user observations: first-save and cancellation, repeat Save at the same path, idle unsaved state, normal close/reopen with both assigned and unassigned projects, identical-file replacement, older-file replacement and prior-version recovery, missing/unavailable destinations, explicit draft guards, native platform/cloud behavior. The [manual guide](../manual-testing/save-and-local-recovery.md) owns those actions. No acceptance or release gate is marked passed.
