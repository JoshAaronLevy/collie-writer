# Working project schema 10 — Portable project details

October 1, 2026. Extends [schema 9](working-project-v9.md). Working SQL and minimum reader are **10**. Editor AST **1** and `.collie` archive container **1** are unchanged. Compilation **3** is a separate derived output contract, not a new editor format. Implementation is complete; migration, native round trips and output behavior await user testing.

## Record and revision rules

`projects` retains its original SQL shape, title, locale, stable template ID, identity, head and timestamps. New `project_details` is a strict table with one row for that project's ID:

| Column        | Meaning                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------- |
| `project_id`  | Primary key and foreign key to `projects.id`; independent copies rekey it                           |
| `byline`      | Plain text, at most 500 UTF-16 code units; empty is permitted in stored records                     |
| `description` | Plain text, at most 10,000 UTF-16 code units; multiline, optional as `''`                           |
| `kind`        | Stable project-kind ID from the authoritative template mapping                                      |
| `revision_id` | UUID of the commit that last changed project details; migration initializes it to the existing head |

`readProjectDetails` requires exactly one row, correct project ownership, a valid kind matching `projects.template`, bounded fields and a revision present in that project's commit chain. Foreign keys, exact app-owned SQL objects, integrity and the full portable graph remain runtime safeguards. A detail update or legacy Rename advances the project head and detail revision without changing document IDs/revisions, payloads or outlines. Manuscript history does not roll back independent project details; portable snapshots retain details at their captured head.

The single mapping is `src/domain/projects/templates.ts`:

| Template ID | Kind ID            | Display name             | New empty text sections                                  |
| ----------- | ------------------ | ------------------------ | -------------------------------------------------------- |
| `book`      | `nonfiction-book`  | Nonfiction book          | Introduction / Chapter 1                                 |
| `essay`     | `academic-essay`   | Academic essay           | Introduction / Argument / Conclusion                     |
| `article`   | `article`          | Article                  | Draft                                                    |
| `report`    | `report`           | Report                   | Summary / Findings / Recommendations                     |
| `critique`  | `study-critique`   | Study critique           | Study overview / Argument / Supporting research          |
| `research`  | `research-paper`   | Research paper           | Abstract / Introduction / Methods / Results / Discussion |
| `blank`     | `blank-nonfiction` | Blank nonfiction project | Draft                                                    |

The first five choices are primary; research/blank are secondary for I05's eventual cards. No prose, fake study or References section is seeded. Existing references/appendices/outlines are preserved. Changing kind updates its matching template ID and labels only. It never runs template generation against an existing project. Study critique adds no dedicated intake or automatic research.

## Input and stored validation

Lengths use JavaScript `string.length`, matching the existing shared contracts (UTF-16 code units, not grapheme counts). New personal creation requires already-trimmed title and byline, each 1–500 units. UI trims those two fields before dispatch. Tabs/newlines and C0/C1 control characters are rejected in new names; Unicode names and shared bylines are preserved. Description allows tab/CR/LF, rejects other C0/C1 controls including NUL, and is neither trimmed nor truncated.

Stored old titles retain the pre-I04 title rules verbatim. Neither migration nor the reader normalizes/truncates them. A details update may carry an unchanged legacy title verbatim; a newly changed title must meet the new name rules. Stored byline may be empty, including when editing an older project. Missing descriptions migrate to `''`. New fields never come from a purchase/AI identity. New types are not accepted in old portable schema versions that could not have created them.

## Commands and receipts

Create input contains exactly `operationId`, `template`, `title`, `byline`, `description`. Trusted main and worker validators enforce the complete shape. The local creation intent fixes the identity before work begins; the same operation/content retries that identity. A different payload under its UUID is refused. Schema creation, project/details rows, initial commit, empty outline/anchors and receipt commit together in one repository transaction. No destination is assigned.

The new `details` command (`projects.details`, preload `updateProjectDetails`) contains exactly project/workspace IDs, operation ID, expected head, expected detail revision, title, byline, description and kind. Main classifies it as **edit**; it does not grant rights during a read-only state or extend the bounded access-drain allowlist. The UI can explicitly designate the current free project or clear its form. Worker checks the exact operation digest first, then expected head and detail revision, and atomically stores all changed metadata plus a new commit and ID-only receipt. Retry reads current project state without reapplying an acknowledged mutation. Unknown results retain/freeze the exact request in the persistent form; known stale results retain the user's text and offer explicit replacement from stored details.

`OpenProject` includes `byline`, `description`, `detailsRevisionId`, and `projectKind`; library summaries include `projectKind`. Exact result readers in preload/main and nested Data Locations/file/tutorial consumers share the updated validator. Description is not added to library rows or content-free diagnostics. The trusted tutorial caller supplies its explicit tutorial byline and existing setup title sentinel. Sample privilege still comes exclusively from main's separate sample slot.

## Retained-copy migration and portability

The 9→10 step creates the table on the migration candidate and derives kind from each validated legacy template, with empty byline/description and unchanged title/outline. The existing 1→…→9 chain remains available. Under the ownership lock, the runtime makes and checks a backup, retains `migrations/before-v9-<UUID>.sqlite` (or the original older version), migrates another candidate in a transaction, validates it, syncs it, then publishes `active.json`. The original database, backup and failed candidate remain on failure. No migration is run by the assistant.

New snapshots use schema/minimum reader 10. The manifest reader still accepts prior supported archive pairs (schema 2/minimum reader 1, and 3–9 with their matching reader); newer versions fail closed. Archive extraction requires manifest/database version equality. New archives need a schema-10-capable reader. Save/Save As, Backup, Move, Duplicate and Restore use the same captured SQL/graph. `promoteIncoming` rekeys `project_details.project_id` along with the other owned tables and ID-only receipts; values and detail revision references remain intact. Old incoming copies rekey under their original format, then copy-migrate on local open. Reset recovery keeps whole workspaces, including migration originals.

| Consumer                                                | Change or preserved contract                                                                          |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Domain templates/details, shared projects               | Single mapping, bounded create/update/stored fields, exact expanded read results                      |
| Main IPC, capability policy, preload, worker dispatcher | Narrow validated `details` edit command; no generic filesystem access                                 |
| Repository create/read/list/rename/details              | Atomic fields, expected versions, exact receipts; list carries kind                                   |
| Schema/migrations                                       | Exact V9 retained; V10 table appended; transactional 9→10 candidate migration                         |
| `portable-db.ts` / `details.ts`                         | V10 record ownership, kind/template and revision validation                                           |
| `manifest.ts`, `snapshot.ts`, `archive.ts`              | New writer version 10; old readers retained; graph/version agreement                                  |
| `incoming.ts`                                           | Detail-row rekey for independent identities                                                           |
| `project-files.ts`, snapshot jobs, retained backups     | Reuse central snapshot/extraction/rekey boundary; no alternate metadata copy path                     |
| File/lifecycle/tutorial results                         | Updated shared OpenProject/ProjectList reader, trusted sample caller                                  |
| Frozen compilation, DOCX/PDF/text                       | Metadata captured with manuscript; see [I04 decision](../decisions/improvement-04-project-details.md) |

No credentials, author defaults, UI destinations, file paths or live jobs enter portable details. Recovery and cloud-upload distinctions and all native release gates remain unchanged.
