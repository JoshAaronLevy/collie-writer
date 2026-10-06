# PS03 implementation record — Storage notices and useful space errors

October 5, 2026. **Implementation complete — awaiting user testing.** No runtime acceptance is recorded.

## Delivered work

The bounded read-only inventory now reports filesystem capacity separately from file lengths and computes threshold conditions from the whole measured inventory, before project pagination. Shared defaults cover 500 MiB project cache, 2 GiB overall cache, 5 GiB local project data and volume availability below the greater of 5 GiB or 10%. Unknown/inconsistent capacity is null, never enough-space evidence. Existing no-follow/metadata/time/device limits remain; measuring does not acquire a project, open SQLite, reconcile journals, decrypt AI history or hydrate external content.

A retained notice provider owns one latch/choice per bounded condition, 24-hour snooze, dismissal/restoration, expiry and hysteresis. Size recovery requires a complete known reading below 80%; available-volume recovery requires a known reading at 125%. Partial lower bounds can warn without declaring recovery. Notice summaries survive navigation and open the relevant Data breakdown, matching page/search category or volume; focus defers behind dialogs/hidden regions/composition. Inventory remains explicitly requested, not a startup/typing scan. Cache clearing, content deletion, compression and AI import were not added.

Existing space preflights retain their estimates and margin and now account for stable observed devices and other cooperating worker jobs. Measurable export candidate/destination/asset writes also preflight actual known output lengths. Async budgets cover file/snapshot/export/queued worker work and release on settlement, with conservative per-volume peak estimates. The existing Save same-volume calculation remains. Reservations do not cover other applications, all main/native writes or future unknown allocations, and can conservatively count already consumed bytes until a job settles.

Validated transient error context identifies the operation/location, additional estimate and available/reserved bytes when known, and useful next actions. Native write failures use an available safe failure path or an explicitly uncertain operation location; they never reuse an unrelated preflight's estimate. File errors and export results keep storage/recovery links. Snapshot/export context maps are bounded and memory-only; export contexts are excluded from persistent reports. Reopened old failures honestly lack the original live estimate. Original operation identities, retries, buffers/drafts, file journals, retained artifacts and close/access/recovery authority were not replaced or relaxed.

The prior PS01/PS02 and separate import-design working-tree changes remain preserved. Changed owners are shared inventory/advice/space/error/file/export validators; the metadata scanner; worker preflight, snapshot/file/export error handoffs and budgets; retained notice provider/Data inventory; existing file/export result presentation and workspace summary. React source review covered stable retained owners, event-driven bounded preference writes, effect/timer/observer cleanup, deferred review focus, stale scan identity, pure clock state and scoped semantic styles. Source review is not runtime acceptance.

## Formats and limits

See the [PS03 contract addendum](../formats/storage-notices.md). The only new persistent format is bounded, device-local, non-authoritative `collie.storage-notices.v1`. Inventory/space context is transient and omitted from support diagnostics. Portable SQL/minimum reader **13**, AST/archive **1**, compilation **3**, snapshot/file/export/AI persistent formats and credential/provider gates remain unchanged. Existing CA03/retained-artifact settlement gates remain unresolved for future destructive stages; PS03 provides no deletion proof.

## Required checks and outstanding observations

Script and ignore scopes were inspected before format; vendor/generated artifacts and historical tests retained their existing narrow exclusions. No checks/rules were suppressed or weakened. Initial lint identified an impure render clock and a synchronous effect update; these were corrected with provider clock state and a cancellable review-frame callback. Initial web typecheck identified a return-path issue, corrected without suppression. Subsequent code checks were clean.

| Command             | Final outcome                                            |
| ------------------- | -------------------------------------------------------- |
| `npm run format`    | Exit 0; no warnings/errors.                              |
| `npm run lint`      | Exit 0; no warnings/errors.                              |
| `npm run typecheck` | Exit 0; node and web targets passed without diagnostics. |

No test code, fixtures, harnesses, test/verification scripts, automated tests, dependency audits, builds, app/browser launches, screenshots, smoke probes, failure injection, disk filling, provider actions or runtime verification were added/performed. Manual behavior, filesystem/native I/O, natural thresholds, competing jobs/writes, accessibility and large-library cost remain unobserved. The [manual guide](../manual-testing/project-storage-PS03.md) owns those observations. Release remains **NO-GO**. Stop after PS03; later stages require a new request.
