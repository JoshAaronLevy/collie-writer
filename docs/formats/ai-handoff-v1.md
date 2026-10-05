# CD08 / C07 local AI handoff v1

October 3, 2026. **Implementation complete — awaiting user testing.** This is a device-local storage change shared by conversations and proofreading. Portable SQL/minimum reader **12**, AST/archive **1**, frozen compilation **3**, account metadata **v2** and the exact original operation **v1/v2/v3** payloads/digests remain unchanged. No provider activation is implied.

## Receipt and commit order

`shared/ai-handoff.ts` defines an exact v1 receipt containing original project/workspace scope, conversation/proofread purpose, attempt and operation IDs, original operation version, input payload and capture digests, terminal sequence/state, result digest, explicit acknowledgment flag, portable record revision, committed head and portable result digest. UUIDs, lowercase SHA-256 values, versions and terminal states are validated. Non-completed outcomes require acknowledgment. A public renderer request contains only scope, attempt ID and `acknowledge`; it cannot supply a receipt, output, binding or execution grant.

The result digest hashes the existing protected `contentOperation` projection. The full encrypted record has its own digest, preserving raw/final/commentary distinctions and frozen route/account/schema metadata. Hashes use the existing canonical `requestDigest` function. Conversation portable proof covers the complete immutable turn. Proofreading proof covers the original run, capture and ordered finding identities/suggestions; later human decisions and manuscript freshness do not redefine that result.

1. Main settles actual protected output into the original project's existing FULL-synchronous SQLite transaction.
2. The feature worker reads the committed record and compares capture, sequence, state, model/provider, reason, finish time and exact output. The shared worker helper checks the original local binding and scope. It commits the receipt to that workspace's FULL-synchronous operations database. It does not manufacture proof from a renderer acknowledgment or an independent copy.
3. Main waits for provider/retention settlement, validates the receipt against the original protected operation, and writes an encrypted per-operation index entry.
4. Main atomically renames the original encrypted operation file into retained storage and synchronizes the directories using the existing platform helper. It removes the in-memory hot record only after this step returns.
5. The worker compares its exact durable receipt and marks the original binding retained. Main forgets the live binding reference only after acknowledgment. Pending or uncertain handoff writes continue to block dispatch, account changes and close through the shared lifecycle owner.

The portable commit precedes the receipt; the receipt precedes the main move; the move precedes worker binding retirement. These are separate durable commits, with exact local replay, not a distributed atomic transaction. A repeated handoff returns the original receipt and requires the original portable revision/digest and retained commit. A frozen receipt prevents later settlement from overwriting that result.

An explicit acknowledgment retry first waits for the same attempt's current worker write, then retries any exact retained failed input under its original scope. It does not fail merely because its own previous step needs protection. No newer handoff step replaces an uncertain older write. A lost retirement acknowledgment resolves the already-retained binding without repeating inference.

## Encrypted layout and bounded reads

All paths below are beneath the verified working root. Credentials and runtime files retain their existing separate owners.

