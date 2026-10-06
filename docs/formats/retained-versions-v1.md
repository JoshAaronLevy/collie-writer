# PS05 previous Save version retention v1

October 5, 2026. This adds device-local review/removal records. Portable SQL/minimum reader **13**, archive/editor **1**, compilation **3**, Save/Backup journals, snapshot leases and AI formats are unchanged.

## Supported artifact and authority

The first retention class is an app-created `.collie-<Save operation UUID>.previous.collie` sibling of the current selected project file. It is retained project content, not cache. Removal is permanent, one explicitly selected version per operation, with no automatic age policy and no Undo promise. Nothing is selected by default. The newest previous version stays protected, without an override in PS05.

`project.retainedVersions` carries only project/workspace IDs, operation/review/artifact IDs and a bounded review offset. Shared/main/preload/worker validators reject arbitrary paths and unknown fields. Main classifies it as local retention, not an editing grant. Only the repository's exact active scope can preview/remove. Status can read the original operation without opening that project. The artifact ID identifies its Save journal; the worker derives its pathname.

Eligibility requires all of the following:

1. A complete, readable bounded operation/destination inventory. Known selected files and explicit Save/Backup destinations are protected by pathname and observed device/inode, including case aliases. Redirected/hard-linked/unknown paths or unavailable protection records refuse eligibility.
2. An unbroken chain from the currently acknowledged selected generation through `priorGeneration`. Each participating Save must be acknowledged and match the active project/workspace, current destination path and stored grant ID. Consecutive expected/replacement hashes must agree. Older destinations, changed grants, missing/unknown journals and detached histories remain protected.
3. Full read-only inspection of the current selected archive matching its acknowledgment. The selected file and local protected head may differ (ordinary unsaved work is retained); local head changes still invalidate a review.
4. Full read-only inspection of the proposed previous archive, matching the journal's expected hash/length and proving actual project ownership from both manifest and database. A foreign project overwritten by Save As cannot acquire the initiating project's ownership from the journal.
5. A separate, still-retained immediately newer previous copy containing the selected operation's exact replacement project/snapshot/head/hash. It must remain present and unchanged through removal. Missing replacement proof protects the older artifact. Inspect older pages and remove oldest first if reclaiming multiple versions; choosing a newer version first can leave earlier versions protected by missing proof.
6. No unresolved earlier removal record. A confirmed removed file that reappears is protected even if its bytes resemble the original. A known pre-unlink change can receive a fresh review; interrupted/unknown receipts, malformed markers and missing referenced receipts are never automatic deletion permission.

The review displays exact paths, lengths, inspected snapshot dates and project/snapshot/revision identity, with explicit protected/absent/unknown values. It does not attribute uninspected archives to the initiating project. Four rows are returned per page; paging creates a fresh review and clears selection. Nothing is removed merely by preview, paging or Cancel. Preview does not reconcile journals, acquire/migrate other projects, create incoming copies or extract archives to disk.

## Actual owner boundary and the CA03 gate

CA03 remains unresolved in main's general timeout bookkeeping. PS05 does **not** use `StorageWorker.idle()` or renderer busy state as settlement proof, and does not implement the broader audit stage.

The worker awaits the complete PS05 command in its existing command queue. `ProjectFiles.retainedVersions` takes a maintenance guard, waits for an existing background file check's actual task to settle, and refuses any other live file job. Watchers and file/project transitions cannot start while this guard is held. `ProjectRepository.withFileMaintenance` then takes the repository serial boundary, requires the exact active project and its held exclusive project lock, refuses active snapshot/export owners, and holds `fileBusy` until the whole command finishes. Search batches and other repository work cannot interleave. Snapshot jobs do not read these external previous archives; nevertheless active snapshot/export owners are conservatively refused.

A request queued before PS05 has either finished in the worker queue or is represented by an actual asynchronous file/snapshot/export owner checked above. Requests queued later cannot execute until PS05 settles. A caller timeout does not release either worker guard. Native shutdown is queued behind the operation; unexpected worker loss leaves the durable receipt. Opening the same workspace in a replacement worker still needs the exclusive project lock. This supplies the narrow owner proof required by the storage plan for this artifact class; it does not fix main's general late-response/access bookkeeping, establish runtime acceptance or authorize PS06/PS07.

Review proof includes the active head, destination/grant/generation, database identity, active-pointer content, ancestor identities, operation/destination metadata and protected external file identities. Removal repeats archive/hash inspection and owner metadata checks. After writing receipts it rechecks current head/mapping, metadata and all three file/parent identities immediately before unlink. The new discovery reference is excluded from that final metadata digest only after the previous digest was checked; all other operation/destination records still participate.

## Read-only archive inspection and bounds

