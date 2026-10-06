# PS02 implementation record — Categorized storage inventory

October 5, 2026. **Implementation complete — awaiting user testing.** Runtime acceptance remains pending.

## Delivered work

Settings → Data and recovery now contains an explicit Measure storage / Refresh storage inventory action, working/application/known-external totals, staged measurement times, expandable project/shared/external groups and category tables with locations and volume labels. Page controls return at most 25 groups. Cancel retains partial results; leaving the retained Data view requests cancellation. Stale replies cannot replace a newer request/page. Reporting errors keep measurements qualified as incomplete and offer refresh/cancellation. The inventory has no persistent preference/report or automatic keystroke scan.

The new worker-owned scanner enumerates only the main-supplied roots and recorded external paths. It uses streaming directories, bounded read-only metadata, strict existing destination/Save-intent validation, BigInt physical file identities and time/count/depth bounds. It counts working databases/assets, current/retained derived search data, snapshots/migrations/reset recovery, known local operations, app-profile/session/logs and known external selected/previous/backup files. It does not open SQLite or acquire projects; active metadata pointers distinguish current databases from retained versions. Unknown files/ownership and unavailable locations are retained/unclassified/unknown, not cache or zero-byte estimates.

AI ownership comes only from the main AI owner's already validated in-memory records captured at scan start; this is a new read-only metadata accessor. Known operation files contribute to their recorded project's total while their actual shared AI folder is shown in the category table. Cold or otherwise unknown encrypted files, credentials, runtime data and candidates remain shared/unattributed. The inventory never loads/decrypts history to obtain more ownership and never infers ownership from the open project. Current ciphertext contents remain unverified. This limited attribution is intentional, not a claim that every AI byte can be assigned today.

Working, outside-working application and external totals are separate and deduplicated by observed file identity. Individual database content types are not double-counted: writing, research, citations, conversations and history share one physical database category. No logical SQLite byte estimate was introduced. File lengths are not actual allocated disk space; staged concurrent measurements are not coherent snapshots or future deletion proofs.

The old recovery overview is not used by Measure storage. Its existing acquisition/reconciliation behavior remains in the separate recovery path. Recovery inspection, reset, original-project AI links, local protection, explicit Save, native pickers, current editing/close authority and retained editor/draft owners are unchanged.

## Changed owners and contracts

New shared transient contract/category/cache registry: `src/shared/storage-inventory.ts`; wired into `CollieAPI` and preload. Main: `storage-inventory-ipc.ts`, `StorageWorker`'s independent reporting map and initialization paths, `index.ts`, and `AiService.inventoryOwners()` (metadata lookup only). Worker: `projects/storage-inventory.ts`, outside-queue `index.ts` dispatch/shutdown integration, and extraction of the existing pure `isSaveIntent` validator for reuse without its filesystem reader or persistence function. The original Save-intent validation conditions/format are preserved.

Renderer: `StorageInventoryPanel` with its own semantic CSS Module, retained Data-view integration in `WorkspaceViews`. React source review covers effect cleanup, generation-scoped replies, bounded polling while visible/running, stable retained owners, disclosure/table labels and scoped styles/Mantine controls. No dependencies, provider transport/credential reader, authentication action, project writer or persistent owner was replaced. Earlier PS01 working-tree changes and the separate import design remain preserved.

See the [transient format/measurement contract](../formats/storage-inventory.md) for limits, classification, native-I/O cancellation caveats, attribution and physical/logical semantics. SQL/minimum reader **13**, AST/archive **1**, compilation **3**, existing setup/preferences and file/AI recovery formats are unchanged. No portable or persistent migration, inventory sidecar, threshold notice, cache clearing, content removal, compression or new import feature was added.

## Required checks and observations

Script/ignore scopes were inspected before formatting: vendor/generated artifacts and historical testing infrastructure retain their existing narrow exclusions. No rules or diagnostics were weakened. The first lint pass found an unused import, removed without suppression; an initial node typecheck found an async-closure narrowing error, corrected by capturing the validated command before dispatch.

| Command             | Final outcome                                            |
| ------------------- | -------------------------------------------------------- |
| `npm run format`    | Exit 0; no warnings/errors.                              |
| `npm run lint`      | Exit 0; no warnings/errors.                              |
| `npm run typecheck` | Exit 0; node and web targets passed without diagnostics. |

The final production code passed those commands in the required order. Documentation-only completion updates were formatted afterward; production code remained unchanged.

No test code, fixtures, harnesses, automated verification scripts, tests, builds, app/browser launches, screenshots, probes, benchmarks, failure injection, provider/account actions or runtime verification were added/performed. No user acceptance is recorded. The [manual guide](../manual-testing/project-storage-PS02.md) owns observations for real projects, categories, duplicate accounting, cancellation/refresh/navigation, naturally unavailable files and layout/accessibility. Large-project scan cost and native filesystem/provider behavior remain unmeasured. Release remains **NO-GO**. Stop after PS02; PS03–PS08 and AI-powered import require separate requests.
