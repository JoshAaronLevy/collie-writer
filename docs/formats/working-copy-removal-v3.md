# PS07 inactive working-copy removal

October 5, 2026. This adds device-local removal records. Portable SQL/minimum reader **13**, archive/editor **1**, compilation **3**, Save/Backup/snapshot journals and AI/account formats remain unchanged. PS05 v1 and PS06 v2 retention receipts keep their existing readers.

## User action and scope

**Settings → Data and recovery → Remove local working copy** lists inactive local projects, including archived ones. The current project is excluded. Review reads the actual saved file and local content; it never migrates, repairs, reconciles or extracts a project. Cancel discards the displayed review. Removal requires the exact reviewed scope/ID plus explicit confirmation. This permanently removes local project content; it is separate from search-cache clearing, reversible Archive and Reset.

A successful removal leaves the original workspace directory as a small records-only skeleton. It unlinks verified content files individually, with `working.sqlite` first, then managed originals/citation files and any verified search cache. No recursive deletion, quarantine move, automatic retry or expiry is used. Small original journals remain at their original paths. The stable project-level `owner.sqlite` is never replaced or deleted.

The initial release deliberately refuses migration originals, old/alternate databases, independent or unresolved snapshot candidates, export recovery, unknown files, SQLite sidecars and AI-linked workspaces. It also refuses workspaces containing prior PS04/PS06 cleanup records; retaining and reconciling those additional recovery owners is a future extension. Global PS05/PS06 receipts and external recovery files are untouched.

## Eligibility proof

The worker derives every path. Renderer requests contain no path, byte count or disposal claim. `project.workingCopy` accepts Preview, Remove, Status and bounded History through shared/main/preload/worker validators. Main supplies its own AI ownership evidence; renderer input cannot supply it. This is local maintenance, with no editing/access grant.

Every eligible review and confirmation requires:

1. An inactive workspace, stable exclusive project lock, settled worker/file/repository owners and no active export/snapshot task. Never-saved work needs Save first. Local head must equal the selected file's acknowledged head.
2. A supported current-schema local database, copied into bounded memory for strict schema/graph/integrity reads. The source SQLite file is never opened by SQLite during proof. WAL headers are converted only in that private memory image, after refusing WAL/SHM/journal sidecars.
3. Full validation of the accessible selected `.collie` on one descriptor: declared archive structure, entry hashes/lengths/CRC, complete database graph and managed inventory. It must match the recorded file hash, project/snapshot/head and a canonical digest of **all local database tables and rows**, including project history and operation receipts. A matching head or timestamp alone is insufficient. Row order, journal mode and physical page layout do not affect the content digest.
4. Every managed original/citation file present locally must match the saved manifest, and every saved managed entry must exist locally. Unrecognized extra files refuse removal. A search database needs its existing schema/operation-owner proof. This does not collect unreferenced originals.
5. The local operations database must have its exact supported schema, no AI/delivery records, and only settled search jobs. All portable conversation/proofreading tables must be empty. Completed snapshot journals may remain only with released leases, valid manifests and acknowledged original Save/Backup consumers. Payloads and unknown recovery files are excluded even if the selected archive is current.
6. Main independently inspects both hot **and cold** encrypted AI operation/receipt records, without account initialization, login, model discovery or provider work. Any record referring to the original workspace blocks removal, including handed-off outcomes. Unreadable, unsupported, interrupted-write or over-limit evidence refuses eligibility. In-memory prepared, pending, retained and content-adapter work also blocks removal; uncertain live AI ownership is refused conservatively.

The complete proof is repeated at confirmation and compared with the exact review, including file/ancestor identities, content hashes and directory inventory. Each unlink rechecks all remaining local file identities, directory identities, the retirement marker and saved file identity. A changed path is never substituted.

## Settlement and scope exclusion

CA03 remains unresolved generally. PS07 uses the actual awaited worker command queue, `ProjectFiles` maintenance owner (including abort-and-await of a background file check), repository serial boundary and the inactive project's exclusive `owner.sqlite` lock. That lock stays held through proof, records, every unlink and final outcome. Search/repository work cannot interleave. Project switching/creation/reset now check the underlying snapshot task as well as visible pending/active jobs before releasing a workspace owner. Live export ownership is refused.

Before Remove dispatch, main reserves the exact original scope/action against new AI preparation/dispatch. It does **not** release that reservation on timeout, IPC failure or a worker error. A successful Remove reply or an authoritative Status reply, queued through the actual worker and project owner, settles the reservation. Status can reuse the already-held project lock; if its root no longer exists after Reset, it reports the durable record through the worker queue. The persisted retirement marker continues blocking AI dispatch to that original scope after restart. Main caller timeout maps do not provide settlement proof. No general CA03 timeout repair is claimed.

