# Stage 14 manual acceptance guide

Stage 14 complete. As a user:

1. Open the app with a disposable project while offline. Add a distinctive phrase to a draft section, a note, a source title or other metadata, a claim or question, and a small extracted PDF or plain-text page. Once each change is protected locally and indexing reports complete for the current head, search that phrase. Results should identify their material type and open the matching section, note, source, claim/question or retained source page.
2. Try a phrase with Unicode letters, mixed case and punctuation. Search should treat the entered text as a literal phrase, show a highlighted passage as plain text and never interpret it as query syntax or HTML. Narrow results by type, a note tag, linked section and source; only matching local entries should remain.
3. Type a new phrase in the draft without committing it yet. Search should not claim the new text is indexed. After the editor protects the change locally and the index catches up, the new phrase should appear. Edit or remove previously indexed text; an old hit should be marked stale or removed until the index refreshes, then disappear.
4. Inspect a source with a text page and another with no selectable text or incomplete extraction. The text page should be searchable. Activity should show saved text/no-text page counts and list active sources whose selected version still needs full inspection. Reimport and activate a changed source version; hits for retained old pages should be labeled **older version** and should open that retained page.
5. With a disposable project containing enough material to make indexing visible, choose **Cancel indexing**. Activity should say cancelled and retain project content. Choose **Retry or refresh index**, then **Rebuild local index** after completion; progress should restart and search should return without deleting notes, excerpts or source originals.
6. While indexing that disposable project, close and reopen the app normally. If work was interrupted, activity should say interrupted and offer a manual retry; it should not claim completion. Search again after the retry reaches the current head.
7. If you have a larger disposable library or manuscript, type and save while indexing and note your platform, approximate corpus size, and any responsiveness or timing issue. No automated benchmark is needed.

Please report your platform and any mismatch. The assistant has not performed these actions or run any automated checks.
