# Working project schema 2

Stage 5 extends [schema 1](working-project-v1.md) with this STRICT table:

`managed_assets(project_id, id, original_name, media_type, byte_size, sha256)`

The primary key is `(project_id,id)` and `project_id` references the owning project. `byte_size` is nonnegative. Runtime validation bounds sizes and permits PDF, PNG, JPEG and UTF-8-text media labels; owning import stages must validate actual media before registering bytes. `original_name` is a bounded display filename, never a filesystem path. Asset IDs identify project-owned objects; SHA-256 identifies deduplicated immutable bytes in `blobs/`.

Application ID remains `1129270359`. SQLite user_version and `format.schema_version`/`minimum_reader` become **2**. Editor schema remains **1**. Existing project/document/commit/operation tables and IDs remain unchanged. New projects begin on schema 2 with an empty asset inventory and a null destination. Stage 5 added no attachment picker or rich-editor image controls; Stage 8 adds a scoped image picker and managed PNG/JPEG ingestion on this same schema.

Stage 8 also uses the existing `projects.template` and ordered `documents` fields for five flat templates with one or more sections. The portable validator accepts positions `0..n-1`, at most 10,000 documents, exact schema-v1 ASTs, unique editor IDs and owned asset references. Existing one-document Blank projects remain valid. No SQL/AST/archive version bump or copy migration was needed; nested document trees remain a Stage 9 format decision.

`migrations.ts` registers the real **1→2** step. It validates the exact schema-1 SQL, backs up and validates the source, creates a separate candidate, adds the app-owned table and updates metadata inside a transaction, validates/checkpoints/flushes, and publishes `active.json`. The original `working.sqlite`, pre-migration backup and failed candidates remain. Do not manually remove WAL/SHM/journal files. Listing/opening a Stage 4 workspace can trigger this migration; no migration has been executed by the assistant.

Schema-1 documentation and Stage 4 evidence remain historical. Older application code must not follow the new active pointer into schema 2 and write it; it should refuse the newer version. Rollback requires an intentionally restored preserved older copy, not downgrading the active database. There is still no archive format preceding Stage 5's archive v1.

All registered asset rows are retained in snapshots, even if unused by the current draft. Future history/source consumers must preserve their asset rows and extend the schema/validator/migration together. Stage 5 does not pretend that commit lineage reconstructs removed document versions. A trusted ingestion helper durably stages/hash-addresses bytes before any owning command can register them; no source registration or history UI is introduced here.

Snapshot jobs use local `snapshots/<job UUID>/job.json` journals and owned staging/candidates. Local generic `operations.sqlite` and `settings/local.sqlite` keep their existing schema 1. Leases, output paths, destination mappings and job state never enter portable domain SQL. See [archive format 1](collie-v1.md) and [D6](../decisions/D6-portable-snapshots.md).
