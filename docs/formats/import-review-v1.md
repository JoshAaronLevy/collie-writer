# Project import review and confirmation v1

IM09, October 9, 2026. SQL/minimum reader **28**. This extends the [project import contract](project-import-v1.md) after [multipart analysis](import-analysis-v2.md). Review is local preparation; there is no final acceptance command or domain writer in this stage.

## Portable ownership

Schema 27 is frozen as `projectTablesV27`. The retained-copy 27→28 migration adds six strict tables: `import_reviews`, `import_review_revisions`, `import_review_choices`, `import_review_state`, `import_confirmation_manifests`, and `import_confirmation_entries`. Earlier tables, provider/capture/result/binding/handoff contracts, request digests and original bytes are unchanged. Independent copies rekey only the outer SQL project owner. Frozen commands omit project/workspace routing IDs; copies inherit no execution or confirmation authority.

A v1 review deterministically identifies an exact plan and explicit proposal selection. It freezes the graph ID/digest and the selected valid attempt/capture digests. Later analysis gets a separate review; corrections are never silently rebased onto a different analysis. Groups use the original kind and strong graph identity, never a title match. Every original is represented, including retained/internal/rejected/unsupported records. Only locally eligible candidates with every planned fragment identified by selected protected results can be included.

Each correction or exclusion uses an exact operation ID and expected review revision. Revisions are append-only deltas with sorted choice bodies, count/digest and parent; one explicit current selector owns the current choices. A repeat returns the saved outcome without another revision or commit. A different command under the same operation ID is a conflict. Read-only reconciliation first looks up the exact command: an applied operation returns its protected state; an absent operation reports **not applied** and does not retry a write. The window retains uncertain commands and unsaved forms until resolved or explicitly discarded.

Admission is bounded to 256 reviews per plan, 1,024 revisions and 100,000 cumulative choice rows per review, and 1,024 manifests per review. Choice bodies are at most 48,000 units; stored manifests at most 256,000; entries at most 60,000. Paged lists/variants/destinations have at most ten rows and bounded RPC envelopes. Source search has twenty rows. All bodies and requests enter the existing 256 MiB derived batch reservation and database/free-space admission. A refusal preserves earlier work.

## Review meaning

Original role, body, order, path, identity, participant/date facts and locators remain immutable. AI-suggested titles are separately labeled as inferred and become a correction only through an explicit user choice. Notes retain literal supported AST conversion and declared/unspecified authorship. Unknown fields, conversion losses, original kept/rejected/search distinctions and incomplete coverage remain visible. Oversized bibliography metadata stays in the original; a bounded user mapping can be supplied without claiming AI or original coverage for it.

Include/Exclude/Undecided is explicit. Eligible groups require a reviewed representative or an exclusion reason. Choosing a representation selects its original metadata/text/path; it does not make an omitted alternative analyzed. Acknowledgment resolves reviewable differences and conversion notices, never missing analysis or invalid endpoints. A message needs the exact included original chat envelope and supported selected/array ordering. Empty chats block confirmation. A blocking AI issue without record references is conservatively scoped to all originals supplied in that part; excluding those affected originals can leave independent completed material eligible for a partial preview. Sources may retain original-message provenance without creating a chat; unchecked categories never become implicit dependencies.

The explicit chat action includes the chosen chat plus its fully identified, unambiguous, still-undecided messages from that exact envelope in one revision. The disclosed count derives from saved evidence. Existing include/exclude choices are preserved; multiple competing representations or unfinished messages are left for individual review. The user's acknowledgment also covers retained message metadata/mapping notices. No sources, notes or unrelated chats enter this action.

Source fields use ordinary metadata normalization. Existing-source choices follow valid canonical merge chains and freeze the active source ID, revision and metadata digest. They never update metadata or verification. Removed/missing/changed targets block preparation until another explicit local choice. Matching names remain suggestions. Included source groups sharing DOI/ISBN/URL cannot create competing destinations; explicitly exclude duplicate occurrences or reuse the same existing source. Counts distinguish distinct reused destinations from source occurrences. Note tags/categories are corrected locally, deduplicated by ordinary normalized identity, and their destination IDs/current revisions are frozen in the manifest.

The explicit partial action records one revision excluding all currently undecided or blocked eligible groups and dependent messages/now-empty chats, with the user's reason. It never adds a missing dependency. Included valid independent material remains included. Review every exclusion before confirmation. An eventual accepted subset would finalize that batch once in IM10; leftovers remain retained and need another explicit batch.

## Immutable confirmation

Prepare confirmation first protects other retained project owners through the existing workspace flush. It refreshes current candidate state, refuses unresolved choices/dependencies/coverage, and captures the final head after its own portable preparation commit. The worker builds a header and sorted entries containing:

- Exact batch, graph, plan, review revision and proposal/result digest set.
- Protected file/intake/graph-page artifact references and hashes.
- Every group, chosen original, original-group evidence digest, reviewed choice and create/reuse/exclude action.
- Preallocated destination, revision, origin, parent and receipt IDs; original message text-reference or literal note body digests.
- Frozen reused source revisions/digests and note-label create/reuse targets.
- Exact destination title, counts, expected head, creation time and partial status.

Renderer counts and destination pages derive from this same manifest. Reused source titles come from the frozen existing source, not the imported suggestion. `retained` counts originals without a selected destination, including alternative representations; explicit exclusions are a disclosed subset. Original bytes are retained for every record regardless of destination.

An explicit current manifest selector supports reopening the same preview and destination IDs. Saving any new review decision clears it; older manifests remain immutable. Graph/proposal changes, project-head changes and relevant source/label revisions invalidate a preview. Reopening/checking a saved preview never creates content or sends a provider request. The disabled **Confirm import (not available yet)** control has no commit handler. IM10 must independently reconstruct and revalidate this manifest before its one atomic acceptance transaction.

Portable admission validates row ownership, exact shapes, revision lineage/count/digests, immutable command matches, original graph identities, identified fragment coverage, selected results, manifest choices/counts/actions/dependencies/artifacts, source current/history revision metadata, and current selectors. Existing full-table snapshot/retention hashing covers these tables. Native migration, Save/reopen/copy, live proposal quality, recovery and accessibility still require user observations.
