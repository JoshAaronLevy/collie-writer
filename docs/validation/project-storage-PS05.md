# PS05 implementation record — Reviewed previous Save version removal

October 5, 2026. **Implementation complete — awaiting user testing.** No runtime acceptance is recorded.

## Delivered scope

Data now has a separate **Previous Save versions** review. It lists four inspected/reported rows per page with paths, snapshot dates, sizes, actual archive ownership and protection reasons; nothing is preselected. One older eligible version can be permanently removed after exact selection and confirmation. Cancel performs no mutation. The newest previous copy, selected/explicit output files, backups, foreign ownership, changed/unknown state and missing replacement proof remain protected. Known file aliases are checked by device/inode as well as paths.

A bounded read-only archive path uses a single descriptor for the archive hash and ZIP reads, checks entries/CRC/payload hashes and inspects the portable database entirely in memory using the existing validation graph. It does not extract, migrate, retain another incoming archive or reconcile Save journals. Existing extraction defaults remain unchanged; only the shared entry inventory accepts tighter limits. Larger/uninspectable files stay protected.

The narrow maintenance boundary belongs to `ProjectFiles` and `ProjectRepository`. The worker queue awaits the entire action. It settles any background file check, refuses live file/snapshot/export owners, holds the exclusive active project lock/repository serial boundary and prevents watcher/file transitions until completion. Main's known CA03 caller-timeout map is not used as settlement proof. CA03 is still not implemented; this is the specific owner proof permitted by the storage plan, not a repair of the wider audit.

The versioned receipt and per-Save discovery reference precede removal and survive uncertain responses. The renderer protects one exact pending request before dispatch and retains the existing close/project/access guards. **Check removal outcome** only reports; it never re-executes deletion. A reappearing file or unresolved prior removal remains protected. Reporting omits a previous candidate only when a strict receipt confirms removal and the path is absent; unknown/missing receipts do not make that claim. Inventory and existing recovery discovery refresh in visible Data after the result.

See [retained versions v1](../formats/retained-versions-v1.md) for eligibility, ownership/settlement reasoning, persistence, bounded resource costs and compatibility. Original Save/Backup receipts remain intact. Portable SQL/minimum reader **13**, archive/editor **1**, compilation **3**, snapshot/lease, AI and credential formats are unchanged. Search cache, source material, writing, history, saved conversations, incoming/migration/reset/export/AI payloads are outside PS05 removal. PS01–PS04 and import-design working-tree changes remain preserved.

React source review covered retained owners, exact synchronous pending/busy handles, strict bounded local preferences, fresh selection per page, keyboard labels, long-path/table layout, visible-only refresh and semantic component styles. Cache/retention table and action layout rules live in one shared settings stylesheet. Source inspection is not runtime evidence.

## Required checks

Script/ignore scopes were inspected before broad formatting; vendor/generated artifacts and historical tests retain their existing narrow exclusions. No diagnostics or rules were suppressed. The first typecheck found literal inference on a configurable archive bound; explicit numeric parameter types corrected it. A later lint pass found an unfinished missing-file branch; it now reports absence explicitly.

| Command             | Final outcome                                   |
| ------------------- | ----------------------------------------------- |
| `npm run format`    | Passed.                                         |
| `npm run lint`      | Passed without warnings or errors.              |
| `npm run typecheck` | Node and web checks passed without type errors. |

No test code, fixtures, harnesses, test/verification scripts, automated suites, audits, builds, launches, browser automation, screenshots, failure injection or runtime checks were added/run. Actual preservation/removal/reopening, native descriptor/unlink/directory behavior, natural interruption cases, large-history costs and accessibility await the [user's manual observations](../manual-testing/project-storage-PS05.md). All broader release gates remain **NO-GO**. Stop after PS05; PS06–PS08 and AI import require separate requests.
