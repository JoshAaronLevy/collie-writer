# Stage 16 manual acceptance guide

Stage 16 complete. As a user:

1. When I launch Collie Writer (from this checkout, `npm run dev`), open a disposable project and use **Compile and export DOCX** to include all active writing sections, I should see a compilation preview with the captured revision, selected order, style, Letter/A4 preset and counts before choosing a destination.
2. When I deselect a chapter or section, reorder the remaining sections and refresh the preview, I should see only that selection in the chosen order; the resulting DOCX should have matching headings, writing, citations, notes and a bibliography derived from that subset.
3. When I prepare writing with headings, bold/italic links, lists, a table, a managed image with alt text and caption, a page break and an authored footnote, then export Letter and A4 copies and open them in Word or LibreOffice, those supported elements should appear as editable document structures, the page preset should match, and page numbers and genuine notes should appear.
4. When I leave a cited source missing or trashed, or remove access to a selected managed image in a disposable copy, the preview should name the blocker and the export button should stay unavailable. When a source has incomplete or unreviewed metadata, I should see a separate warning and have to acknowledge it for that captured revision.
5. When I start an export and continue editing while it renders, I should still be able to write; the export report and DOCX should identify the earlier captured revision, and my newer edits should remain pending local/project-file protection according to the ordinary save indicators.
6. When I choose an existing disposable DOCX and cancel the replacement confirmation, its bytes should remain unchanged. When I confirm replacement, the new DOCX should appear only after publication and the prior DOCX should remain beside it with a unique `.previous.docx` name.
7. When I cancel a rendering export, or an export fails before publication, I should see a cancelled/failed state and the previous destination and project save state should remain intact. If publication is interrupted, I should inspect the retained local report/candidate and prior file before taking any further action.

Please report the OS, Word/LibreOffice version, which actions you tried, and any content, note, image, link, layout or replacement mismatch. No assistant-owned runtime or reader result is recorded for this stage.
