# Working project schema 1

Historical Stage 4 format. Stage 5 introduces [working schema 2](working-project-v2.md) through a retained-copy 1→2 migration; preserve these original SQL and command contracts when reading older workspaces.

Stage 4 implementation contract, September 29, 2026. Runtime/native acceptance is pending. SQL ownership is `src/worker/storage/schema.ts`; command ownership is `src/shared/projects.ts`. Editor payloads use `src/domain/editor/schema.ts` v1. This is not a `.collie` archive specification.

```text
<verified local parent>/com.colliewriter.app.dev/working/
  settings/local.sqlite                      local creation intents and destination mapping
  workspaces/<project UUID>/
    owner.sqlite                             local SQLite editing lock
    <workspace UUID>/
      working.sqlite                         initial portable domain database
      working.sqlite-wal / -shm               SQLite-owned sidecars while needed
      operations.sqlite                      local jobs and delivery state
      recovery.json                          derived, repairable discovery
      blobs/                                 reserved for immutable assets; empty in Stage 4
      active.json                            optional pointer after a future copy migration
      working-vN-<UUID>.sqlite                future migrated active database
      migrations/before-vN-<UUID>.sqlite      retained migration backup
```

Only the domain database contains portable state. Neither local databases, owner locks, pointers, absolute paths nor recovery JSON belong in a portable snapshot. Settings and operations currently use app-owned schema version 1; incompatible local schemas fail closed. They are separate transactions from the domain database, not a distributed atomic commit.

The domain database sets SQLite application_id `1129270359` and user_version `1`. `format` records schema/minimum-reader/editor versions, all 1. The exact allowed STRICT tables are:

| Table               | Owned data                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `projects`          | UUID, template, title, locale, head commit and UTC creation/update times                                                                         |
| `documents`         | Project/document UUIDs, hierarchy/position metadata, kind/title/status/synopsis, revision UUID, editor version and complete JSON DocumentPayload |
| `commits`           | Project-scoped commit UUID, parent commit and UTC time; lineage metadata, not historical document snapshots                                      |
| `domain_operations` | Project-scoped operation UUID, canonical SHA-256 request digest and original ID-only mutation receipt                                            |
| `editor_ids`        | Transactional project-wide index of block/citation/footnote IDs and owning document                                                              |
| `format`            | Single version metadata row                                                                                                                      |

Stage 4 creates one text Draft per project and one workspace per project. All payload updates replace the document's complete AST and owned footnote bodies under one revision. Foreign keys bind hierarchy, heads, commits and editor IDs to the correct project. Source/asset references cannot yet be committed because their owning repositories do not exist. Histories of full payloads, multi-document mutations and snapshots remain later work; an arbitrary old commit is not materializable.

## Bridge and acknowledgments

All calls carry a transport `requestId` UUID; mutations additionally carry a stable `operationId` UUID. Main validates the owning top-level frame and exact input fields, worker validates commands, main and preload validate results. Filesystem paths never come from project command inputs.

| Preload capability / channel                            | Input and output                                                                                                                                                                       |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getWorkingLocation` / `projects.location`              | No path input → ready/required, local path when ready, bounded explanation                                                                                                             |
| `chooseWorkingLocation` / `projects.chooseLocation`     | Native picker owned by main → location status; no project-file grant                                                                                                                   |
| `listProjects` / `projects.list`                        | No input → safe summaries and per-project issue codes                                                                                                                                  |
| `createProject` / `projects.create`                     | Operation ID and one of five template IDs → project/workspace/section/revision/head IDs, selected payload and `destination: null` (Stage 8; Stage 4 originally supported only `blank`) |
| `openProject` / `projects.open`                         | Project/workspace IDs from discovery → same current local-project shape; this is not portable archive Open                                                                             |
| `commitDocument` / `document.commit`                    | Project/workspace/document IDs, operation ID, expected revision, payload → project/document/revision/head IDs only                                                                     |
| `setUnprotectedChanges` / `document.unprotectedChanges` | Validated boolean notification from the owning frame → native close/quit protection                                                                                                    |

Destination and base snapshot fields remain null in local settings; portable project rows contain no selected paths. Scope field names/shape above are the implemented Stage 4 specialization of the plan's proposed envelope. Stage 6 must add a separate purpose-bound native grant for opening archives, without broadening this local open into arbitrary filesystem access.

Requests are serialized in the worker and main permits at most 32 outstanding requests. A 60-second timeout means unknown outcome, not rollback. Retry the exact operation to receive its original committed receipt; reuse with different content returns `OPERATION_CONFLICT`. Stale revisions return `STALE_REVISION`. Busy ownership, full disk, permission errors and unsupported/corrupt formats use bounded error codes without exception details or manuscript diagnostics.

Failed discovery metadata writes do not negate a successful SQL commit; listing rebuilds discovery from the database. Interrupted local jobs are marked interrupted on acquire. No existing production job is automatically replayed. Future jobs must reconcile through the same domain operation ID, retaining all local-only receipts and paths outside the portable database.
