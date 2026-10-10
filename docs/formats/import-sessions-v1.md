# Import sessions v1 — IM02 foundation

Current extension: [IM04 local graph contract](import-graph-v1.md) adds SQL/minimum reader 23 and explicit local inspection. The IM02/IM03 stage facts below remain historical; their v1 intake/session contracts stay frozen.

October 9, 2026. Implemented portion of the [project import design](project-import-v1.md) and [plan](../../import-implementation-plan.md). **Implementation complete — awaiting user testing.** The native picker and import UI are implemented in [IM03](import-intake-v1.md); extraction, AI, proposals and accepted domain content are later stages.

## Version and ownership

SQL/minimum reader **22** adds `import_batches`, `import_batch_revisions`, `import_files` and `import_artifacts`. Schema 21 and all earlier DDL/readers remain frozen. The retained-copy 21→22 migration creates empty tables without rewriting manuscript, research, chat or provider records. Archive/editor remain 1, conversation/live message remain 2/1, capture remains 5 and direct operation/binding remains 6. No new AI purpose or provider request is enabled.

The shared contract is `src/shared/project-import.ts`. Main's `ImportService` owns exact pending writes; the serial project worker owns portable staging. All requests target the already acquired exact project/workspace. New mutations require ordinary edit access, including retries proven absent. Reading and exact receipt reconciliation use read access. No import mutation participates in an entitlement drain or grants account authority.

## Persisted records

| Record          | Implemented contract                                                                                                                                                                                                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Batch           | Outer `project_id`, UUID `id`, `current_revision_id`, UTC `created_at`; deferred same-batch FK to the current revision. Physical row order is never current-state authority.                                                                                                                                |
| Revision        | Outer owner, UUID ID/batch/parent, operation ID, real commit head, immutable request/body, unique intake artifact. The body is version 1 with phase `preparing` or `discarded`, selected-file IDs, sorted categories and instructions, whole-original retention, artifact ID, time and canonical digest.    |
| File manifest   | Outer owner, UUID ID/batch/asset, immutable v1 body: exact-byte SHA-256, size, original basename, declared media type, intake sequence/time. No selected path is retained. All file manifests remain, including deselected/discarded originals.                                                             |
| Artifact        | Outer owner, UUID ID/batch/asset, immutable v1 descriptor. The sole admitted kind is `intake-v1`, one canonical JSON blob per revision. No generic artifact upload or permissive future reader exists.                                                                                                      |
| Session receipt | Existing `domain_operations` stores `{version: 2, kind: 'import-session', projectId, batchId, revisionId, headCommitId}`. The result is below its existing 1,024-unit ceiling and must match the revision's operation, request digest and commit. Legacy document-shaped results remain admitted unchanged. |

Each operation advances one project head and installs its revision, current selector, necessary managed assets and receipt in one worker transaction. All authoritative bytes are protected before SQL publication. A failed transaction cannot partially publish a selected file or revision; published immutable orphan bytes are retained safely if a later step fails. Readable, malformed or unknown outcomes never authorize another operation ID.

The new body readers require exact keys, version, bounds and app-authored JSON serialization. Revision and artifact digests use domain-labeled canonical JSON excluding their own digest field. Command digests include the immutable mutation and operation ID under `project-import-command-v1`; outer project/workspace routing and selected paths are excluded. The worker/main still authorize exact outer scope. Copies rekey outer owners and the result's `projectId`, preserving internal IDs, original bytes and evidence digests.

`graphId`, `planId`, `proposalId`, `reviewId` and accepted `receiptId` are explicitly null in every IM02 revision. These are reserved foundations, not admitted extraction/proposal/acceptance payloads. Only implementing stages with complete strict readers may introduce them. The `import-commit` result and accepted import receipts remain IM10 work; there is no fake manuscript target or native AI attempt.

## Originals and bounded intake coverage

The worker-only `stage-file` action requires a trusted main selection descriptor: exact file/asset IDs, basename, declared media type, byte count and SHA-256, plus the temporary native source path. `ImportService.stageSelected` is an internal hook for IM03's native picker, **not** a renderer IPC. IM03 now freezes the descriptor from the selected regular file and rechecks sender/scope before invoking it. Renderer requests cannot supply a source path, arbitrary bytes, asset path or generic worker command.

`stageBlob` takes an optional smaller transfer limit, defaults to its existing bound for other consumers, opens a regular non-symlink source and checks descriptor identity/size/time across copying. Intake compares the protected original against the frozen expected hash/size. A changed source is refused without replacing a file manifest. Original managed assets use safe generated basenames and `application/octet-stream`; the original user basename/type remain in import provenance. Derived artifacts use `application/vnd.collie.import+json`. Portable readers admit these media types only when an exact import owner exists.

Each `intake-v1` blob contains its version/kind, batch/revision IDs, ordered selected file IDs/hashes/byte sizes, `unprocessed` dispositions, selected-byte total, null graph/proposal IDs and zero analyzed/accepted record counts. It covers selected files only; deselected originals remain retained. A past revision's read result can list the batch's later retained files; its immutable `selectedFileIds` identifies that revision's actual selection. No parser, classification, source extraction or AI success is inferred from intake.

SQL validation reconstructs the expected canonical intake bytes from the exact revision and then checks their hash/length against the artifact descriptor and managed asset. A separate bounded file/stream read compares actual artifact bytes to that semantic expectation. Later artifact kinds must supply their own validator, not just a blob hash.

Bounds enforced now:

