# Improvement I04 — Project details and nonfiction templates

October 1, 2026. **Implementation complete — awaiting user testing.** No user acceptance or runtime results have been supplied. This implements the explicitly requested I04 and completes its previously requested I03 ownership prerequisite handoff. I05 has not begun.

## Delivered source and documentation

| Paths | Change |
| --- | --- |
| `src/domain/projects/templates.ts`, `details.ts` | Authoritative seven-kind/template/label/empty-outline mapping and shared text rules |
| `src/shared/projects.ts`, `src/domain/capabilities.ts` | Required create fields, exact details command/head/revision checks and expanded project readers; details requires edit capability |
| `src/main/projects-ipc.ts`, `src/preload/index.ts`, `src/worker/index.ts` | Narrow details API wired across trusted boundaries |
| `src/main/entitlements/service.ts` | Explicit trusted tutorial create fields; main-owned sample privilege unchanged |
| `src/worker/projects/repository.ts`, `details.ts` | Atomic create/update, current details reads/list kind, rename revision integration and exact receipts |
| `src/worker/storage/schema.ts`, `migrations.ts` | Retained V9 schema; strict V10 details table; retained-copy 9→10 step and candidate validation |
| `src/worker/projects/portable-db.ts`, `manifest.ts`, `snapshot.ts`, `incoming.ts` | Detail-row validation, reader/writer versions, old archive support and independent-copy rekey |
| `src/renderer/src/features/project-details/*` | Mantine New project and Project details forms; scoped semantic CSS, errors, explicit-save guard and retry/reload actions |
| `features/workspace/useWorkspaceController.ts`, `WorkspaceViews.tsx`, `features/projects/LifecyclePanel.tsx` | Required create payload, metadata-only session merge, library type labels and details/lifecycle integration |
| `src/shared/exports.ts`, `src/domain/compilation/model.ts`, `src/worker/exports/prepare.ts`, `src/worker/projects/citations.ts` | Exact export options, frozen metadata at captured head, compilation 3, preflight/digest consumers |
| `src/worker/exports/docx.ts`, `html.ts`, `interchange.ts`, `pdf-metadata.ts`, `jobs.ts` | Default author/title properties, chosen title page, explicit description policy, immutable job manifest and local PDF metadata |
| `features/projects/DocxExportPanel.tsx`, `ExportMetadata.module.css` | Real export choices, preview invalidation, recipe option reset and semantic scoped controls |
| `package.json`, `package-lock.json`, `resources/licenses/NOTICE.txt`, `resources/licenses/dependencies/*` | Pinned local PDF metadata library and exact distributed notices |
| [Format](../formats/working-project-v10.md), [decision](../decisions/improvement-04-project-details.md), [manual guide](../manual-testing/improvement-I04.md), AGENTS, plan, privacy/accessibility/guide index | Full consumer matrix, boundaries and user-owned acceptance handoff |

`archive.ts`, `project-files.ts`, file/lifecycle/shared storage result readers and `storage-worker.ts` retain their central validated contracts; the matrix explains how they consume the expanded schema/project results without introducing a parallel copy path. No asset graph is removed. No chosen file or actual working database was opened or migrated by the assistant.

## Execution and formats

SQL/minimum reader **9→10**, compilation **2→3**. Editor AST **1** and archive container **1** are unchanged. Migration operates only on a backed-up candidate at runtime and retains originals on failure. New templates affect new outlines only. Older stored bylines may remain empty; legacy titles and References sections are preserved.

Read source/configuration/docs and Git state; edited implementation/docs. Installed pdf-lib 1.17.1 with lifecycle scripts, audits and funding output disabled; four packages were added. Installation reported the existing engine mismatch (shell Node 22.22.3/npm 10.9.8; project pins 24.21.0/11.19.0). No build/toolchain compatibility is inferred. Consult the pinned toolchain in the manual guide.

**No test code, fixtures, mocks, harnesses, verification scripts or testing-only controls were created/maintained. No tests, typecheck, lint, audit, formatting checks, build/package commands, app/server/browser launches, screenshots, benchmarks, CI checks or delegated equivalents ran.** Production input/format/output validation remains implemented runtime behavior, not an executed check. Source inspection is not a passed test.

## Pending results and boundaries

- User results: **none**; all manual steps remain pending on macOS and Windows.
- Native migration/backup/pointer publication, old-file/open/save/duplicate/restore round trips, disk/interruption behavior: unobserved; originals retained by implementation, no failure injection performed.
- Field usability, Unicode/IME, focus, themes, contrast, 200% zoom and screen readers: pending user observations.
- Frozen metadata under later edits, PDF/DOCX properties in real readers, title-page pagination, large-export memory/cancellation, fonts and footnotes: unobserved. Earlier output-fidelity gates remain.
- Description is excluded by default and never printed on the title page. Optional inclusion is restricted to DOCX description / PDF Subject and that local export capture. No AI/network path was added.
- The transitional create form is usable, but I05's guided cards, resumability and author preference remain unimplemented. Study critique includes only its category, intent and empty outline.
- I01 provider eligibility/funding gates and existing commerce, native signing, MAS/MSIX and release gates remain unresolved. Release remains **NO-GO**.

Record dated platform/action/actual-outcome details here only when Josh supplies them. Stop for the [manual guide](../manual-testing/improvement-I04.md); do not advance to I05 automatically.
