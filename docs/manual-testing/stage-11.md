# Stage 11 manual acceptance guide

Stage 11 complete. As a user:

1. Open a disposable local project while offline. Under **Sources and bibliography**, enter a journal article with a creator, date, DOI and URL, link it to two sections, mark its metadata verified and protect it locally. Reopen the project; the normalized identifiers, verification status and both section links should remain.
2. Import a small CSL JSON file with one supported record, one unsupported work type and an extra field. The preview should show a usable row, a per-record error, and the extra field as an export loss. Cancel once and confirm the library stays unchanged; choose the valid row and Skip the invalid one, then commit. The report and original raw record should remain visible.
3. Import BibTeX and RIS files containing supported records while offline. Their previews should show normalized metadata and any omitted fields; committing should add the records without fetching DOI or URL content. For a file with the same DOI or a similar title and creator, choose **Keep separate**, **Merge** or **Link** deliberately and confirm no silent merge occurs.
4. Link one source to several sections, then merge it into another source. The surviving source should keep the section links and attachments, while the old source ID remains represented by a retained alias/history. Move a source to trash and restore it; its metadata and links should return.
5. Attach a disposable PDF or text file to a source. The copy progress should advance, the attachment should show its type, size and checksum prefix, and the external original should remain unchanged. Save a copy of the managed original into a new unused location and open it. Remove the attachment link and confirm its prior identity remains listed for history.
6. Export all or selected active sources in CSL JSON, BibTeX and RIS to new files. The app should report project-only and unknown-field losses. If you have an independent reference manager, import each file there and compare the declared shared fields; report any dialect-specific mismatch.
7. Save or back up the disposable project, then restore or duplicate it. The sources, links, reports, notes/annotations and managed originals should appear in the restored copy. Use **Save copy** on a restored attachment and open it without relying on the original external path.

Please report any mismatch, platform and import dialect. These are manual user actions; no automated suite or assistant-run checks are part of this guide.
