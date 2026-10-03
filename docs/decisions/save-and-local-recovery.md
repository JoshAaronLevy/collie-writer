# Explicit Save and local recovery

October 3, 2026. **Implementation complete — awaiting user testing.** This requested bug fix supersedes the destination-autosave, saved-fingerprint overwrite veto and destination-save-on-close rules in the earlier Stage 6/7 and I03/I06 records. It does not advance an improvement or AI stage.

## Report and source findings

Josh reported that editing a chapter produced an external-change warning, Save refused, and inspecting the file appeared to show the same project. Save As or force quit were the only usable exits in that session. He requested ordinary Save to publish the current editor's local project, first Save to ask for a file, and close/reopen to preserve unsaved work without writing the selected file.

Source inspection found that status and assigned-file Save required the stored fingerprint to match device, inode, size, nanosecond mtime/ctime and SHA-256. A metadata-only change or identical file replacement could therefore report a content conflict. The exact filesystem event in Josh's session has not been observed. The renderer also scheduled a destination save after 30 seconds idle and tried another Save during close; main required a separate recovery confirmation if that save failed. These behaviors conflicted with the requested manual-save semantics.

## Current contract

- Save first flushes the live manuscript and existing eligible draft owners through their local commit boundaries. With no selected destination, the same native picker used by Save As opens. Cancelling it keeps local work and leaves the destination unassigned.
- For an assigned destination, explicit Save takes the currently observed file as the version to retain, then replaces it with a coherent capture of local work. A mismatch with the previous Save's fingerprint cannot veto this action. A missing file can be recreated at the assigned path if its parent remains available and safe.
- Status compares full file content hash and size with the saved baseline, so metadata-only changes and byte-identical replacements do not create an external-change state. Actual content differences remain visible with the instruction that Save writes local work.
- The assigned-file save's comparisons between observations also use hash and size. If contents change after the operation starts, Save stops rather than replacing a version it has not retained. Each observation still requires a stable regular-file read; path, volume, symlink/hardlink, size and local-root restrictions remain. An ungranted parent-path redirection is refused. Save As replacement of an unrelated existing file retains its generation-bound native confirmation. Backup and Move still require unused names.
- Previous files are retained beside the destination before replacement and remain inspectable through Data and recovery. Sibling staging, complete archive validation, intent journals, minimum-head capture, exact retries, atomic replacement/exclusive creation, reopen-before-acknowledgment and interrupted recovery remain in place. Reconciliation can recognize an exact candidate despite changed metadata; it never replays a write.
- The selected project file has no idle autosave. The existing 900 ms manuscript debounce and 5-second local-protection fallback remain. Subsequent typing during an explicit Save stays pending unless included in that Save's captured head.
- Close and update shutdown protect local writing and settle active operations without initiating Save or showing a file picker. The renderer cancels an active background file check before its local close flush, and does not request a new destination check. Main accepts a protected local outcome without an extra recovery confirmation; a background check is not a file-write blocker and still settles through orderly worker shutdown.
- Restart opens the existing device-local working project/section through the retained last-project hint. A local head newer than the selected file remains visibly unsaved until explicit Save. A never-saved project remains destination-null. No new recovery format or second copy of the editor is introduced.

## Boundaries

Existing explicit research/details/conversation drafts, composition, unresolved operations, failed local protection and active AI work still use their established close guards. This change does not promise to persist every unsubmitted form. Force quit or power loss can still lose unacknowledged keystrokes; normal close waits for local protection. Recovery depends on retaining this device's working data.

SQL/minimum reader 13, AST/archive 1, compilation 3, destination-v1 and save-intent v1 are unchanged. Old journals, mappings, originals and snapshots remain readable. No dependencies, IPC shapes, provider behavior, release gates or cleanup policy changed. Native save, close, reopen, cloud and accessibility behavior remain unobserved; release remains NO-GO. The existing final comparison/rename race against an external writer is unchanged.

See the [implementation record](../validation/save-and-local-recovery.md) and [manual guide](../manual-testing/save-and-local-recovery.md). No assistant tests, checks, builds or launches were performed.
