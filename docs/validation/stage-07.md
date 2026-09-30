# Stage 7 completion record

September 30, 2026 — **implementation complete — awaiting user testing**. The explicit Stage 7 request authorizes this implementation checkpoint; it does not establish acceptance of Stages 1–6. Stage 8 is not started.

The full implementation plan and applicable repository instructions were read along with the Stage 6 record, native-location decision and actual storage/renderer contracts. The starting Git working tree was clean. Changes were made only in this project.

## Implemented

Startup recovery discovery and local acknowledgment reconciliation; a retained-version/backup catalog; exact-head independent Backup; inspected Restore as a new identity; independent Duplicate; Rename separate from filename; Move retaining the old file; reversible local Archive; Data Locations and bounded size reporting; picker-only cleanup; reviewed/native-confirmed reset with retained local recovery and recovery of reset batches. Cooperative shutdown no longer force-kills the owned writer on a timer.

See the [decision and retention rules](../decisions/stage-07-recovery-and-lifecycle.md) and [user-owned manual guide](../manual-testing/stage-07.md). “Complete” describes implementation, not observed runtime success.

## Changed paths and formats

- `src/shared/project-lifecycle.ts`, `projects.ts`, `project-files.ts`, `file-worker.ts`, `commands.ts`: bounded lifecycle inputs/results, archive flag, native purpose scopes and recovery artifact IDs.
- `src/preload/index.ts`, `src/main/projects-ipc.ts`, `project-files-ipc.ts`: named methods, exact input guards, purpose-bound pickers and deliberate native reset confirmation.
- `src/worker/index.ts`, `projects/repository.ts`: lifecycle dispatch, title mutation/receipt, local organization metadata, retained whole-workspace reset and collision-refusing recovery.
- `src/worker/projects/project-files.ts`, `save-intent.ts`, `snapshot-jobs.ts`: separate backup journal, exact-head capture, Move/Restore/Duplicate/recovery jobs, catalog/size discovery and narrow cleanup.
- `src/main/index.ts`, `storage-worker.ts`: cooperative shutdown and visible slow-shutdown notice; existing close/sleep handshake retained.
- `src/renderer/src/features/projects/Projects.tsx`, `FilePanel.tsx`, `LifecyclePanel.tsx`, `assets/main.css`: management, recovery inspection, reset review and accessible forms/status.
- Plan, README, AGENTS, format notes and this stage's decision/manual/evidence records: updated checkpoint and boundaries.

Archive v1, portable SQL schema 2 and AST v1 are unchanged. Existing schema-1→2 copy migration retains originals/backups. New device-only `organization-v1.json` and `backup.json` records are strictly read and do not enter portable SQL. Existing project responses now include `archived`; all production bridge/worker/renderer consumers were updated. Reset moves closed workspace directories within the same local root; it is not a schema migration or a permanent erase.

## Evidence and pending acceptance

The assistant created no test code, fixtures, mocks, probes or verification scripts. It ran no test suite, typecheck, lint, format check, build/package command, application/server/browser launch, migration, archive operation or manual scenario. Work was limited to source/configuration/documentation inspection and edits plus Git status/diff reads. No checks are reported as passed.

No user results, native artifacts, target OS/cloud versions, runtime observations, interruption outcomes, timing or storage-growth measurements have been supplied. macOS/Windows native behavior, independent clean-machine backup restoration, title/identity preservation, reset/recovery interruption, shutdown ownership and accessibility are unverified. Prerequisite D2/D6 native and archive/performance gates remain pending.

Important limits: startup external files stay availability-unchecked until opened; backups and moves require fresh filenames; Move always retains the old file; Restore only creates independent copies; archived state is local organization; reset retains recovery and does not reclaim its space; cleanup only clears picker history because no disposable content cache exists yet. No permanent recovery purge or blob GC is introduced. Recovery can be lost through OS app-data deletion, disk loss or uninstallers that remove app data. Native directory durability, external writer races, blocked OS I/O and cloud uploads retain Stage 6's limitations. Update installation must use the close handshake in Stage 21.
