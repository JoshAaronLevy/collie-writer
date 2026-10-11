# Local import evidence v1 — IH01

October 10, 2026. SQL/minimum reader **33**, review **3**, confirmation manifest **3**. Recognized-reader evidence reaches the existing automatic summary/commit backend without an AI result. IH01 supplies that foundation; IH02 connects ordinary Submit to it.

## Evidence and original ownership

`LocalImportEvidence` is embedded in review v3 with `kind: local-reader`, evidence/reader version 1, the exact graph revision/settings, graph-page descriptor digest, full record and relationship digests, and coverage counts. The review's graph ID/digest identifies the immutable graph manifest, including every selected original's file ID/hash, reader, status and issues. Graph pages retain every record, original text locator/hash/range, relationship and omission detail. No duplicate transcript JSON, new blob owner, provider attempt, analysis plan, selected proposal or execution grant is created.

Candidates are original conversation/message/source/note representations with `eligible: true` and `disposition: candidate`. Eligibility already reflects the selected categories and known reader's path/role/disposition policy. Coverage distinguishes total records, candidates, retained records, unread files and unresolved/unsupported records relevant to the selection. Counts are preparation coverage, not accepted destination totals. Original labels remain original labels; existing deterministic destination-title fallbacks do not manufacture bibliographic facts or transcript/note bodies.

Only blank/whitespace instructions are admitted. Local preparation cannot claim to interpret arbitrary instructions. AI mapping and interpretation need their own evidence versions in later stages; they must not pretend to be this local reader.

## Writer and summary

`review-local` takes the existing writable project/workspace scope, batch ID, graph ID and exact expected batch revision. Main treats it as an import mutation under existing pending-work guards. IH02's ordinary Submit is its renderer caller. The worker:

1. Requires the current preparing, unaccepted selection and blank instructions.
2. Reads the existing graph/content pipeline and binds its immutable settings and pages.
3. Reuses an exact existing local review by deterministic identity; no repeated head write.
4. For new evidence, checks selected original bytes, every graph page through the shared graph validator, and complete eligible original message/note text. Existing capacity/head/revision guards protect installation.
5. Installs review v3 and its normal state selector atomically. No conversations, sources or notes are accepted yet.

New local authoring refuses a batch with previous AI captures or historical reviews. It cannot silently replace earlier findings or human exclusions. IH06 owns explicit legacy transition. The existing older authoring/recovery path stays available in the meantime.

Local reviews have `planId: null`, `proposalId: null`, and `results: []`. Review identity hashes `['import-review-local-v3', graphId, evidence]`. Empty provider results do not block local `review-automatic`; earlier review versions still require usable provider evidence. The existing automatic choice, duplicate matching, dependency resolution and literal note/source preparation owners remain authoritative.

Manifest v3 uses null plan/proposal IDs and existing entry v2, automatic choice revision v2, commit command v1, receipt v1 and operation result v2. Its `resultsDigest` is the digest of `{ contract: 'import-local-evidence-v1', graphId, graphDigest, evidence }`; older manifests keep the exact earlier digest of their provider results. This discriminated meaning prevents fake AI evidence and binds acceptance to the normalized originals.

Summary counts come from exact manifest entries. Empty, already-present and ready remain separate outcomes; `partial` also includes unread files or unresolved selected records. A partially read duplicate selection cannot be labeled wholly already-present. `omitted` retains its existing count of excluded destination groups; file-level limitations are carried by `manifest.partial`. Empty/already-present manifests are readable but cannot create an empty v3 acceptance receipt. Accept continues through the single existing atomic commit, including original bytes, identity, source revision, labels, project head and receipt-first replay checks.

## Portable admission and compatibility

SQL admission checks the local discriminator, supported schema, deterministic review identity, exact immutable graph/revision/settings/page hashes and manifest evidence digest. Blob admission recomputes record/relationship digests, candidates and coverage over all pages. Live preparation and commit use the same checks. A zero-page graph still validates its empty local evidence/manifest; historical nonlocal graph evidence keeps its earlier restrictions.

