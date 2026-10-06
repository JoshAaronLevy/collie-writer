# PS07 implementation record — Inactive local working copies

October 5, 2026. **Implementation complete — awaiting user testing.** Runtime acceptance is not recorded.

## Delivered scope

Data and recovery adds an inactive-project selector, explicit review/cancel/confirmation, retained exact pending request, read-only outcome checking, paged removal history and ordinary native-file opening. It reports saved/working paths, content/retained byte counts, confirmed removals and protective refusal reasons. Renderer draft protection and the persistent workspace/editor owners remain.

The worker checks the accessible selected archive against the current committed head, every managed entry and all logical database content/history. No original database migration or repair occurs during preview. Removal is limited to verified content files, with the database first, while original small metadata remains at its original paths. Migration originals, independent snapshots, export recovery, unknown/unsupported files, previous local cleanup owners and all AI-linked workspaces are excluded. No account credentials, backups, global history or original AI bindings are deleted.

PS07 holds the actual worker/file/repository/project-lock owners through removal; outgoing snapshot ownership now includes the actual task lifetime. Main reads bounded hot/cold AI history and reserves the target scope against new dispatch. Caller timeouts cannot release either removal ownership or that reservation. Status settles through the worker owner; durable retirement blocks old-scope dispatch/open/create replay after restart. This is a narrow PS07 proof, not completion of CA03.

Strict v3 retention receipts, separate locator records and global retirement markers precede deletion. Per-file durable outcomes retain uncertainty; no automatic retry, recursive deletion or quarantine-space claim exists. Library discovery excludes retired scopes. Existing Open still requires the native grant and full archive validation; promotion permits a new workspace in an exclusively locked root containing only proven retired originals. It never overwrites those skeletons or grants editing authority. Reset retains its recovery meaning and moves skeletons with the local tree while global retirement proof remains.

See the [format and bounds](../formats/working-copy-removal-v3.md) and [manual guide](../manual-testing/project-storage-PS07.md). Portable SQL/minimum reader **13**, AST/archive **1**, compilation **3**, snapshot/Save/Backup/AI formats remain unchanged. PS01–PS06 and other pre-existing working-tree edits are preserved. PS08/compression and AI import are not implemented.

## Source review and required checks

Reviewed the plan/CA03 gate, original worker/file/project/snapshot/search owners, AI preparation/dispatch/hot/cold records, Save acknowledgment, archive content validation, library/incoming identity flow, Reset recovery, inventory and retained UI owners. The React best-practices checklist informed event-driven requests, synchronous busy/pending protection, bounded history, accessible controls and semantic scoped styles. Source inspection is not runtime acceptance.

Package scripts and format/lint exclusions were inspected: vendor/generated/historical test files remain protected, and the three scripts invoke only authorized code checks. No diagnostic suppression or rule weakening was added.

| Command             | Final outcome                                   |
| ------------------- | ----------------------------------------------- |
| `npm run format`    | Passed.                                         |
| `npm run lint`      | Passed without warnings or errors.              |
| `npm run typecheck` | Node and web checks passed without type errors. |

No test code, fixtures, harnesses, verification scripts, automated tests, dependency audits, builds, app launches, browser automation, screenshots, benchmarks or failure injection were added/run. Actual removal, retention, file reopening, native lock/unlink/durability, large-history cost, accessibility, reset interactions and uncertain-outcome behavior await the user. Release remains **NO-GO**. Stop after PS07 and await user results.
