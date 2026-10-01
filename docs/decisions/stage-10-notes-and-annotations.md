# Stage 10 notes and annotations decision

September 30, 2026. Implement human-only, project-local notes in schema 4, using the existing editor adapter with a bounded subset. Keep note revisions independent of section revisions. Keep multiple section links and label memberships in separate project-scoped tables. Use reversible note and label states; capture prior note state in `note_revisions` before edits or moves to trash. Label merge preserves notes, moves memberships to the selected existing label and archives the old label.

Anchor text mapping is conservative: a comment remains attached only if its exact selected text survives entirely in an unchanged prefix or suffix of its stable block. Overlap or removal makes it visibly orphaned. Store original quote separately from human interpretation. Structural section moves update the anchor's owning section in the same transaction. This does not add sources, claims, AI, global capture or browser integration.

Durability and portability use the existing serialized repository, SQLite transaction, operation ID and snapshot paths. NotesPanel flushes before parent project switch, file actions and close; local recovery survives selected-file Save failure. Native behavior, IME/focus details, backup round trip, large note performance and migration remain user-owned acceptance gates. No assistant validation or app launch occurred.
