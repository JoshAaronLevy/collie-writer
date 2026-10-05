# Working project schema 12 — proofreading

October 2, 2026. **Implementation complete — awaiting user testing.** SQL schema/minimum reader **12**, AST/editor **1**, archive container **1**, frozen manuscript compilation **3**. Exact definitions for schemas 1–11 remain unchanged. This supersedes schema 11 as the current working format.

## Tables and ownership

| Table                    | Portable content                                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `proofreading_captures`  | Immutable versioned mechanics capture: source revision/ranges, supported runs with text/marks, coverage, exact prompt/context and digest                                                          |
| `proofreading_runs`      | Stable attempt/capture identities, revision, request digest, actual outcome, known provider/model or null, reason, monotonic sequence, timestamps, bounded actual output and validation status    |
| `proofreading_findings`  | App-assigned finding UUID and run owner, exact target-relative original/replacement coordinates, explanation/kind, current human decision/revision/date and pre-apply checkpoint when accepted    |
| `proofreading_decisions` | Append-only operation/finding relationship and resulting decision revision, timestamp and protected checkpoint reference; foreign keys to finding, ordinary domain receipt and history checkpoint |

All tables are STRICT and project-scoped. One capture belongs to one run. Find IDs are stable within the portable project. A valid completed run yields at most 100 findings in provider order. Invalid/nonterminal output yields none. Historical decisions do not become pending again when manuscript history is restored; target validity is derived from current document revision/state.

`validatePortableProofreading` checks strict record shapes and bounds, table/body identities, owner/reference relationships, capture hashes and template/context reconstruction, retained capture head/document identities, target overlap, complete result equivalence and finding order, current decision versus its journal, receipt/checkpoint ownership and protected checkpoint class. Unknown/corrupt data is refused, never dropped. A current target is rechecked against the AST at Apply, even after a valid archive read.

Project limits: 10,000 review runs/captures, 100 findings per run, 128 captured supported runs per request, 64,000 context units including envelope, 128,000 output units. Individual encoded record reads are capped before JSON parsing. Decision journal rows persist without automatic expiry and remain subject to the existing portable database bound. The standard domain-operation receipt shape is unchanged: project/document/revision/head IDs. It contains no prompt or execution grant.

## Migration and copies

11→12 creates four empty tables on the existing retained backup/candidate path. No sample run, finding or provider response is seeded. Migration validates manuscript/details and both AI content graphs on the candidate before active-pointer publication. Originals, backups and failed candidates remain retained. Older supported archives remain readable and migrate after local extraction; no selected archive is changed in place.

All four table owners rekey for Duplicate, Restore-as-copy and independent Open. Inner IDs/digests contain no project/workspace field requiring rewriting; ordinary receipts use the existing project-ID rekey. Checkpoint/finding relationships remain inside the new project. Device-local `operations.sqlite` stores `proofreading-binding` rows in its existing `jobs` table, state `bound`; its DDL is unchanged. These rows map attempt/capture digest to the real provider operation/account/model/digest. They never enter a project archive. Copied in-progress runs without their own local binding become unknown/interrupted during owned acquisition, retaining output and creating no findings or execution authority. Reopening reconciles only actually retained local I10 records and never resends a request.

## Consumer matrix

| Consumer                            | Schema 12 behavior                                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Working create/open/migration       | New schema, retained 11→12 candidate migration, graph checks and unbound-copy interruption                                                       |
| Shared/main/preload/worker commands | Exact `proofreading` contract, edit/read capability split, internal-only binding/settlement and read-only exact decision-receipt reconciliation  |
| Save/Save As/Backup/snapshot        | Existing complete database snapshot includes review data and validates its graph                                                                 |
| Manifest/extract/incoming/recovery  | Accepts schema/minimum reader 12 alongside earlier supported pairs; container remains 1                                                          |
| Duplicate/Restore/independent Open  | Rekeys all four table owners and ordinary receipts, retains checkpoints, excludes local execution mapping                                        |
| Apply/document history              | Atomic document/projection/decision/receipt change with a protected pre-apply checkpoint; annotation mappings retain existing conservative rules |
| History restore/prune               | Manuscript restore does not erase review decisions; protected structural checkpoints cannot be pruned by automatic-history cleanup               |
| Manuscript compilation/exports      | Existing compilation 3; no proofreading flags, review commentary or prompts in clean manuscript output                                           |
| Conversation persistence            | Schema-11 tables/contracts unchanged; common main run coordinator extracted for both content owners                                              |
| Search/current citations            | Updated document revision and transactional citation/anchor projections feed existing search and citation readers                                |

There is no new archive kind, editor node, compilation field, provider session format, localStorage schema or report-export format. Native migration/copy/save/undo/fidelity acceptance remains pending.
