# Stage 15 — Manual citations and author footnotes

September 30, 2026. Implementation selected; all runtime and fidelity acceptance awaits Josh's manual results. Prerequisite implementation checkpoints are Stages 3, 8, 11 and 13. [D3](D3-editor-and-compilation.md), [D4](D4-citations-and-licenses.md) and [D5](D5-local-pdf-pagination.md) remain the underlying selections. No dependency or license selection changed.

## Editing and identity

The existing AST 1 supports clusters of up to 100 source items with page/chapter/section/paragraph/volume locators, prefix and suffix. The source picker uses active project sources; existing removed/merged items stay visible and require explicit replacement. Generated citation text is an atom, not editable source metadata. Clicking an atom selects it for the citation inspector. Actual citation clusters are listed separately from evidence/source-section associations.

Author-footnote bodies contain paragraphs, formatted text, links, hard breaks and citations. The body editor rejects nonparagraph structures and nested footnotes, including rich paste. Escape or Return to reference restores manuscript focus. Body edits update the manuscript's normal transaction/history/autosave flow; an active note composition blocks serialization just like manuscript composition. The temporary editor-only body attribute is removed before strict canonical validation and persistence. Undo of a reference deletion retains its body in editor history.

Internal copy carries the full rich slice, including note bodies. Copies remap block, citation and footnote identities while preserving source IDs and locators. A single same-project cut/paste preserves available identities; already-restored identities are remapped, and subsequent pastes are copies. Cross-project managed-reference paste is refused; users may paste plain text. Native within-editor moves and outline moves retain IDs. Cross-section cut/paste can rehome a previously deleted anchor, while live identity collisions remain rejected. Plain clipboard text includes selected citation labels and author-note bodies. Clipboard content remains bounded and active external HTML remains refused.

## Offline formatting and preflight

The worker compiles active text sections in depth-first outline order using the existing immutable compilation adapter and citeproc 2.4.63. APA 7 uses inline author/date citations; Chicago 18 creates automatic citation notes in prose. Author notes and automatic Chicago notes share one counter. Citations inside author notes receive that note's index and never create another note. All clusters are processed before resolving text so later disambiguation updates earlier citations. Bibliography and note preview use inert text/mark runs, never raw processor HTML.

Preview labels carry the captured project head. Local edits clear the displayed labels until protection; source metadata/style/outline commits refresh the whole ordered context. Only cited active source records enter citeproc. No reference numbers, formatted strings or bibliography are saved as canonical content.

Missing, trashed or merged source references block formatting and have source/citation navigation. Merge aliases do not silently rewrite manuscript citations. Missing author/date, required type-specific publication fields, or unreviewed metadata produce a separate warning. The user can acknowledge metadata omissions for the current preview; acknowledgment resets after refresh or edits and never suppresses a broken reference. Stage 16 must carry these issue categories into frozen export preflight and obtain its own revision-specific acknowledgment; no export UI is introduced here.

The panel includes all retained current citation occurrences with their section state. Only active sections contribute to numbering and bibliography. Unknown ASTs remain rejected for repair rather than normalized destructively. Before a style switch, a manuscript checkpoint is retained; source revisions remain retained by the source library. Manuscript checkpoints do not roll back independent source metadata or style preferences.

## Persistence and assets

[Schema 8](../formats/working-project-v8.md) adds citation settings and actual occurrence projections. The 7→8 migration uses retained copies; current-document commits and outline/history transforms maintain projections transactionally. Portable validation checks projection equality and ownership; independent copies rekey both tables. New archives use schema/minimum reader 8; old archives through 7 remain readable via local copy migration.

`csl-v1` retains the existing exact APA 7, Chicago 18 notes/bibliography, en-US locale and two notice files. `src/worker/projects/citation-assets.ts` is the authoritative five-file hash/size inventory. On first use for a new workspace, the app validates bundled bytes and durably publishes a workspace copy. Restored workspace assets are read and validated directly. Preview and subsequent snapshots use these retained bytes; no URL in CSL causes a fetch and corrupt retained files do not fall back to another style. Arbitrary CSL/journal styles are not supported. There is no automatic asset-profile update on launch.

D4's CPAL selection, initial-session prominent attribution, processor source distribution and style/locale notices remain intact. This stage adds no third-party dependency or network activity.

## Pending acceptance

No tests, typechecks, lint, format/audit checks, builds, launches, screenshots or benchmarks were performed. Independent APA/Chicago review, repeated-note/disambiguation fidelity, IME and clipboard behavior, history conservation, macOS/Windows migration/save/restore and large-manuscript responsiveness remain unverified. Stage 16/17 export fidelity and physical note pagination remain separate gates. See the [manual guide](../manual-testing/stage-15.md).
