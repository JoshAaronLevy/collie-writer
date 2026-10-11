# RF04 implementation record

October 11, 2026. **Implementation complete — awaiting user testing.** Josh requested RF04 after RF03. The complete [refactor report](../../refactor-report.md) was reviewed; only RF04 (S05 and library-related S15) was implemented. Earlier stages remain awaiting runtime acceptance; RF05–RF18 need separate requests.

## Delivered change

- `ProjectRepository.listUnlocked()` no longer acquires/releases inactive projects. It reads bounded directory entries and small discovery, organization and destination records. It opens no inactive content/operation database, performs no migration or interrupted-job mutation, and initializes no snapshot owner. The already-open project's details come from its existing owner. Each project failure remains an individual issue; healthy entries remain in the result.
- The shared listing shape is distinct from an admitted project: it has no current head, and older records may have an unknown type. Inactive Save presentation says **Last saved to…** rather than comparing cached heads to claim current saved/unsaved content. The full opened-project shape remains strict.
- `project-discovery.ts` replaces the title-only reader and shares bounded hint validation with Storage inventory. Existing local `recovery.json` version 1 remains readable. Version 2 adds the project kind; successful acquisition, creation and existing content-mutation refresh points write it atomically. These are derived local display records, not portable evidence. Each list rereads them; there is no second cache or background admission framework. Archive and destination metadata are read separately so their changes do not depend on refreshing a hint. A failed hint write remains non-authoritative and can leave old display details until reopening repairs it.
- Discovery failures no longer say that content admission failed. The existing recovery dialog offers **Open project** when a unique scope is known, then uses the normal guarded opening path. The obsolete transient `project` issue variant and duplicate issue mapping are removed. Backup/snapshot alternatives remain available. Actual Open errors identify the selected project when its title is available.
- Startup requests the lightweight list and resolves its intended destination before the existing broader recovery/space scan. A remembered project with a missing hint can still be opened from its known scope. **Refresh projects** uses only the list. The broader scan remains for recovery notices and Storage; this stage does not claim to eliminate all startup filesystem work or establish a timing improvement.
- Access designation requires the project already observed open by main and checks its admitted archived state. Retained setup now opens/selects its original project before designation, preserving draft protection and section ownership. Tutorial reuse recognizes an existing project's discovery issue instead of treating it as permission to create another sample. Renderer Save recovery clears a pending request only from its exact confirmed recovery outcome, not a listed destination generation.

## Boundaries and limitations

Full `acquire()` admission remains at ordinary Open and explicit recovery, including schema migration, proofreading/conversation/import evidence validation, exact ownership and snapshot recovery. Native file/archive admission, frozen validators/digests, retained originals, local drafts, Save publication/acknowledgment and deletion proofs are unchanged. SQL/minimum reader remains **37**. Only the derived local discovery hint gains version 2; transient IPC listing/recovery shapes change with their validators and consumers. No user data was read, migrated, deleted or otherwise changed during implementation.

Listing is deliberately not proof of content health. Valid but stale hints may show older titles/dates until the project is admitted again. Old version-1 hints display an unspecified project type until refreshed. A missing or invalid hint is individually recoverable through Open when its scope is known; ambiguous directories are not guessed. A failure at the working-root boundary or directory resource ceiling can still prevent listing. The existing bounded background recovery/size scan remains and can still occupy storage work. No runtime/performance/native/provider/accessibility acceptance or release readiness is inferred.

## Source size

RF04 adds **22 net authored-source lines** relative to completed RF03. Cumulative RF01–RF04 is **+259** relative to pre-RF01 `2b4307a` (RF01 +968; RF02 −38; RF03 −693). Current tracked-source delta is −670; new untracked source contributes 929 lines. Counts include new/deleted TS/TSX/CSS files and exclude docs/Markdown, vendor/generated files and historical tests.

The small increase supplies compatible bounded metadata reading and direct Open recovery while deleting the inactive-project acquisition loop, duplicate recovery mapping and redundant setup lookup. No new dependency, workflow framework, database or authoritative cache was introduced. The overall net-reduction goal is still pending.

## Required checks

Format/lint/typecheck scripts and ignore scopes were inspected. Vendor/generated artifacts and historical test code remain outside broad formatting. Final checks with pinned Node 24.21.0/npm 11.19.0: `npm run format` passed; `npm run lint` passed without errors or warnings; `npm run typecheck` passed for node and web. The previously applied React checklist informed the existing retained owner, effect sequencing, guarded focus and accessible controls.

No tests, test code, harnesses, builds, app/dev-server launches, browser automation, provider calls, benchmarks or runtime verification were performed. See the [manual guide](../manual-testing/refactor-RF04.md) for pending user observations.