Schema 33 makes only `import_reviews.plan_id` nullable. All earlier DDL remains frozen. The retained-copy migration rebuilds that one table from app-owned DDL, preserving exact row bodies, keys and rowids (historical review inheritance uses row order). Child references remain enforced, deferred until transaction commit while parents are restored. This uses SQLite's documented [deferred foreign-key enforcement](https://www.sqlite.org/pragma.html#pragma_defer_foreign_keys) and [DROP TABLE behavior](https://sqlite.org/foreignkeys.html#section_5). The pragma resets at commit/rollback; it is not disabled before validation. The existing migration owner retains the original database and admits the candidate before switching its pointer.

Archive schema/minimum-reader admission accepts 33. Save, reopen, independent-copy rekey and retention already carry the complete review/choice/manifest tables, graph pages, originals and receipts; there is no new table or blob family to register. Local evidence contains no outer project/workspace ID, so copies preserve its digests while the existing owner rekeys outer rows. Copied data grants no execution/acceptance permission.

Accepted transcripts, source/note origins and imported follow-up context depend on graph/original/commit ancestry rather than provider plans. Those formats and readers remain unchanged; the expanded review/manifest admission supports their local provenance. Frozen AI capture, proposal, framing and historical review validation/digest rules are unchanged.

## Stage boundary and cleanup

IH01 added the backend evidence foundation without a new visible route. IH02 now supplies local Submit, disconnected readiness and local summary refresh. Neither stage adds a parser/mapping editor, UI mode, new source extractor or inference behavior. The two-modal UX is unchanged.

New evidence shares graph/content/automatic/manifest/commit implementations. Historical analysis readers and old-work continuation/recovery remain necessary until IH06 transition, with the final removal pass in IH07. No historical tests or user data were changed or removed.

## IH02 — Ordinary Submit and recovery

New selections protect form choices, reuse the exact retained graph (configuration already invalidates changed settings), call `review-local`, and use the existing `review-automatic`/summary/Accept pipeline. Local preparation requires no account, catalog, selected model or quota check. No AI plan, provider request or execution grant is created. The model dropdown remains contextual to later interpretation. Nonblank instructions pause with a clear temporary limitation; unknown/unread/unsafe content remains evidenced as omissions and may produce a partial/empty summary. There is no old full-file recognition fallback.

Local phases are finite command working states, not estimated AI progress. Summary shows actual manifest totals and “Processed locally; no ChatGPT requests.” `manifest.partial` is honored even when `omitted` is zero. Accept finalizes the available findings through the unchanged atomic owner; Cancel returns to setup and Save retains preparation without accepting it.

Current graph/review/manifest reuse avoids repeated writes on unchanged Submit. `review-found` adds transient `local: boolean`, with a local review ID and no legacy attempt, so restore can read local summary/receipt without provider reconciliation or plan creation. A local review without a manifest remains prepared until explicit Submit/View available results. Stale project heads refresh a local manifest only after existing draft protection; the user reviews and Accepts again.

Cancellation latches before subsequent command scheduling; an in-flight local command can finish and remain retained. Unknown `review-local` keeps its exact scope/batch/graph/revision and blocks mutation until read-only `review-find` identifies the saved deterministic review or its absence. Unknown automatic commands use exact `review-reconcile`; unknown Accept uses unchanged `import-outcome`/receipt-first recovery. Reopen performs read-only restoration. No local result or project copy grants inference/acceptance authority.

The sole remaining renderer `plan-prepare` adapts an already-retained valid single-request response; `plan-review`/`plan-start` require explicit continuation of a restored older plan. These and old protected-output/receipt readers remain compatibility obligations until IH06, not normal new-import routes. Persisted contracts/schema and original text/ordering/source-origin/duplicate rules are unchanged by IH02.
