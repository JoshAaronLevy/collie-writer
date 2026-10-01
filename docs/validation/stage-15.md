# Stage 15 completion record

September 30, 2026 — **implementation complete — awaiting user testing**. Requested scope: manual citation clusters and locators, authored footnotes with citations, offline APA/Chicago preview, shared note numbering, bibliography, source-reference/metadata preflight, occurrence projections and retained citation assets. Starting Git state was clean. No commit was created. Stage 16 has not been started.

Implementation paths:

- Contracts/IPC: `src/shared/citations.ts`, `src/shared/projects.ts`, `src/main/projects-ipc.ts`, `src/preload/index.ts`, `src/worker/index.ts`.
- Editing/UI: `src/renderer/src/editor/adapter.ts`, `ReferenceTools.tsx`, `RichDraft.tsx`; `features/projects/CitationsPanel.tsx`, `Projects.tsx`, `SourcesPanel.tsx`; `assets/main.css`.
- Persistence/formatting: `src/worker/projects/citations.ts`, `citation-occurrences.ts`, `citation-assets.ts`, `manuscript.ts`, `repository.ts`, `sources.ts`, `snapshot.ts`, `incoming.ts`, `manifest.ts`, `portable-db.ts`; `src/worker/storage/schema.ts`, `migrations.ts`; `src/worker/citations/processor.ts`.
- Documentation: plan, AGENTS, [decision](../decisions/stage-15-citations-and-footnotes.md), [schema 8](../formats/working-project-v8.md), archive format addendum and [manual guide](../manual-testing/stage-15.md).

SQL and minimum reader advance 7→8 using retained-copy migration; AST/container remain 1. Existing schemas 2–7 remain accepted for local migration. Occurrence projections rebuild atomically for document edits, outline transformations and manuscript restores. No persistent citation-string/number cache was introduced. A style preference change retains a manuscript checkpoint and uses expected-head/idempotent mutation. Independent manuscript history does not restore source metadata or style settings.

The source picker supports clusters, item order, replacement and all AST 1 locator types. Footnotes use paragraph bodies with formatting and citations; no nested notes. Editor-only body attributes make reference/body changes part of normal manuscript history and serialization extracts the existing canonical dictionary. Copy remaps identities; a same-project cut can retain unused identities. The worker still rejects live global identity collisions. Composition and unsupported clipboard structures retain user text rather than acknowledging an unsafe save.

Worker preview uses the existing frozen compilation/citeproc pipeline, active outline order, a shared author/automatic-note counter and all-cluster disambiguation. Reference issues block formatting; incomplete/unreviewed metadata can be acknowledged for the current draft preview only. Actual citation clusters are distinguishable from evidence associations. Stage 16 must apply the same issue categories to captured export input and obtain revision-specific metadata acknowledgment.

The exact offline profile remains `csl-v1`:

| Asset | SHA-256 |
| --- | --- |
| APA 7 (`apa-7`) | `1ece4fb3c295e66d04b4394e295aa58a87741ceeef1658192437eb9953c2f13e` |
| Chicago 18 (`chicago-18-notes-bibliography`) | `4b6be4bceaf8f3c31b49331c9f9e38c977f666d6ab80e19a2ac8482c7511abeb` |
| English US locale (`en-US`) | `ac864c7c21166b4390d82c31792cdc509400727fa0060b43d8aa17e07f9cb079` |
| Style notices | `eeda35e6ab1c71ef74ba98e8d63f3f5c07e1b1c458b92d54cdd7515afcb1b04e` |
| Locale notices | `f8e1b34d3e1b66f101b45bc45e5fca0397aa923fe4abeab6f98139c8f731c320` |

These are existing source-declared pins, not new assistant-measured results. Runtime product code validates retained bytes, and both previews and archives use them. Pinned citeproc 2.4.63, CPAL attribution/source redistribution and CC BY-SA notices remain unchanged. No new dependencies, remote requests or arbitrary styles were added.

No test code, fixtures, harnesses or verification automation were added. No tests, typecheck, lint, formatting/audit check, build/package check, app/server/browser launch, screenshot, benchmark or assistant-owned manual operation was performed. Source/Git inspection does not establish passing behavior. The React guidance skill informed component structure and request cleanup; no skill checks were executed.

**No platform, clipboard/IME, migration/restore, source-repair, history, responsiveness or independent APA/Chicago fidelity result exists for this implementation.** All stage acceptance boxes remain unchecked. D3–D5 fidelity and later DOCX/PDF pagination gates remain pending. Stop for Josh's manual feedback before Stage 16.