Inspection opens one regular, non-linked file descriptor with no-follow where supported. Hashing and ZIP reads use that same descriptor, with identity comparisons before/after and named-path/ancestor checks. Descriptor closure is awaited before returning. It validates the existing archive entry rules with tighter retention limits, CRCs, declared sizes and every manifest payload hash. Citation references must match the app's exact supported profile; hashing establishes those bytes. The project database is loaded into memory, in rollback-journal format only, and uses the existing strict portable schema/integrity/content graph validation. No migration, WAL recovery, destination rewrite or filesystem extraction occurs.

Bounds are deliberately conservative:

| Item                                         | Bound                                                        |
| -------------------------------------------- | ------------------------------------------------------------ |
| Operation folders examined                   | 4,096                                                        |
| Project folders / entries per project folder | 2,048 / 32                                                   |
| Review offset / displayed page               | 0–4,096 / four previous copies                               |
| Archive files inspected per preview          | Six; at most 3 GiB of source lengths in total                |
| One archive / total expanded entries         | 512 MiB / 512 MiB                                            |
| Archive entries / manifest / database image  | 4,096 / 1 MiB / 32 MiB                                       |
| Live reviews / expiry                        | Eight / five minutes                                         |
| Removal action                               | One version, rechecking target, replacement and current file |
| Receipt folder / receipt read / marker read  | 1,024 entries / 128 KiB / 1 KiB                              |
| Renderer pending preference                  | One exact request, at most 2,048 characters                  |

Hashing plus entry inspection reads archive content more than once. Limits are resource ceilings, not performance guarantees. Oversized/unsupported archives stay retained. Metadata limits can refuse the whole review; per-archive limits produce retained/incomplete results. PS05 is not a general large-archive garbage collector.

## Durable records and interruption behavior

`<working root>/retention-actions/<action UUID>.json` contains exact `{ version: 1, view, selected, context, target, replacement, current }`. Each proof records a path, regular-file identity, ancestor digest, archive hash, project/snapshot/head and snapshot date; no project content or credential is embedded. Strict readers validate the record version/shape and selected row/path. The result view has scope/review/head IDs, timestamp, page/completeness information and one selected row in a removal receipt.

The initial receipt has phase **interrupted** and an **eligible** row and is durable before unlink. A small `<file-operations>/<Save UUID>/previous-removal-v1.json` reference `{ version: 1, actionId }` is persisted before unlink too. It never replaces `save.json` or the original acknowledgment. Atomic temporary writes, file synchronization, rename and the existing directory-sync helper are used. Original receipts remain retained; the folder cap refuses new actions rather than expiring them automatically.

A settled receipt has phase **complete** with **removed**, **changed** or **unknown**. Pre-unlink identity/authority loss is changed with no removal attempted. Uncertain unlink/directory synchronization is unknown. **Absent** means no file was observed, not a claim of intentional removal. An interrupted eligible row is presented as unknown. Status/replay only reports; it never resumes deletion against the current pathname. Missing receipts confirm neither removal nor historical non-execution after receipt loss. Reappearing files remain protected and visible.

`collie.retained-version-action.v1` stores the exact renderer removal request before dispatch. A failed local write prevents dispatch. The retained Data owner keeps synchronous pending/busy handles and existing close/project/access guards. Unknown responses keep **Check removal outcome**; restart can reload that exact request. A malformed preference is retained and disables new removal. Confirmed response or status retires only the local pending marker; failed retirement retains outcome checking. No automatic removal or status replay runs on startup.

## Discovery, inventory and compatibility

Recovery discovery and storage inventory consult the marker/strict receipt only as reporting evidence. A candidate is omitted as intentionally removed only if the receipt confirms removal **and** the file is currently absent. Changed, unknown, unreadable or reappearing files remain visible/retained. A subsequent review can show the intentionally removed row. Recognized receipt/reference filenames count as local metadata/operations; unknown temporary files remain unclassified. After an outcome, the UI refreshes inventory and existing recovery discovery while Data is visible (or when returning there). Existing recovery discovery retains its prior reconciliation behavior; it is not used as preview authority.

Older Save/Backup journals remain readable without migration. Without the new records they cannot imply intentional removal. Older Collie readers may still list a removed previous path as missing because they do not understand the sidecar; original Save acknowledgment and current project stay valid. New records are outside portable archives and excluded from deletion. Search-cache receipts, snapshot candidates/leases, incoming copies, migration originals, reset recovery, export payloads, AI output/journals and credentials are untouched. PS06 subsequently adds local-artifact v2 receipts and exact local duplicate cleanup; see its [separate contract](local-artifact-retention-v2.md). This v1 reader and previous-version behavior remain unchanged. PS07 remains separate.

There is no portable Node atomic conditional unlink by inode. Collie serializes its own owners and leaves no asynchronous gap from final identity checks to unlink, but cannot defeat a hostile same-user process racing path/content changes. Directory synchronization uses the existing macOS helper; Windows has no Node directory-flush guarantee here. File-length totals are not guaranteed reclaimed physical bytes (filesystem snapshots, sparse allocation and OS behavior can differ). Native execution, cancellation/timeout/loss behavior, accessibility and release acceptance remain unverified.
