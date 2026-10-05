# Stage 3 — Editor, citation and export subset

September 29, 2026. **Implementation complete — awaiting user testing.** D3–D5 architecture is selected; fidelity, target-platform and release acceptance are not established.

The full implementation plan and its cross-stage contracts were read alongside current source/configuration and Git state. The checkout was clean at the start of this stage. Stages 1–2 provide the prerequisite shell and worker implementation checkpoint; this record does not infer new user acceptance of those stages. No material product question prevented the Stage 3 adapter work.

## Changed paths and decisions

| Paths                                                                      | Implementation                                                                                                                                                                 |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/domain/editor/schema.ts`                                              | Versioned application AST, strict input validation, owned footnote bodies, copy identity remapping                                                                             |
| `src/renderer/src/editor/adapter.ts`                                       | Unmounted Tiptap community schema, stable block IDs, native ProseMirror history, composition guard, plain-text paste / explicit unsupported-paste handling                     |
| `src/domain/compilation/model.ts`                                          | Frozen editor-independent compilation, ordered citation/note numbering, stable source references, no project mutation                                                          |
| `src/worker/citations/`                                                    | Pinned local citeproc styles/locale, ordered citation updates, safe formatted-run conversion, bounded errors                                                                   |
| `src/worker/exports/`                                                      | Native DOCX structure and escaped paginated HTML, managed image byte boundary and font selection                                                                               |
| `src/main/printing/pdf.ts`, `resources.ts`, `index.ts`                     | Internal isolated print adapter; exact private resource URLs, no Node/preload/network, fonts/images/pagination readiness, timeout/abort cleanup; trusted bundle-root selection |
| `resources/{styles,locales,fonts,vendor,licenses}/`, `asset-manifest.json` | Pinned local assets/source/notices with provenance; version-qualified dependency license inventory                                                                             |
| `src/main/menus.ts`, `src/renderer/src/App.tsx`, shell CSS                 | Required visible initial-session attribution and a real third-party licenses menu                                                                                              |
| `package.json`, lockfile, builder config, TS includes                      | Exact direct pins, resource allowlist, shared domain compilation coverage; existing test files/scripts unchanged                                                               |
| Plan, README, AGENTS, decisions/manual guides/license inventory            | Status, selected subset, current handoff and pending downstream gates                                                                                                          |

Decisions: [D3 editor/compilation](../decisions/D3-editor-and-compilation.md), [D4 citations/licenses](../decisions/D4-citations-and-licenses.md), [D5 local PDF](../decisions/D5-local-pdf-pagination.md). Dependency/license inventory: [Stage 3 licenses](../licenses/stage-03.md). Model recommendations and stable stage numbers are unchanged.

## Work performed and evidence limits

Read primary documentation and the actual package/license/API sources. Installed exact dependencies with the pinned Node/npm toolchain using `--ignore-scripts --no-audit --no-fund`; installation completed. Downloaded unmodified licensed production assets from recorded upstream commits, recorded hashes for pinning, and copied dependency notices. Those are implementation activities, not compatibility or security results. The install reported deprecated Paged.js transitive polyfills; see the license inventory/D5.

**The assistant did not add or run tests, test fixtures, generators, harnesses or testing UI. No typecheck, lint, audit, formatter/check, build/package command, app/server/browser launch, export generation, screenshot, benchmark or fault injection was performed.** Source inspection is not a passed check. No generated output, artifact hash, native execution or visual finding is claimed. The existing historical Stage 1 test code and disabled workflow remain untouched.

No data migration or storage adoption occurred. Schema version 1 is an implementation contract for Stage 4/8 adoption under copy-migration rules. No personal data, project file, user destination, database, cloud service, account or release channel was touched. No AI, payment or network-content feature was introduced.

## Pending acceptance and ownership

| Gate                                                                        | Status / owner                                                                                                |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Current shell attribution and bundled-notice flow                           | Pending user; [current manual guide](../manual-testing/stage-03.md)                                           |
| Build/type compatibility and packaged resource paths                        | Unverified; user-owned build/launch on native targets                                                         |
| Editor loading, IME/paste/undo, stable anchors and clipboard ownership      | Unverified; Stage 8 production UI integration and user results                                                |
| APA/Chicago output, repeated references and disambiguation                  | Unverified; Stage 15 product path / independent user style review                                             |
| DOCX content, native notes/tables/images and Word/LibreOffice compatibility | Unverified; Stage 16 capture/destination workflow and user outputs                                            |
| PDF long/boundary notes, table splitting, fonts and 300-page behavior       | Unverified; D5 stays pending until Stage 17 user results; bounded correction then Typst fallback if necessary |
| macOS arm64/x64, Windows x64; Windows arm64 candidate                       | No Stage 3 artifacts built or launched; no target accepted                                                    |
| Final legal notices, font embedding and source delivery in signed artifacts | Engineering obligations implemented; actual artifact/release review remains pending                           |

The adapters are not wired to worker job IPC, a writing screen or export menu. That is the explicit Stage 3 boundary, not a test-only interface gap to fill. Limits include one-level lists, paragraph-only quotations, plain table cells, two fixed English styles, bounded in-memory image/export handling and unproven glyph/pagination behavior. Production toolbar/clipboard/source metadata warnings, snapshot capture/blob leases, job progress and safe destination replacement remain their owning stages.

User-reported results: **none supplied for Stage 3**. [Deferred fidelity scenarios](../manual-testing/stage-03-pending-fidelity.md) describe future actions without asserting those screens already exist. Stop after the current guide; Stage 4 has not begun.
