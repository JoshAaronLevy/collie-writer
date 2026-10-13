# R3-01 — Open chats directly

October 12, 2026 — **implementation complete — awaiting user testing**.

Reviewed the complete [round-three plan](../../uat-round-3-implementation-plan.md), repository stage/data/manual-testing guidance, current conversation/import owners and live preview callers, the retained import contract, RF12 evidence, and the schema-38 curated-import correction. Starting HEAD was `90b2bd3`, with a clean working tree. Earlier Import/runtime acceptance remains pending; no previous success is inferred.

## Changes and ownership

- `ConversationPanel.tsx` removes Search and history, title search, Find, imported-history disclosures, and the nested preview. Archive/active switching lives in Chat options. Imported bodies render directly with the existing basic Markdown and Research-link owners. Native turn rendering, streaming, protected requests and recovery keep their existing paths.
- `conversationState.ts` keeps one selected chat, draft/protection owner and provider. Search the web defaults to checked, with explicit per-chat choices retained for the current project session. The Mantine checkbox permits unchecking an unavailable search route; its description uses the existing text capability reason or route-specific explanation. Send still requires the current account/model/review capability and remains explicit. Text-only retry stays unchecked.
- `useImportedTranscript.ts` isolates read-only paging/cancellation. Imported reads start at the prefix tail for imported-only chats, or when native upward paging reaches the prefix. Pages contain at most 10 imported entries, with at most 20 mounted. Text slices load sequentially for this window, preserving UTF-16 offsets and immutable message/revision identity. The existing worker still validates original text digests, span boundaries and text-part mappings. Complete text is reused only for matching immutable keys/lengths. Actual failures expose Retry; switching scope, selection, opening or source cancels continuation/publication of stale results.
- Imported forward/backward paging retains overlapping messages and trims the opposite edge. A non-tail imported window hides the native suffix until the imported boundary is reached, avoiding a visible gap. Current native revisions refresh the bounded imported window using exact targets instead of replaying stale cursors. Existing native mounted-turn limits remain.
- Stable imported message IDs and native attempt IDs anchor scrolling. Initial loading cannot settle the bottom before text is ready. Resize observation handles text/layout growth while respecting upward reading. Fresh title selection and Jump to latest reload the tail; the latter is a read-only reset that remains available while requests are busy; explicit Send returns to the current native reply. Typed native/imported reveal targets override ordinary bottom scrolling.
- `ImportedOrigins.tsx` uses the retained controller to navigate to the exact accepted message. Project/scope, navigation, composition, pending-operation and edit guards remain. Research/Notes still owns provenance disclosure. Both old preview callers have been removed, so `ImportTranscriptPreview.tsx`, `ConversationFind.tsx`, their search-only controller methods and unused styles are deleted.

## Boundaries and compatibility

`src/shared/conversation-transcript.ts` adds only optional `range: 'imported'` to `transcript-read`. Its exact validator rejects other range values and native targets/cursors for that range. Existing requests without the field retain combined behavior. Main IPC and worker admission already delegate to that shared validator. Existing `isConversationValue`/`isTranscriptValue` result admission remains unchanged because the reply shape and existing maximum limits are unchanged.

`src/worker/projects/conversation-transcript.ts` avoids scanning native keys for imported-range pages and imported text slices. Combined transcript, exact target, export and historical readers remain. No database migration or persisted format change: SQL/minimum reader stays **38**. Original files, graph bodies, excluded material, variants, imported links, native attempts/captures, drafts, history and recovery are preserved. No new provider route, inference-on-read, dependency or account authority was introduced.

`.prettierignore` narrowly protects Josh's original `uat-notes.md` formatting. The first formatter pass touched those notes; that formatting-only change was restored from the clean starting HEAD before adding the exact-path exclusion. Existing sample/vendor/generated/historical-test exclusions remain; authored application source is not excluded.

## Source ledger

Relative to `90b2bd3`, application source is **627 added / 771 removed = −144 lines**, including the new imported-read hook. Separately, documentation is 89 added / 38 removed = +51 lines, and `.prettierignore` adds three lines. The new bounded text/paging owner replaces two preview/search components and their controller/UI state; no second conversation owner remains. RF01–RF18's historical ledger is unchanged.

## Checks and acceptance

Using pinned Node 24.21.0, `npm run format` → `npm run lint` → `npm run typecheck` all passed with no warnings or errors, including both node and web typechecks. The first typecheck found a nullable recovery-target ID, corrected by requiring an actual attempt ID before constructing native reveal input. No diagnostic rules were suppressed or weakened.

No test code, automated tests, builds, launches, browser automation, screenshots, benchmarks or runtime checks were added or performed. Source inspection is not a passed runtime test. Follow the [manual guide](../manual-testing/uat-R3-01.md); all user outcomes remain pending. R3-02 and R3-03 remain unstarted. Runtime acceptance and release eligibility are not established by this stage.
