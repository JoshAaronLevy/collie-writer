# PS04 implementation record — Clear rebuildable search data

October 5, 2026. **Implementation complete — awaiting user testing.** No runtime acceptance is recorded.

## Delivered work

Data and recovery now offers a separate scoped cache preview, Cancel, exact confirmation, retained/removed/absent/unknown results and Check outcome for uncertain requests. The current project owns the action; no path or reporting category supplied by the renderer authorizes removal. An exact local pending request survives renderer/restart recovery and participates in existing retained draft/close/project-replacement/access guards. Inventory refresh waits for visible Data after an outcome. The passive notice copy now points to the implemented review.

The repository serializes cache work with its active project/search owner, file work and snapshot checks. Eligibility proves the current projection through its live connection and recognizes only bounded, sidecar-free retained copies with the known schema and a matching workspace search job. Reviews capture scope/head/mapping/directory/file identities; stale proofs require another review. A durable versioned receipt precedes cancellation/close/removal. SQLite owns its sidecar cleanup; changed/remaining sidecars and uncertain copies are retained. Final main-file identity/sidecar checks immediately precede unlink. Receipt replay reports only and never deletes a replacement.

Search connections are now lazy. Explicit Search use creates/rebuilds a cleared projection from committed local content. Activity reads do not ensure/restart it, hidden search queries are disabled and hidden activity polling only follows observed active work. Storage visibility cannot rebuild the cache. Project content, source material, citations, saved conversations, history, AI records/credentials, leases and exact Save/recovery contracts remain outside removal scope.

The PS01–PS03 working-tree changes and separate import design are preserved. PS04 changes shared/main/preload/worker command validation, explicit local-maintenance capability classification, repository/search lifecycle, cache schema/owner/receipt logic, retained Data/Search presentation and receipt metadata inventory classification. React source review covered stable retained owners, synchronous pending/busy guards, bounded local storage, scoped semantic styles, effect cleanup, explicit entry versus observation and visible-only inventory refresh. Source inspection is not runtime evidence.

## Formats and limits

See [search cache actions v1](../formats/search-cache-actions-v1.md) for receipt/pending records, reconstruction, eligibility bounds, unknown-outcome handling, SQLite memory inspection and platform limits. Current cache proof needs a live owner; unloaded indexes are retained with a visible next step. Oversized/sidecar-bearing retained copies remain protected. Review and receipt limits refuse further clearing rather than broadening deletion. No portable schema, archive, editor, compilation, Save, snapshot, AI or credential format changed. CA03 and later retained-content settlement gates remain unresolved; PS04's bounded owner does not authorize those stages.

## Required checks and outstanding observations

Script and ignore scopes were inspected before broad format, preserving vendor/generated artifacts and historical tests. No rules or diagnostics were suppressed. The first typecheck found a command-union narrowing error; splitting preview/status into discriminated variants corrected it. Subsequent code checks finished clean on the final implementation.

| Command             | Final outcome                                            |
| ------------------- | -------------------------------------------------------- |
| `npm run format`    | Exit 0; no warnings/errors.                              |
| `npm run lint`      | Exit 0; no warnings/errors.                              |
| `npm run typecheck` | Exit 0; node and web targets passed without diagnostics. |

No test code, harnesses, fixtures, automated tests, audit/verification scripts, builds, app/browser launches, screenshots, smoke probes, failure injection or runtime verification were added/performed. Native SQLite closing/unlink/directory persistence, interrupted outcomes, large-file costs, narrow layouts, accessibility and actual content preservation/reconstruction await the [user's manual observations](../manual-testing/project-storage-PS04.md). Release remains **NO-GO**. Stop after PS04; PS05–PS08 and AI import require separate requests.