| Path                                         | Contract                                                                                                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ai/operations/<operationId>.json`           | At most 64 hot operations globally across both features. Original safeStorage envelope and 4 MiB file limit.                                                        |
| `ai/operations/index-v1.json`                | Encrypted exact `{version:1, layout:'receipt-index-v1', limit:64}` marker. Pre-CD08 readers refuse this non-operation entry instead of ignoring retired identities. |
| `ai/retained-v1/records/<operationId>.json`  | Original encrypted bytes moved intact from the hot path. Exact v1/v2/v3 interpretation and 4 MiB limit.                                                             |
| `ai/retained-v1/receipts/<operationId>.json` | Encrypted exact `{version:1, receipt, recordDigest}` entry; 32 KiB limit. `recordDigest` binds the entire decoded original operation.                               |

Startup streams the hot directory and refuses more than 64 records. It never lists or loads cold history. Exact-ID reads inspect only the two bounded record locations and one bounded receipt; simultaneous hot/cold originals, unknown versions, inconsistent digests or missing indexed records refuse. Cold records are not cached in an unbounded map. Portable history retains its existing paged readers.

Index creation precedes the move. If only the receipt was written, the hot slot remains occupied. If the move completed but synchronization or worker acknowledgment failed, the exact retry repeats only those local steps. On restart, an original project's still-bound entry resolves the cold record and finishes retirement. Missing original encrypted records cannot be replaced by fabricated receipts or discarded bindings.

The existing directory synchronization helper operates on macOS; Node provides no equivalent directory flush in this implementation on Windows. Rename, file synchronization, keychain/DPAPI, power-loss behavior and platform durability remain unobserved. No stronger cross-platform durability guarantee is asserted.

## Device-local operations database v2

Each original workspace's `operations.sqlite` advances `user_version` from **1 to 2**. The `jobs` and `delivery` tables stay unchanged. The new index is `CREATE INDEX ai_binding_capacity ON jobs (kind,state,created_at,id)`.

Before upgrading an exact v1 schema, the repository creates, protects and retains a consistent `operations.sqlite.before-handoff-<uuid>.sqlite` backup. The index and version change occur in one transaction. A failed backup/upgrade leaves its artifacts retained and refuses opening; no reset or deletion is used. Unknown schemas/versions refuse. Pre-CD08 readers require v1 and refuse the upgraded local database. This does not prevent supported readers from reading unchanged portable project files.

Conversation/proofreading binding JSON remains byte-for-byte unchanged in its existing job row. State `bound` occupies a feature slot; state `retained-v1` is cold. An `ai-handoff-v1` job, keyed by operation ID with state `committed`, stores the exact receipt. Rows are not deleted. The two feature collections each retain their existing 64-active-binding ceiling; indexed queries read at most 65 rows and refuse overflow. Retained identities use exact primary-key reads, including replay of old attempts.

Binding/receipt queries select at most 16,001 SQLite text characters per result before returning a row; the parser refuses strings longer than 16,000 UTF-16 units. This bounds even malformed retained rows before JSON parsing. Receipt rows must agree on their primary operation identity as well as their exact receipt fields. No stored JSON is truncated or rewritten by these read bounds.

## Consumer matrix

| Consumer                                                         | Responsibility                                                                                                                                                                                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `worker/ai/handoff.ts`                                           | Shared original-binding lookup, bounded active collections, durable receipts and receipt-only retirement.                                                                                                                      |
| Conversation/proofreading workers                                | Compare committed feature results, freeze settlement after a receipt, preserve transcript/findings/human decisions.                                                                                                            |
| Project repository                                               | Exact local schema migration and retained backup; serialize against file work and require the original open scope.                                                                                                             |
| `AiStorage`, `main/ai/handoff.ts`                                | Encrypted marker/index, intact original moves, bounded lazy reads and full/projection digest validation.                                                                                                                       |
| `AiService`                                                      | Shared 64-hot limit, serialized local transfer, capacity status and exact cold prepare/start/read/cancel/protect behavior. A cold ID cannot become a new dispatch.                                                             |
| `AiContentService` and both adapters                             | Portable settlement before transfer, exact failed-write priority, completed auto-handoff, explicit uncertain acknowledgment, original-project reopening recovery.                                                              |
| Shared/main/preload contracts                                    | Exact transient capacity/work status and narrow public acknowledgment; worker receipt inputs remain internal.                                                                                                                  |
| Retained feature providers/global notice                         | Show history, capacity and local recovery; retain uncertain action acknowledgments; non-running retained outcomes do not become busy drafts.                                                                                   |
| Portable project, snapshot, Save/Backup/Duplicate/Restore/export | Same existing format and copy rules. They carry portable history only, never operations databases, handoff receipts, credentials or execution authority. Older external files/backups keep the history they already contained. |

## Retention and limits

Completed protected results transfer automatically. Failed, cancelled and unknown outcomes require explicit local acknowledgment after their actual output/state is durably readable, with no active request or pending protection. Their state is not rewritten to completed; raw output remains encrypted, and malformed proofreading output remains inert. A binding with no readable original record remains reserved and is surfaced as needing recovery.

No records, receipts, backups, `.write-*` candidates or uncertain outcomes are purged. No expiration, garbage collection, reset shortcut, higher hot cap or content-bearing diagnostics were introduced. Disk use can grow with retained history. A future deletion policy needs its own explicit scope, recovery/copy/export analysis and user authorization; this stage supplies none. Live repeated-use acceptance remains blocked by CD03; all native storage and compatibility behavior awaits user observations.
