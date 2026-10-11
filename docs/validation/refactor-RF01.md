# RF01 — Direct, understandable recovery

October 11, 2026. **Implementation complete — awaiting user testing.** Josh requested a thorough review of the complete [refactor report](../../refactor-report.md), followed by RF01 only. No previous stage acceptance is inferred. RF02–RF18 remain planned.

## Delivered

- One recovery notice opens **Project recovery** directly. It identifies the affected title when known, distinguishes unavailable/changed files, unreadable projects, interrupted Save/Backup publication and failed discovery, and names unknown causes honestly. The duplicated library warning and settings detour were removed with their unused selectors.
- Opening the dialog reads and reconciles existing local file records. A confirmed outcome clears its exact issue; **Later** changes no durable recovery state. Healthy reset batches and attempts durably stopped before publication remain history, not recurring alarms. No unreadable operation with unknown ancestry is attributed to every open project.
- **Save a copy…** uses the existing new-filename Backup route, protects pending drafts, and leaves the existing file and Save destination intact. Unknown pending Saves and actual active writers remain blockers. **Inspect version** validates a retained version, shows its recorded date/title, then offers **Recover a copy** within the same dialog. **Open backup…** uses that independent-copy flow. Originals remain retained; successful recovery opens the independent project.
- Project listing carries bounded title hints and known workspace identity for individual failures. Hints cannot authorize opening, writing or deleting. Reset history displays known project titles before **Restore projects**. Unknown names remain explicit.
- Local diagnostic details are available for deliberate copying, without manuscript text or automatic transmission. The viewport-bounded dialog uses existing Mantine controls, shared reduced motion and guarded focus; unrelated editor/draft owners remain mounted. Local protection failure copy now describes unsaved changes rather than promising their safety.
- Broad `DENIED`, `PROJECT_LOCKED` and `UNAVAILABLE` messages no longer assert an unproven permission failure, competing process, or rollback. Optional transient error context distinguishes a missing active owner, active file work, and failure to acquire the actual project ownership lock.

## Owners and compatibility

`shared/recovery.ts` defines strictly validated transient issues with stable identities, project/operation context, cause, permitted actions and outcome. `project-lifecycle.ts`, `projects.ts`, trusted main IPC, preload, worker routing and the existing capability classifier expose `reviewRecovery` through the lifecycle API. It is a local recovery/read capability, never new editing or inference authority.

`worker/projects/file-recovery.ts` shares the exact acknowledgment logic between ordinary file checks/reopening and the recovery dialog. Durable `capturing`/`staged` intents precede publication and are retained without unresolved-publication warnings. `replacing`/`replaced` intents remain unresolved until an exact prior acknowledgment or matching hash, archive identity, snapshot, head and stable bytes prove the outcome. Only a proven owned staging hard-link alias is removed. A later destination mapping is never rolled back. Backup acknowledgment updates `backup.json`, never the Save destination. Invalid or unreachable output remains unresolved; no publication is retried automatically.

`ProjectRepository.withRecoveryProject` holds the existing serial/lock/admission boundary and preserves the active editor owner while inspecting another project. It refuses conflicting work. No alternative recovery database, operation framework or authority-bearing discovery cache was introduced. `ProjectFiles.overview` retains bounded diagnostics for operation, snapshot, reset and result-limit failures. Available versions remain subject to full archive admission when selected.

The recovery renderer owns only dialog presentation. `useWorkspaceController` still owns dirty buffers, pending Save identity, file operations and project transitions. Exact recovered Save destination identity can retire that same pending renderer Save; reopening/checking does not start another write. Independent-copy actions reuse the existing flush, native picker, admission, retained-result and atomic promotion owners. Generic recovery does not settle AI/import work; those feature owners remain in place for RF11/RF12.

SQL/minimum reader **37**, archive/editor formats, `save.json`/`backup.json` version 1, historical import/AI validators and all saved project data remain unchanged. `ProjectList`, `DataLocations`, optional error context and inspection date are transient bridge changes only. No migrations, dependencies, deletion policy, current AI route or release gates changed. Full library admission still occurs; lightweight discovery belongs to RF04.

## Required code checks

Script and ignore scopes were inspected before formatting. Vendor files, generated output and historical testing material remain excluded; the scripts contain no test/build/launch hooks. Pinned Node 24.21.0/npm 11.19.0 are used.

- `npm run format` — passed, with no reported warnings/errors.
- `npm run lint` — passed, with no warnings/errors.
- `npm run typecheck` — passed for both node and web targets.

These are code-check results only. The React skill's source checklist was applied to retained state, event-driven work, named controls and focus guards; no runtime or accessibility acceptance is inferred.

## Unverified behavior and limits

The [user guide](../manual-testing/refactor-RF01.md) owns native file access, actual interrupted-operation recovery, copied-project fidelity, retained drafts, keyboard/focus, increased zoom and accessibility acceptance. No tests, fixtures, harnesses, audits, builds, launches, provider requests or runtime verification were performed. No user working/recovery directory or project data was inspected or changed. Josh's particular original warning cause remains unestablished until observed through the new UI.

An unreadable project/operation cannot be promised repaired. An unavailable external file can remain unresolved after saving a separate copy; that copy does not establish what happened to the earlier publication. Selecting a retained version may reveal that it is missing, changed, invalid or too new. Unknown pending writers are never bypassed. Confirmation may need another explicit local retry after a transport timeout; no timeout is treated as rollback. Existing AI/native/commercial/release gates remain unresolved.
