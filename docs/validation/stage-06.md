# Stage 6 — Native Save/Open, chosen locations and conflicts

September 29, 2026. **Implementation complete — awaiting user testing.** Stage 7 is not started. The explicit request authorizes this stage; it does not establish user acceptance of earlier stages or waive P7.

Reviewed the full implementation plan, stage dependencies and exclusions, storage/command contracts, current guidance and Stage 5 evidence against a clean starting Git checkout. Preserve the existing toolchain, archive v1/SQL 2/AST 1, resource notices and required citeproc attribution. No dependencies were added or installed.

## Changes

| Paths                                                                                       | Implementation                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/{projects,project-files,file-worker,commands}.ts`, `src/preload/index.ts`       | Strict named file commands/results/events, bounded progress/inspection and destination summaries; renderer receives opaque selection tokens                                                                         |
| `src/main/{project-files-ipc,lifecycle,index,menus,storage-worker}.ts`                      | Window/frame/purpose grants, native pickers/overwrite confirmation, independent picker hint, file commands and native shortcuts, close/suspend/resume coordination                                                  |
| `src/worker/projects/{project-files,file-state,save-intent,destination-volume,incoming}.ts` | Worker file coordinator, generation observation, journal/reconciliation, sibling staging/previous retention, filesystem eligibility, streamed cloud reads, independent incoming promotion, Locate and watcher hints |
| `src/worker/{index,projects/repository,projects/snapshot-jobs}.ts`                          | Short file-operation starts outside IPC queue, active-workspace guard, destination acknowledgment, snapshot completion/subscriptions and safe shutdown                                                              |
| `src/renderer/src/features/projects/{Projects,FilePanel}.tsx`, styles                       | Save/Save As/Open/Recent/Locate, inspected copies, bounded status/cancel, 30-second destination autosave, serialized flush/retry, exact saved revision and close handoff                                            |
| Plan, README, AGENTS, archive format documentation                                          | Current scope/status and Stage 7 prerequisites                                                                                                                                                                      |

The [decision record](../decisions/stage-06-file-locations.md) specifies replacement and permission boundaries, retention and race windows. The [manual guide](../manual-testing/stage-06.md) supplies user actions and observable outcomes. Model/effort recommendations and stable stage numbering are unchanged.

## Persistent data and limitations

No SQL/AST/archive migration is introduced. Existing workspaces gain an optional strictly versioned `destination-v1.json` only on acknowledged save/import/Locate; absence remains null. `settings/picker-v1.json` is a hint, not a mapping. Per-operation save journals and retained incoming files live under the checked local root. Existing schema-1 catalog rows remain intact and unused for new mappings; the portable snapshot reads the authoritative workspace destination as its parent lineage.

Original archives remain untouched during Open. Independent incoming copies rewrite project ownership on an isolated database and record origin locally; the original project/working branch remains. Full general Duplicate/Restore, cleanup and historical payload comparison stay in Stages 7/9. Existing interrupted snapshot leases and candidates remain conservative.

Replacement uses a flushed, validated sibling. Existing targets retain a separately copied/re-read previous file before same-volume rename; absent targets use exclusive hard-link publication. A replacing/replaced journal can finish acknowledgment only after exact hash plus full archive inspection. Missing/ambiguous/corrupt situations retain files and surface uncertainty; inaccessible earlier paths do not block an independent Save As.

Unavoidable existing-file check-to-rename and post-ack external races remain. Watchers can miss events; Save/open/focus/resume revalidate, and there is no cross-machine exclusion or cloud-upload claim. The local single-instance/workspace lock does not exclude other apps/channel profiles. Supported filesystem detection is a production read-only query, not proof of crash durability. Windows directory flush and both platforms' native/cloud replacement behavior remain pending release evidence.

Large-file work performs multiple hash/validation/copy passes and can retain substantial disk usage. Full stage/final extraction copies coexist during Save; free-space checks do not reserve capacity. Previous archives accumulate until Stage 7 retention work. Synchronous SQLite validation and blocked OS hydration may delay cancellation. Sleep flush is best effort, because the OS need not wait. No performance budget is accepted.

## Evidence and pending acceptance

**No test code, harnesses, fixtures, mocks, testing-only UI or verification scripts were written or maintained. No tests, typecheck, lint, audit, formatter, build/package check, app/server/browser launch, screenshot, runtime probe, migration, archive operation or fault injection was executed.** Source/Git/API documentation inspection is implementation work, not a passed test. Historical tests and disabled CI are untouched. No normal app data, user-selected project, external app/account, publication or Git commit/push was changed.

| Gate                                                                                               | Current evidence                                                     |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Type/build compatibility, packaged/native SQLite                                                   | Unverified; user-owned launch/build results absent                   |
| Native picker/cancel/overwrite/Save As per-project mapping                                         | Implemented; user guide pending                                      |
| Portable open, exact content, independent same-ID copies                                           | Implemented; no archive generated or opened by assistant             |
| Minimum-head saves, later typing, autosave and close                                               | Implemented; no runtime observations                                 |
| Moved files, denied permissions, external conflicts and retained previous versions                 | Implemented; manual disposable-copy scenarios pending                |
| Post-replace/pre-ack crash, missing final, disk full/power loss                                    | Runtime safeguards implemented; no interruption or durability result |
| macOS arm64/Intel, Windows x64, OneDrive/provider versions, APFS/HFS+/NTFS/ReFS/removable behavior | No Stage 6 platform/client versions, artifacts or results supplied   |
| Archive 1/5/10 GiB timing/memory/space/cancellation                                                | Still pending D6; no datasets or measurements generated              |
| MAS bookmarks, OS file associations, full recovery/backup UI                                       | Owning Stages 22, 21 and 7 respectively                              |

User-reported results: **none**. “Complete” means implemented, not accepted or ready for release. Await the user's guide results before proceeding to another stage.