Renderer draft ownership additionally refuses removal of a target with pending input/work. An exact pending request is stored before dispatch and registered with existing close/project/access protection. A failed or missing reply offers **Check outcome**, never a resend of deletion. Navigation retains these owners; editor ownership is unchanged.

## Local records and crash outcomes

Paths are relative to the existing working root:

| Record                                     | Contract                                                                                                                                                                                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `retention-actions/<actionId>.json`        | Strict v3 `{version:3, kind:'working-copy', view, tree, saved, retained, payloads}`. Full saved-file proof, original scope/review, local tree digest, retained file proofs and per-payload `pending/removed/retained/unknown` outcomes. Counts must agree with payload states. |
| `working-copy-locators/<actionId>.json`    | Strict v1 `{version:1,id,scope}`. Bounded history index into the original receipt; no file grant or opening authority.                                                                                                                                                         |
| `workspace-retirements/<workspaceId>.json` | Strict v1 `{version:1,actionId,scope}`. Outside the workspace and outside the tree moved by Reset. Written before any unlink; unreadable/missing referenced receipts fail closed.                                                                                              |
| `collie.working-copy-removal.v1`           | Bounded renderer preference containing only the exact pending Remove request; read-only status reconciliation after restart.                                                                                                                                                   |

Persist/synchronize the initial v3 receipt and locator first, then the retirement marker, then the retired receipt, before content deletion. Persist each confirmed unlink after directory synchronization. A failure stops the loop, retains all remaining files, records uncertainty and never automatically resumes. An interrupted receipt reports only durably confirmed removals. If receipt protection itself fails, the original pending request remains available for Status. No quarantine relocation is counted as freed space.

The original `operations.sqlite`, `destination-v1.json`, recovery/origin/organization/manifest metadata, completed snapshot `job.json` records and empty directories remain in place, within the retained-metadata bound. Required global file-operation history, prior retention receipts, explicit backups, account stores, incoming/reset/migration recovery and all external files stay intact. A later Reset still moves local skeletons with the working tree into reset recovery; history calls its path the **original** location. Global markers and receipts remain. Restoring the batch preserves retirement, and collisions retain the existing refusal behavior.

Library discovery, direct opening, known-project lookup and replay of an original create request reject retired scopes rather than reopening or recreating them. Ordinary Open uses the native picker, retained incoming archive and existing archive-validation/identity flow. When a project root contains only proven retired workspaces, promotion holds the same root lock and adds a **new workspace ID**, retaining the original project ID. Live/ambiguous roots still refuse collisions. Independent-copy opening retains its existing new-project-ID behavior. Access designation follows normal rules; old workspace access is not silently transferred.

History reports up to eight original outcomes per page. Inventory labels retired skeletons and counts the new metadata as operations. The locator never silently opens a remembered path or proves cloud availability. Invalid markers/receipts remain protected and can produce an unavailable library/history entry rather than guessed recovery authority.

## Bounds and compatibility

- At most 1,024 visited local entries, depth five and 512 files; 4,096-character paths; total reviewed local file lengths at most 1 GiB, retained metadata at most 8 MiB. Files outside these ceilings remain protected.
- Archive/payload inspection at most 512 MiB; SQLite images at most 32 MiB. Logical database digest at most 200,000 rows and 128 MiB of row serialization; existing archive structure/expansion bounds remain.
- File-operation scan at most 4,096 operation-directory entries; unknown or unreadable journals refuse eligibility. Main's read-only AI scan covers at most 256 encrypted records/indexes and 32 MiB total, with a 4 MiB per-envelope ceiling. Over-limit history remains protected, never silently truncated into “clear.”
- Eight in-memory reviews, five-minute expiry. Shared retention registry, locator and retirement indexes cap at 1,024 entries. Receipts at most 4 MiB; locator/marker at most 1 KiB; pending preference at most 2,048 characters. No record purge is implemented.

These are resource ceilings, not measured performance. Proof rereads potentially large files. Confirmed file lengths are not guaranteed physical space reclaimed, especially with filesystem snapshots or compression. Node has no portable atomic conditional unlink by inode: final synchronous identity checks and Collie owner locks cannot defeat a hostile same-user process racing external paths. Existing directory synchronization is supported here on macOS; the helper provides no equivalent Windows directory flush guarantee.

This local layout requires the PS07 reader. Older readers do not understand retirement markers; the database is removed first to keep a partial former workspace from being opened after that point, and multiple retained/new scopes may look ambiguous to an older library. Do not downgrade against this working root. No portable schema bump or automatic local-format rollback is introduced. Native behavior, interruption/reopening, accessibility and platform durability remain user-owned acceptance and release gates.
