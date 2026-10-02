# I08 — Research workspace and source context

October 2, 2026. Implementation complete — awaiting user testing. This stage follows the full improvement plan, I03's persistent draft/navigation contract, I07's retained writing/companion contract, and MVP Stage 10–14 revisions, source originals, excerpts, evidence and local-search contracts. No user acceptance result has been supplied.

## Scope and the additional I08 instruction

Josh's I08 note requires source use to be visible in both Research and writing, including section/chapter context and useful navigation. The implementation uses the existing local evidence read model; it does not infer that an association proves a claim, insert citations automatically, or introduce an argument-analysis engine. The note and the Astra / Extra High recommendation remain intact in the plan. I07's accidentally reverted status has been reconciled from its existing implementation record, without marking it user-accepted.

## Presentation and ownership

- Sources has a searchable list and a selected detail with Usage and context, Citation details, and Originals and history. Creating a source is deliberate; extended publication fields, manual section links, retained provenance, merge/trash controls, bibliography export and import reports are disclosed on demand. CSL JSON, BibTeX and RIS retain their preview, per-record decisions and loss reports. DOI and URL remain inert metadata.
- Notes retains its one rich editor. Notes/inbox, passage annotations, and tags/categories are separate views. Labels use named dialogs and merge choices rather than browser prompts or pasted IDs. Annotation detail keeps the exact quote separate from interpretation, including archived/orphaned state. Related sections, questions and claims open their original owners.
- Questions & claims has collections for questions, claims and evidence links, each with a selected detail. Source decisions appear with their question. Candidate/kept/rejected states, rejection reasons and revision history remain reversible. Evidence detail keeps role, review state, removed state, exact excerpt and provenance distinct from actual manuscript citations.
- Inspection follows a source to retained PDF/text originals. Original/version administration is in a disclosure; reading and selected excerpt context are primary. Transcription and correction forms open on request. Corrections create a new record and retain an explicit link to the earlier quotation. PDF rendering, local asset grants, extraction bounds/cancellation, no-OCR limits and immutable version rules are unchanged.
- Search has one phrase field, optional filters, numbered result context and disclosed indexing/coverage controls. Query, page and result-list scroll live in the retained owner. A pending search never presents results for a different query as current. Changed/removed results remain disabled. Index activity registers with existing global operation presentation.

These destinations sit outside the legacy `.projects` presentation, with Mantine controls and semantic research/component styles. Old research rules were removed from `Projects.css`; no feature CSS was added to root CSS. Existing static Mantine/CSP integration, local assets and citeproc attribution remain.

## Source usage semantics

`ResearchDataProvider` owns one derived, scope-bound snapshot of the existing `readEvidence` response. Evidence mutations can publish their returned snapshot; project-head changes refresh saved usage. Request sequencing prevents older reads from replacing newer results. Source/note editors retain their independent draft buffers and exact pending commands; the snapshot is not another editing store.

The shared model supplies four separately labeled relationships:

1. **Actual manuscript citations:** derived from saved ASTs, including footnote bodies. Counts deduplicate a source repeated within one citation occurrence. Each entry links to the exact section and citation identity. Retained archived/trash content is labeled, and merged targets are not silently followed.
2. **Manual section associations:** source-library organization only; they do not insert a citation.
3. **Evidence links:** human support/challenge/background/potential-use assessments, with exact excerpts when present, claim/section targets, review flags, changed target revisions, and earlier-version warnings. Removed links remain discoverable.
4. **Question decisions:** candidate/kept/rejected per question with the saved reason. Rejection does not remove any other relationship or citation.

Sources shows these counts in list rows and a detailed Usage view. The writing Sources companion uses the same snapshot for a selected text section or chapter, aggregating descendant sections. Counts retain inactive relationships with their states available in source context, rather than treating them as active manuscript output. Sources connected only through a claim's related section or a question's related section are labeled as evidence/decisions, not citations. An unrelated note association is not inferred as source use. These are saved-content counts, not export recipe counts; unsaved content and updating/error states are disclosed.

The companion remains read-only and opens the one Research editing owner. Its saved note/source reads now refresh with the project head. Notes also exposes questions/claims attached to the current section. There is no second manuscript, note or source editor.

## Navigation, exact context and retained drafts

The session keeps a bounded 20-entry **transient** Back trail. Before a guarded transition it captures the visible research owner's typed target (including selected source/detail, note/annotation, question/claim/link, or original/page/excerpt) or the manuscript block/reference. Switching projects clears the trail. Back uses the same protection and target-resolution path as other navigation; no path or file grant is stored.

Writing and Research expose Back. The source reader can return to its origin, and search results retain their originating search. Missing entities fail visibly. A merged section needs an explicit replacement action; the controller checks returned section identity and saved anchor presence before replacing the live editor. An archived/trashed section remains readable through existing outline/history paths. Citation navigation also resolves citations inside footnote bodies and opens the existing footnote editor. Repeated citation targets carry a new focus request. Back restores a stable block/reference, not an exact character bookmark across arbitrary edits.

Explicit research, annotation, import-review, label and transcription/correction drafts retain their existing transition guards. Source/note saves keep captured base revisions; refreshing saved data does not silently adopt a new revision for an older editing buffer. Reload/discard is explicit. Unknown source state/attachment, bibliography import, note/evidence and excerpt requests retain their exact operation IDs and payloads for retry. A pending original copy is retained in both the source library and the reader. Source merge retains the original selected identity so that its merged state and links are visible. Read-only/access enforcement remains in trusted commands; the existing source/note access-drain and close/update protections are preserved.

## Compatibility and pending evidence

No IPC command, worker mutation, package, network origin, persistent preference, schema or export format was added. Working SQL/minimum reader **10**, editor AST/archive **1**, frozen compilation **3** remain unchanged. Originals, retained source fields/reports, note/evidence revisions, annotations and excerpts use their existing portable storage. Native first Save, backup, independent copy and recovery rules are unchanged. No AI provider, OCR, automatic web retrieval, new bibliography format or specialized Study critique ingestion was added.

All visual, keyboard/screen-reader, IME, selection/footnote focus, saved-usage freshness, native file/parser, read-only/access-transition and performance outcomes are unobserved. Search and usage still use the existing bounded data contracts; this stage does not establish large-library performance acceptance. Source reasons are human assessments, not automated truth judgments. Packaged CSP and all independent release gates remain pending; release is **NO-GO**. See the [manual guide](../manual-testing/improvement-I08.md) and [evidence record](../validation/improvement-I08.md). No assistant tests, validation commands, builds or launches were performed.
