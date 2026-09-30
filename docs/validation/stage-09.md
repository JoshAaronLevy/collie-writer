# Stage 9 completion record

September 30, 2026 — **implementation complete — awaiting user testing**. The explicit Stage 9 request authorizes this stage; prior native/storage/editor acceptance is not inferred. Stage 10 is not started.

The implementation plan, standing instructions, Stage 8 handoff, D3 AST contract, repository/worker/preload/editor lifecycle, exact schemas, migration, portable graph and independent-copy consumers were read. The starting Git state was clean. Changes stay within Collie Writer; no reference application or external service is required.

Implemented: part/chapter/section outline creation, details, drag and keyboard reorder/move, between-block split, append merge with replacement tombstones, inherited archive/trash and restore; all-document revision/head checks and atomic pre-action checkpoints; stable anchor/document projections with visible deleted targets and explicit manual repair; manual and coalesced human checkpoints, shared immutable section-history content, side-by-side text/outline comparison, restore into new revisions with current work retained first; reviewed 30-day automatic-history cleanup and distinct/shared size preview. Current content and retained history both travel through the portable-file path.

Changed paths:

- `src/shared/outline.ts`, `projects.ts`; `src/main/projects-ipc.ts`; `src/preload/index.ts`; `src/worker/index.ts`: typed scoped commands, requests and response validation.
- `src/worker/projects/manuscript.ts`, `outline.ts`, `repository.ts`: tree/lifecycle/anchor rules, transaction commands, durable checkpoints, incremental editing projections and restoration/retention.
- `src/worker/storage/schema.ts`, `migrations.ts`; `src/worker/projects/portable-db.ts`, `manifest.ts`, `archive.ts`, `snapshot.ts`, `incoming.ts`: schema 3, retained-copy migration, compatible old archive reads, history graph validation, snapshot version agreement and independent-copy ownership.
- `src/renderer/src/features/outline/OutlinePanel.tsx`, `HistoryPanel.tsx`, `features/projects/Projects.tsx`, `assets/main.css`: production controls, comparison/repair, flush and unknown-outcome handling, read-only removed sections, keyboard alternatives and responsive comparison columns.
- Plan, README, AGENTS, format notes, [decision](../decisions/stage-09-outline-and-history.md) and [manual guide](../manual-testing/stage-09.md).

Migration: SQL/minimum reader **2→3**, with the existing 1→2 path retained. AST schema and archive container stay **1**. New archives declare schema/minimum reader 3; prior schema-2 archives remain readable. Migration seeds anchors and an adoption checkpoint on a validated candidate, retains original/backup/candidate files and publishes the active pointer afterward. No migration or archive was executed by the assistant. No dependency/build pipeline change was made.

Anchor mappings are explicit in the portable anchor registry and document replacement state, retained inside checkpoints and exposed through the history/open-project results. Pure reorganization performs a production equality check on exact block and note-body multisets; changed current projections are committed with the tree and revisions. **Observed before/after counts: unavailable.** No manuscript fixture, citation sample, test dataset or running operation was generated. Citation/footnote UI is Stage 15; corresponding conservation and future annotation/range behavior remain acceptance gates rather than invented demonstrations.

The assistant added no test code, fixture, mock, harness, probe, automated verification/benchmark script or CI. No tests, typecheck, lint, format check, audit, build/package command, app/server/browser launch, screenshot, fault injection, native operation or performance measurement was run. File and Git reads are source context, not passed checks.

Pending: all behavior in the manual guide; existing file/native gates; archive and 1→2→3 migration round trips; rejection/replay under stale revisions or lost responses; ID/reference conservation, Unicode/IME and focus behavior; keyboard/screen-reader/zoom usability; large-section and whole-book history growth, snapshot costs and responsiveness on target platforms. Checkpoints reuse unchanged section content, but long individual sections still cost new full section records at each retained edit. The 30-day eligibility rule and resource ceilings are provisional until user observations; no automatic deletion occurs. Cleanup frees reusable SQL pages, not a promised filesystem size reduction, and never removes blobs or migration/recovery copies. Comparison is readable text/structure, not a rendered historical document or word-level redline. Full history restore covers manuscript/outline/anchor state, not project title or destination.

No native, artifact, performance or user acceptance result is available. Stop here for the user's results; do not proceed automatically to Stage 10.
