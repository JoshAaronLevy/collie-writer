# PS08 implementation record — New archive compression

October 5, 2026. **Implementation complete — awaiting user testing.** Runtime acceptance is not recorded.

## Delivered scope

One validated archive plan selects deflate level 6 for the database and small manifest/pinned citation text, and stored level 0 for every managed blob. The archive writer streams both manifest and file entries through the existing lazy ZIP64 API. It owns errors/cancellation/closure of the library's internal compression and counter streams as well as input/output streams, retaining snapshot/job ownership through actual settlement. No attachment type is inferred from hashes and no managed original is recompressed in place.

Snapshot admission now budgets a worst-case archive plus full expanded validation. Native Save/Save As/Backup/Move budgets two full expanded inspections, combined with the actual destination stage/previous-copy allowance on a shared device. A shared physical archive ceiling includes bounded deflate/container overhead, while expanded entry/total limits are unchanged. Final candidate length is checked against its plan. Existing extraction validates expanded bytes, CRCs, hashes, exact profile and database graph; old stored entries remain supported. Retention's smaller review bounds are unchanged.

The writer enforces each planned expanded input length while streaming, so a source growing after capture stops before unbounded compression/output work. Final exact-size and full digest validation remain.

Coherent SQLite capture, immutable references/leases, exact operations, progress, pre-publication cancellation, target-content guards, sibling staging, retained previous versions and full publication validation are preserved. Archive/editor **1**, portable SQL/minimum reader **13**, compilation **3** and all existing journal/profile/AI formats remain unchanged. See the [format addendum](../formats/archive-compression-v1.md) and [manual guide](../manual-testing/project-storage-PS08.md). Pre-existing PS01–PS07 and other working-tree edits remain. AI import and other stages are outside scope.

## Source review and required checks

Reviewed PS08, writer/reader/inventory, pinned yazl stream implementation, exact citation profile, manifest/physical bounds, snapshot lifetime, native Save/Backup publication and per-device space ownership. The primary zlib source informed the conservative bound documented in the format addendum. Source inspection is not a runtime result. Script/hooks/ignore scope were read before broad formatting; bundled/generated files and historical tests remain protected. No diagnostics were suppressed or rules weakened.

| Command             | Final outcome                                   |
| ------------------- | ----------------------------------------------- |
| `npm run format`    | Passed.                                         |
| `npm run lint`      | Passed without warnings or errors.              |
| `npm run typecheck` | Node and web checks passed without type errors. |

No test code, harnesses, fixtures, verification scripts, automated suites, builds, launches, browser automation, screenshots, dependency audits, benchmarks or failure injection were added/run. Actual compression savings, CPU/memory/elapsed-time costs, stored/deflated round trips, cancellation, capacity failures and native durability remain user-owned observations. Compression reduces only suitable new archive entries; it does not reclaim working data, originals or retained history. Release remains **NO-GO**. Stop after PS08 and await the user's results.
