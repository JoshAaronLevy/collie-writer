# Working project schema 3

Stage 9 extends [schema 2](working-project-v2.md). Application ID `1129270359` is unchanged; `user_version`, `format.schema_version` and `format.minimum_reader` become **3**. Editor AST remains **1**. Exact app-owned STRICT DDL is in `src/worker/storage/schema.ts`; renderer input never supplies SQL.

| Added table | Portable fields and ownership |
| --- | --- |
| `outline_state` | `(project_id,document_id)` primary key; state active/archived/trashed/merged; nullable replacement document FK. Documents remain tombstones instead of being deleted. |
| `anchor_targets` | `(project_id,id)` primary key; document FK; blockId/citationId/footnoteId kind; active/archived/trashed/deleted state; nullable same-project replacement anchor FK; bounded last text label. |
| `history_checkpoints` | `(project_id,id)` primary key; logical parent checkpoint ID; head commit FK; UTC timestamp; human actor; manual/automatic/structural/restore reason; label; encoded snapshot index; exact UTF-8 index byte size. Parents may be pruned. |
| `history_content` | `(project_id,id)` primary key; id is the canonical JSON SHA-256 of `{document,anchors}`; immutable JSON content and UTF-8 byte size. Shared by any number of retained checkpoints. |

`documents.kind` now admits `part`, `chapter` and `text` (the existing section kind). Parent kinds and stable contiguous sibling positions are validated across the whole tree, including tombstones. Only text documents contribute current editor IDs. Containers retain one inert empty paragraph to keep AST version 1 unchanged. State inherited from a parent controls descendant availability. A merged text document retains its old payload but is excluded from current occurrences; its replacement identifies the current destination.

The stored checkpoint index is `{version:1,documents:[{documentId,contentId}]}`. Materialization resolves every content chunk into `{version:1,documents:RetainedDocument[],anchors:AnchorTarget[]}` and validates unique IDs, tree structure, lifecycle, replacements, anchors and canonical AST. `RetainedDocument` is the outline summary plus its payload; summaries now include `parentId`, `position`, `kind`, `revisionId`, `state`, `replacementId`, title/status/synopsis. No device paths or project IDs are embedded in chunks; their ownership comes from SQL. Current managed asset rows remain retained so old image references stay portable.

The 2→3 copy migration creates only application-supplied tables, initializes active states, derives anchors from validated AST and stores an adoption checkpoint. Existing document/revision/commit identities and content are preserved. The source backup and candidate are validated and retained using the existing migration service; publication changes `active.json`, never the sole original database. Existing schema 1 passes through schema 2 first. A schema-3 database requires this reader; roll back by intentionally restoring the preserved older copy, never by decrementing schema metadata.

Named bridge methods:

- `changeOutline(OutlineInput) → OpenProject`: scoped operation ID, expected head, complete expected document revisions, selected ID and validated create/move/split/merge/state/details/repair/checkpoint/restore/prune action. The returned outline includes current revisions and document replacement mappings; `readHistory` exposes anchor mappings. Durable replay receipts retain the existing `{projectId,documentId,revisionId,headCommitId}` format.
- `readHistory({projectId,workspaceId,checkpointId|null}) → HistoryView`: current head/current manuscript, checkpoint summaries, selected materialized checkpoint (if requested), current anchor mappings, total logical storage bytes, eligible checkpoint IDs and removable bytes. Destructive actions must use the displayed current head and freshly flushed revisions. History viewing is a user action; ordinary typing does not transfer the whole book through the bridge.

Archive container version stays 1. New manifest `schemaVersion` and `minimumReader` are 3, while `editorVersion` is 1. The reader also accepts the previous schema-2/minimum-reader-1 combination and requires manifest/DB versions to agree. Archive extraction validates the old representation without modifying it; the new local workspace then copy-migrates. Duplicate/backup restore re-scopes the new tables along with the earlier domain tables and receipts. Chunk content has no project IDs to rewrite.

Retention removes only user-reviewed old automatic checkpoints and history chunks unreferenced by every remaining checkpoint. Snapshot capture is serialized with mutation; its independent database copy owns all its required history chunks. No blob garbage collection is introduced. See the [Stage 9 decision](../decisions/stage-09-outline-and-history.md) for limits and pending cost evidence.
