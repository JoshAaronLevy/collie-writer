# Confirmed project import v1 — IM10

SQL/minimum reader **29**; frozen schema **28** remains readable through retained-copy migration. Receipt/command/identity contracts are **1**. The compact domain-operation result is **2**, `kind: import-commit`. Import graph, review/confirmation, external transcript, imported-content and all provider/capture/execution/handoff formats keep their existing versions.

## Authority and exact commands

The project must already exist. Only **Confirm import** issues `import-commit`. The retained review owner flushes other project drafts and rechecks scope/access; a changed head invalidates the preview and requires another explicit confirmation. The worker uses the existing serialized active-project owner and main's lifecycle work counter. Confirmation has no account/model requirement, network request, provider fallback, picker grant or original external path.

The immutable command is exactly `{version:1, manifestId, operationId, expectedHead, entriesDigest}`. Its operation ID is the manifest's preallocated receipt ID, so reopening a preview recovers the same command without device-local execution authority. Digest: `requestDigest({contract:'project-import-commit-v1',command})`. Outer project/workspace routing is excluded. A reused operation ID with different bytes is refused.

`import-outcome` takes that exact command under read access. A missing row means not applied; an unavailable read remains unknown. `import-report` reads a completed batch receipt with bounded destination pages. `plan-find` finds an existing plan under read access, allowing restart/read-only inspection without `plan-prepare`. These routes never dispatch AI or perform a new acceptance. New writes require edit access. The UI retains an uncertain command and disables another confirmation until reconciliation; absence permits only a later explicit confirmation. Stop does not reverse a committed import.

## Protected inputs and atomic publication

Before the write transaction, the worker reconstructs the current review from selected protected results, checks complete coverage/dependencies/counts, verifies the immutable confirmation graph, checks frozen source/label revisions, reads and hashes the referenced managed originals/artifacts, and resolves included message text. Current formats create no new file attachment: all external text/asset references already point to durably staged, pinned content-addressed originals and graph pages. Literal note ASTs are deterministically reconstructed from those protected originals; corrected metadata and the complete accepted/reused/excluded identity map are already protected in the confirmation's SQL JSON artifact rows. No temporary accepted bytes are treated as disposable cache.

Admission reserves derived-data, database/WAL and free-volume space and enforces conversation/message/source/note/label/origin/identity limits. Original material, earlier proposals, excluded variants and previous previews remain protected on refusal. Acceptance does not publish a new managed-asset reference to unprotected bytes.

One bounded SQLite transaction:

1. Looks up the exact prior domain operation first and returns its original receipt if present, irrespective of later heads or source changes.
2. Rechecks the frozen head and destination candidates.
3. Inserts one project commit, the reviewed conversation envelopes and ordered external messages, normalized new sources or unchanged existing-source links, literal notes, labels/links and immutable source/note origins.
4. Publishes the project head, receipt, accepted-identity index and compact operation result together. Production graph/receipt validation runs before commit; any refusal rolls back all accepted domain rows.

The low-level writers have no public per-item commit loop. Reviewed destination/revision/origin IDs are used directly. Chat titles must fit the ordinary 160-character contract. Original archive/do-not-recall flags are preserved; non-user/assistant external roles are excluded from ordinary visible discussion and never become instructions. Source reuse changes neither metadata nor verification; import creates no inspected excerpt, fetched source file, manuscript link or citation. Source-only imports may retain a message locator without an accepted chat; chat-only original reference provenance remains in the graph.

## Portable receipt and duplicate index

`import_receipts` stores outer project ownership, receipt ID, batch ID, manifest ID, operation ID, resulting commit and strict JSON body. It permits one completed receipt per batch. Body: `{version:1,id,batchId,graphId,manifestId,manifestDigest,command,commandDigest,beforeHead,afterHead,createdAt}`. Counts and the full identity map come from the digest-bound immutable confirmation manifest and entries, avoiding a large generic operation result.

The exact compact result is `{version:2,kind:'import-commit',projectId,batchId,receiptId,headCommitId}`, below 1,024 units. Readers prove matching receipt/batch/manifest, command digest, actual commit ancestry and created/reused destinations. Legacy document results and `import-session` results retain their original validators and version floors.

`import_accepted_items` stores project owner, identity key, original-content fingerprint, receipt ID and manifest item ID. Strong conversation/message exporter identities use namespace plus the stable original identity; other records require original hash/location/kind. Fingerprints retain original role/type/path/metadata and exact text-part hashes while excluding per-intake local IDs. The portable reader recomputes the key/fingerprint from accepted original evidence and proves the destination map. At most 100,000 accepted identities and 1,000 receipts per project.

When opening a fresh review, exact already-accepted originals get a persisted default **Already imported / Skip** exclusion revision. Re-including them is blocked. A reused identity with different original content requires explicit exclusion/review; IM10 does not overwrite or append to an existing imported chat. Selecting a smaller independent subset remains possible. A fully duplicated selection may produce a zero-addition confirmation and receipt; it adds no domain entities and does not claim new AI processing. New selection analysis still follows its separate explicit consent path.

Completion is projected from the receipt; the original v1/v2 batch revision bytes are not rewritten. Completed batches no longer consume an active-import slot and cannot be configured, discarded, reanalyzed or accepted again. Start a new selection for additional material. Retained history and original files remain part of the project.

## Preservation and presentation

Schema-28 DDL remains frozen. Retained-copy 28→29 migration adds the two tables; existing graph/original semantic validation remains required before publication. Portable Save/archive/open/copy readers validate receipts and accepted graph evidence. Full-table lineage/retention comparisons include the new tables. Independent copies rekey outer project IDs and the compact result's routing field only; immutable evidence/commands are unchanged and copied receipts cannot execute again. Import-bearing working-copy removal remains refused.

After success, the existing head-refresh owner preserves the manuscript payload/document/selection/undo ownership. Sources, Notes, Research evidence and conversation list read models respond to the new head without replacing drafts. The receipt report opens accepted transcripts with the existing unified reader and transfers source/note navigation after the import dialog exits. Opening a report or transcript never sends AI. Follow-up chat context and the integrated ordinary transcript experience remain IM11. Import completion protects local working data; selected-file **Save remains separate**.

Implementation and code checks are distinct from native/runtime acceptance. See the [record](../validation/import-IM10.md) and [manual guide](../manual-testing/import-IM10.md).