- 100 retained file entries per batch; 25 MiB per original and 100 MiB combined, including deselected entries. Repeated identical bytes may share a blob while retaining separate manifest entries and counting toward admission.
- 1,000 batches per project, eight non-discarded batches in its working copy, 1,000 revisions per batch. Normal edits reserve the last revision for discard.
- Instructions: 4,000 UTF-16 units; categories: unique canonical `chats`, `notes`, `sources`, with an empty selection allowed during preparation. Original basenames: 255 units; file media labels: 128 units.
- Artifact: 1 MiB; descriptor/request/body: 64 KiB in UTF-16 units; derived blobs: 256 MiB per batch. Admission reserves another artifact allowance for discard. Import admission retains managed-asset slots for discarding its active batches; stricter archive limits and later disk/other-content growth can still refuse a write without deleting retained work.
- List/read: 50 rows per page; exact bounded metadata only. No raw source body is returned through these commands.
- Intake reserves source/temporary artifact and SQL/WAL headroom through the existing worker volume budget and refuses a database near the archive's 4 GiB ceiling. Snapshot/migration owners keep their existing additional-space checks. No capacity error triggers eviction or cache deletion.

## Commands and recovery

Preload exposes `projectImport` over the single trusted `project-import.command` channel. Main validates exact sender/frame/request; worker validates the separate exact command shape.

| Action                   | Result and authority                                                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list` / `read`          | Paged batch or file metadata; current or exact older revision. Requires the already acquired project; never opens another project or writes.                      |
| `mutate: create`         | New local batch/revision with settings and empty intake coverage. No project creation.                                                                            |
| `mutate: configure`      | New selection/settings revision after exact expected-revision and same-batch file checks. No file deletion.                                                       |
| `mutate: discard`        | Terminal discarded revision after exact checks. It never removes originals, old revisions, saved copies or ordinary content.                                      |
| Worker-only `stage-file` | Protect one exact original and its new intake revision. Public picker orchestration/multi-selection is IM03.                                                      |
| `lookup`                 | Exact operation/mutation digest → original receipt or proven absence. Does not consult source paths, expired picker grants, current selection, later heads or AI. |
| Main-only `recovery`     | Current scope's retained pending mutation, busy flag and error code, after a trusted worker read. Never exposes a source path or resubmits work.                  |

Same-operation replay checks the stored receipt before source reads, current-revision/capacity checks or new writes. A changed mutation under the same operation ID is a conflict. A receipt remains readable after edit access is lost. If absence is proven, a new attempt at the same local write still needs current edit access.

Main freezes a mutation before awaiting work and retains it on a failure/unknown acknowledgment. Only the same request can retry; another mutation is refused until explicit reconciliation. Lookup is serialized after the older write and can clear main's pending ownership upon a matching receipt or proven absence for generic mutations; IM03 preserves an absent stage-file's main path authority until explicit retry/abandon; an unapplied renderer draft remains the caller's responsibility. A newer pending retry cannot be cleared by an older lookup. IM03 must read recovery, retain unapplied form intent under the existing draft registry and present the normal explicit local retry flow.

Open/create/reset/replacement, access changes and Save/Backup/Move are held while main has an unresolved import write. Once dispatch has settled or timed out, acquiring the exact pending project/workspace is allowed for recovery after worker loss; other pending owners still apply their existing guards. This exception never resubmits the mutation or opens a different copy. Close/update/recovery restart establishes a barrier against fresh import writes and pauses with a local-protection message if work remains unresolved; cancellation resumes admission. Durable, idle batches themselves do **not** block Save/close. A presentation loss cannot erase main's pending request or portable staging. Main restart restores portable state only; it does not reconstruct dispatch permission or automatically resend anything.

## Preservation consumers

| Owner                            | IM02 integration                                                                                                                                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema/migration                 | Frozen old DDL; retained validated candidate; empty v22 tables and new reader floor.                                                                                                                |
| Portable graph/domain operations | Exact batch chains, revision selectors, file introduction/order, immutable request/digest/receipt links, typed results, managed asset ownership and canonical intake semantics.                     |
| Working acquisition              | Validate import graph and managed artifact bytes before admitting the project.                                                                                                                      |
| Snapshot/Save                    | Capture all new SQL rows and managed blobs; validate semantic artifacts under the capture boundary; existing leases pin exact snapshot bytes.                                                       |
| Archive extraction/read          | Admit schema/minimum reader 22, match inventory, then validate artifact bytes against semantic expectations.                                                                                        |
| Independent copy                 | Rekey all four outer tables and operation result routing; validate the copied graph/artifacts; retain original evidence and no execution grants.                                                    |
| Retained versions                | Existing full-table digest automatically includes all four tables and typed result bytes; archive proof also reads/validates import artifacts under its existing smaller proof bounds.              |
| Working-copy removal             | Any import record causes a conservative refusal, including discarded batches. Existing AI/migration safeguards remain.                                                                              |
| Storage inventory                | Originals/artifacts remain managed assets and import rows remain protected working-database content. Existing inventory classification already covers these paths; no disposable category is added. |
| Domain views/exports/context     | Candidates never enter ordinary chats, Research, Notes, manuscript, search or context. Project Save/copy carries staging; content exports retain their existing accepted-content readers.           |

No native persistence, migration, copy, Save/reopen or recovery observation is claimed from source inspection or code checks. Use the [IM02 guide](../manual-testing/import-IM02.md) and [implementation record](../validation/import-IM02.md). IM03 is implemented with user acceptance pending; see its [guide](../manual-testing/import-IM03.md).
