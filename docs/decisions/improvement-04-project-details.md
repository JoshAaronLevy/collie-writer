# I04 — Durable nonfiction project details and frozen output metadata

October 1, 2026. **Implementation complete — awaiting user testing.** The full improvement plan was reviewed, including the I03 ownership dependency and later wizard/export/provider boundaries. Product choices remain settled: Mantine, semantic scoped styles, seven nonfiction types, no provider-owned byline and no dedicated critique engine. No tests or runtime observations were performed.

## Product and persistence

[Working schema 10](../formats/working-project-v10.md) specifies the new portable record, mapping, exact commands, receipt rules and complete consumer matrix. A separate strict `project_details` table avoids rewriting existing project/manuscript SQL rows. Its revision is a project commit ID. Create remains one atomic transaction after a durable local intent. Update changes metadata only, checks both project head and details revision, and keeps the same exact operation for an unknown outcome. Every new command is authorized in main before entering the worker.

`features/project-details/` owns Mantine fields shared by a transitional New project form and the usable Project actions → Project details form. Its CSS Module uses `project-details-form`, `project-details-fields`, `project-type-description` and `project-details-actions`. Export metadata controls have their own `ExportMetadata.module.css`. No page rules were added to global CSS, no utility-class system was introduced, and the production CSP/theme configuration is unchanged.

The setup form exposes all seven approved categories and their empty starting sections now, because the durable create contract must have a real caller. I05 still owns visually designed primary/secondary cards, steps, author preference and restart-resumable setup; this is not a claim that the final wizard has shipped. No example prose or manual bibliography is inserted into personal projects. Critique copy directs users to the existing source tools without claiming automated intake/retrieval/refutation.

The details form is retained with the workspace, registered as an explicit-save draft, and shows adjacent field errors. Save first protects the other drafts, then dispatches the bounded metadata transaction. Successful metadata results merge into session state without resetting the rich editor or changing its active section, selection or Undo history. Unknown results freeze the exact input and expose Retry. Known stale results leave the form intact; **Replace form with saved details** is an explicit discard/reload action, never an automatic rebase. Read-only projects display their stored details; clearing unsaved form input does not require editing rights. Access changes do not silently approve or discard project details.

Main's tutorial create call supplies `Collie Writer tutorial` as its byline and retains its existing provisioning sentinel/title flow. Neither that string nor imported fields can grant sample rights; the trusted sample slot remains separate. Legacy projects retain their titles, identifiers and authored outlines, gain mapped kinds and empty byline/description, and can keep an empty byline when edited.

## Compilation version 3

`CompileInput` and immutable `Compilation` now carry `metadata: { title, byline, description: string | null }` and `titlePage: boolean`. Metadata is captured while the repository serial boundary holds the same head as sections, citations and image inputs, before rendering begins. The compiler copies and freezes it. Citation-only formatting passes the same metadata contract with description excluded and title page off; it does not publish metadata.

Export options add two explicit booleans, both off initially:

- **Include a title page with title and byline.** DOCX/PDF render it before the selected writing; Markdown/text prepend literal title/byline text. Description never appears on that title page.
- **Include the project description in DOCX/PDF document properties.** The description otherwise becomes `null` before compilation and is absent from default output metadata and job capture. This option never adds description to Markdown/text or manuscript pages.

The preflight digest binds the captured head, section order, style, paper, captured metadata and title-page option. Changing a choice/head invalidates the visible preview. Export re-prepares under the boundary and requires matching head/digest. A running job renders only its captured model; later project edits cannot change its author/title. Device-local export manifests retain the compilation version, captured metadata (description only when chosen), title-page choice, and source map with the existing output reports. No content goes to diagnostics or a server.

| Output     | Default document properties                                                                                                  | Explicit title-page behavior                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| DOCX       | Project title and byline in core title/creator; description only when selected. An old project's empty byline remains empty. | Centered title/byline followed by a page break before writing; no description      |
| PDF        | Project title/author in PDF Info metadata; selected description in Subject; creator names Collie Writer                      | Escaped title/byline in the local print document with a page break; no description |
| Markdown   | No native metadata/front matter added                                                                                        | Literal escaped title/byline at the start; page layout cannot be promised          |
| Plain text | No native document properties added                                                                                          | Title/byline at the start; page layout cannot be promised                          |

Title-page content is derived presentation, not a manuscript section or source-map target. Existing selected-section counts exclude it; PDF page count includes rendered pages. Text reports disclose the lack of physical title-page layout. Loading a compilation recipe resets both metadata choices to off; recipes continue storing their existing section/order/paper/formats contract. They do not silently opt into sharing a description. I09 owns the final Export screen arrangement.

PDF.js is a reader and Electron's current print path does not provide this application's complete metadata contract. We retain Paged.js/Electron for page layout and add **pdf-lib 1.17.1** solely to set metadata on Collie's freshly rendered PDF bytes in the storage worker. Its documented [load/save and metadata setters](https://pdf-lib.js.org/docs/api/classes/pdfdocument) support this use. It does not process imported study PDFs, fetch assets or replace the selected pagination engine. Cancellation is checked around parsing/serialization and publication; these library operations are not immediately preemptible. Existing 512 MiB limits remain. Page fidelity, footnotes, scripts/fonts, memory use and viewer metadata display are unobserved.

The dependency is pinned in package/lockfile; exact distributed licenses for pdf-lib, @pdf-lib/standard-fonts, @pdf-lib/upng and its tslib version were copied into bundled notices. Existing pako notices are retained. Installation used `--ignore-scripts --no-audit --no-fund`; no validation/build/launch occurred. The shell reported Node 22.22.3/npm 10.9.8 versus the project's unchanged Node 24.21.0/npm 11.19.0 requirement. That warning is not compatibility evidence.

## Boundaries

SQL/minimum reader **10**, AST/archive **1**, compilation **3**. Originals and migration backups remain retained; native Save/Backup/Move/Restore/duplicate, recovery and old supported archive reads share the complete format contract. Schema-10 archives require this reader and are refused by older versions rather than silently losing metadata.

No AI SDK, account sign-in, network inference, new source engine, author-default preference, new recipe format, publication or release approval is included. No assistant checks, fixtures, testing UI or app/browser launch were added or run. [Manual guide](../manual-testing/improvement-I04.md) and [evidence](../validation/improvement-I04.md) track expected behavior separately from user-confirmed results. Native/packaged/output/migration/scale/accessibility and independent commerce/provider/release gates remain open; release remains NO-GO.
