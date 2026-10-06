# Project storage updates

October 5, 2026. Staged implementation plan based on the accepted direction in [project-storage-design.md](project-storage-design.md).

**This is implementable, but it should be delivered in stages.** Collie already has project-owned research and conversations, a portable `.collie` format, local working copies and protected Save/recovery operations. This plan covers better visibility and carefully controlled space reclamation. New import functionality is owned by the separate [AI import design](ai-import-design.md).

Start with **PS01**, then work through the core stages individually. PS01–PS04 provide clearer storage information, warnings and genuine cache management. PS05–PS07 address the larger retained-copy costs. PS08 is an optional compression improvement.

At Josh's request, the former PS09–PS11 import stages have been removed from this plan. Those identifiers are retired, not completed or renumbered. The replacement direction is a unified Codex-assisted import experience for research, writing and AI chats from differently structured external files. No storage stage depends on implementing it.

The stage sizes below are relative engineering scope, not time estimates or a promise that every stage will fit one chat turn. Each is intended to have its own reviewable implementation and user handoff. If source findings require a larger change, split that stage into named sub-stages before expanding its scope.

**Status:** PS01–PS08 are **implementation complete — awaiting user testing**, with format, lint and node/web typecheck clean. See the PS01 [record](docs/validation/project-storage-PS01.md)/[guide](docs/manual-testing/project-storage-PS01.md), PS02 [record](docs/validation/project-storage-PS02.md)/[guide](docs/manual-testing/project-storage-PS02.md), PS03 [record](docs/validation/project-storage-PS03.md)/[guide](docs/manual-testing/project-storage-PS03.md), PS04 [record](docs/validation/project-storage-PS04.md)/[guide](docs/manual-testing/project-storage-PS04.md), PS05 [record](docs/validation/project-storage-PS05.md)/[guide](docs/manual-testing/project-storage-PS05.md), PS06 [record](docs/validation/project-storage-PS06.md)/[guide](docs/manual-testing/project-storage-PS06.md), PS07 [record](docs/validation/project-storage-PS07.md)/[guide](docs/manual-testing/project-storage-PS07.md), and PS08 [record](docs/validation/project-storage-PS08.md)/[guide](docs/manual-testing/project-storage-PS08.md). No PS stage has runtime acceptance. PS01 adds storage/document-file clarity; PS02 bounded inventory; PS03 notices, capacity and space explanations; PS04 reviewed search-cache clearing with durable receipts and explicit local reconstruction; PS05 paged review and one-at-a-time removal of eligible previous Save versions; PS06 exact-file cleanup of completed snapshot/inspection leftovers with verified destination proof; PS07 explicit removal of eligible inactive local content, preserved operation records, retirement history and normal validated reopening; PS08 streaming compression for new database/small known-text archive entries, conservative deflate/expanded-validation budgets and owned compression-stream settlement. Managed blobs remain stored and existing stored archives remain readable. Portable SQL/minimum reader 13, archive/editor 1, compilation 3 and file/AI journals remain unchanged. Device-local notice/cache/retention-action records retain their separate ownership. AI import remains separate work. Existing release gates remain NO-GO.

## What we are keeping

- One self-contained `.collie` file is the portable project. Its manifest, SQLite database and managed assets carry saved writing, research, citations, conversations and portable history.
- The working root remains device-local and outside sync/mirroring folders, with the existing production/development/beta app identities.
- New projects start without a selected file. First Save uses the native picker. Explicit Save and local protection remain separate; normal close does not save the selected file.
- Existing project, workspace, document, source, conversation and operation identities retain their meanings. Account credentials and live AI execution authority stay outside portable projects.
- Pending drafts, uncertain operations, original AI output, migration originals and recovery candidates remain protected by their existing owners.
- Mantine, semantic scoped CSS, the persistent workspace controller and retained editor/draft owners remain the UI foundation.

The current baseline is portable SQL/minimum reader **13**, archive/editor format **1**, and compilation format **3**. Re-read the current code before any stage that changes formats; do not reserve a future schema number in this plan.

## Scope and order

| Stage | Deliverable                                                      | Relative size    | Depends on                       | Status                             | Model   | Effort     |
| ----- | ---------------------------------------------------------------- | ---------------- | -------------------------------- | ---------------------------------- | ------- | ---------- |
| PS01  | Clear storage locations, Save language and project-file identity | Small–medium     | Existing Save/UI contracts       | Implemented; awaiting user testing | 6.1 Sol | High       |
| PS02  | Per-project storage inventory and category breakdown             | Medium–large     | PS01                             | Implemented; awaiting user testing | 6.1 Sol | Extra High |
| PS03  | Storage warnings and operation-specific space explanations       | Medium           | PS02                             | Implemented; awaiting user testing | 6.1 Sol | High       |
| PS04  | Clear rebuildable search cache safely                            | Medium           | PS02–PS03                        | Implemented; awaiting user testing | 6 Astra | High       |
| PS05  | Reviewed removal of eligible previous Save versions              | Large            | PS02–PS04; settlement gate below | Implemented; awaiting user testing | 6 Astra | Extra High |
| PS06  | Reviewed cleanup of proven completed local artifacts             | Large            | PS05                             | Implemented; awaiting user testing | 6 Astra | Extra High |
| PS07  | Remove an eligible inactive local working copy                   | Large            | PS05–PS06; settlement gate below | Implemented; awaiting user testing | 6 Astra | Extra High |
| PS08  | Compress suitable entries in new project archives                | Medium; optional | PS02–PS03                        | Implemented; awaiting user testing | 6.1 Sol | Extra High |

These are recommendations for the coding assistant implementing each stage, not Collie's in-app AI. They reflect engineering judgment about the stage scopes, informed by [OpenAI's model-selection guidance](https://developers.openai.com/api/docs/guides/model-selection), reviewed October 5, 2026; they are not measured comparisons on this repository. Sol suits the presentation, reporting and bounded archive changes, with Extra High for ownership accounting and compression/space reasoning. Astra is recommended for deletion and retention: High for the narrowly rebuildable cache, Extra High for durable receipts, uncertain outcomes and whole-workspace removal. Extra High corresponds to `xhigh`.

PS01–PS07 are the recommended core sequence. PS08 does not block the earlier benefits. Finish the requested stage and obtain the user's results before continuing, following the standing stage workflow in [AGENTS.md](AGENTS.md). Existing Open/Restore and import paths remain supported and protected; their mention below does not add new import features to this plan.

## Current implementation and integration points

| Area                              | Current owner and implication                                                                                                                                                                                                                                                                 |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Locations and app identity        | [working-root.ts](src/main/paths/working-root.ts), [profile.ts](src/main/profile.ts), [release.ts](src/main/release.ts). Explain these locations; do not rename or move them as a cosmetic change.                                                                                            |
| Storage/recovery presentation     | [WorkspaceViews.tsx](src/renderer/src/features/workspace/WorkspaceViews.tsx), [LifecyclePanel.tsx](src/renderer/src/features/projects/LifecyclePanel.tsx), [project-lifecycle.ts](src/shared/project-lifecycle.ts). Extend Data and recovery instead of introducing a second settings system. |
| Storage overview and file history | [project-files.ts](src/worker/projects/project-files.ts). Existing size accounting is bounded, approximate and mainly covers the working root. Existing `cleanup()` clears picker history only.                                                                                               |
| Save proof and recovery           | [save-intent.ts](src/worker/projects/save-intent.ts), [snapshot-jobs.ts](src/worker/projects/snapshot-jobs.ts), [file-state.ts](src/worker/projects/file-state.ts). Existing journals, observed hashes, destination receipts and leases are inputs to future eligibility decisions.           |
| Search projection                 | [search.ts](src/worker/projects/search.ts), [repository.ts](src/worker/projects/repository.ts). `search.sqlite` is derived; saved source pages/excerpts and project databases are authoritative.                                                                                              |
| Space and archive creation        | [streams.ts](src/worker/projects/streams.ts), [snapshot.ts](src/worker/projects/snapshot.ts), [archive.ts](src/worker/projects/archive.ts). Preserve streaming, coherent capture, size bounds and publication safeguards.                                                                     |
| AI outcome retention              | [storage.ts](src/main/ai/storage.ts), [handoff.ts](src/worker/ai/handoff.ts), [handoff format](docs/formats/ai-handoff-v1.md). Releasing active capacity retains records; it is not deletion permission.                                                                                      |
| Installed project identity        | [electron-builder.direct.cjs](electron-builder.direct.cjs), [index.ts](src/main/index.ts), [project-files-ipc.ts](src/main/project-files-ipc.ts). Production association and guarded shell-open handling already exist.                                                                       |

One subtlety matters for PS02: the current `overview()` can reconcile a Save journal's acknowledgment from trusted local destination metadata. The new inventory must have an explicit read-only reporting path; viewing sizes must not become a hidden repair, import, extraction or cleanup operation.

## Shared implementation rules

### Counts do not grant deletion permission

An inventory entry reports ownership, category, location/volume, size, completeness and uncertainty. It does not itself authorize deletion. Classify unknown files and ambiguous ownership as retained/unclassified, not cache. Keep content hashes, private paths and account data out of diagnostics; expose only the information needed in the user's local UI.

Report physical file totals separately from logical content estimates inside SQLite. A database containing both writing and history cannot honestly contribute its whole physical size to both categories. Count each physical file once; distinguish shared application data from per-project attribution. Treat external saved files and known previous copies separately from the working-root total. Do not scan all of Documents or hydrate cloud files just to fill a dashboard.

### Mutations require current owner proof

PS04–PS07 must use narrow main/worker actions, validated through shared/main/preload/worker boundaries. The renderer submits reviewed IDs, scope and an operation identity; it cannot submit arbitrary paths or declare a file disposable.

Before changing disk state, recheck the relevant project head, mapping generation, artifact identity, active readers, jobs, leases, drafts and original AI ownership. Review cancellation performs no mutation. Changed/unknown state requires another review. Hold the appropriate owner boundary through the operation; a stale renderer `busy` flag is not a lock.

For retained content removal, use a small versioned durable operation record outside the removal target. Record the reviewed set and per-item results so lost replies and interrupted cleanup reconcile the same operation. Preserve exact retry identities and the distinction between not started, removed, retained, changed and unknown. Never retry deletion against a replacement file at the same pathname. Directory synchronization and cross-platform atomicity limits must be documented rather than assumed away.

New retention records need strict readers, conservative legacy behavior and integration with discovery/reconciliation. Old journals remain readable. Intentional removal must not masquerade as missing/corrupt recovery, and deleting a payload must not delete the only receipt required to settle the operation. A quarantine rename on the same disk does not reclaim space; do not report it as recovered capacity or promise Undo after final deletion.

### Existing audit dependencies

The [code audit](code-audit.md) records unresolved worker-settlement and export recovery concerns relevant to this plan. These are separate stages, not permission to implement the entire audit as part of storage work:

- **CA03 settlement gate:** destructive retention and workspace removal must not start while a timed-out worker request could still be using the target. Reinspect CA03's current status before PS05/PS07. If unresolved and the storage action cannot prove settlement through its actual owner, it remains unavailable until that prerequisite is repaired in a separately scoped request.
- **CA01/CA07/CA08 export gate:** PS06 excludes export payloads whose publication, operation identity or durable outcome is uncertain. It cannot interpret an old `completed` report as sufficient proof or repair those export issues by deleting artifacts.

This keeps early read-only work independent of the audit while making the destructive dependencies explicit. No unfinished audit stage is described as accepted by this plan.

## PS01 Explain storage and project identity

**Implementation checkpoint — October 5, 2026:** complete, awaiting user testing. Data and recovery now separates the shared working folder from the current selected file, with main-owned paths, existing reveal actions and scope-matched status. Project-file/library/help copy explains the saved project contents, local protection, explicit Save and retained organization/recovery. Search is accurately described as rebuildable, with no cache-clearing action delivered. Production macOS/Windows document associations explicitly use the approved existing icons; development/beta and guarded shell opening are unchanged. All required code checks passed without warnings/errors. UI/native and installed association observations remain pending; see the linked record/manual guide above. Stop after PS01 for the user's results.

**Outcome:** the user can tell where the current project lives, whether its latest changes are only local, and what a `.collie` file contains.

Extend existing Data and recovery, project-file status and relevant library/help text. Show working-data and selected-file locations using main-owned values and the existing reveal actions. Explain that research, citations, managed originals and saved conversations travel with the project. Preserve concise status wording and avoid adding a new modal to ordinary Save.

Correct stale wording such as “There are no disposable content caches”: search is derived today, although a general cache-clearing action is not yet available. Keep Clear picker history accurately named. Describe Archive and Reset as organization/recovery operations that do not reclaim space.

Use the approved existing app artwork for the production document association. Make platform association configuration explicit where necessary using the existing `.icns`/`.ico` files, without generating a new logo, registering development/beta as the production owner or changing the guarded shell-open flow. Installed appearance remains a separate manual observation.

**Format impact:** no project schema, archive, account, Save or location migration.

**Manual acceptance for the user:**

1. Open a disposable project and Data and recovery; working location and saved-file location have distinct explanations, including a never-saved state.
2. Edit, protect locally and then Save; the displayed states distinguish local protection from the captured file. Close/reopen preserves the established unsaved behavior.
3. When an appropriate installed production artifact is available, inspect and double-click a disposable `.collie`; observe the approved icon and normal guarded project opening. Leave this pending if no such artifact exists.

## PS02 Show a categorized storage inventory

**Implementation checkpoint — October 5, 2026:** complete, awaiting user testing. Data and recovery has an explicit, paged inventory of project/shared/application/known-external storage, expandable categories, locations/volume labels, measurement times and cancellation. The independent worker path uses metadata only, without acquiring projects, opening SQLite, calling recovery reconciliation, extracting archives or loading encrypted AI history. Known AI operation ownership comes only from main's existing validated in-memory records; other encrypted data stays shared/unattributed. File identities are counted once, database content types share one physical total, and unknown/limited/cancelled results remain incomplete. The [transient contract](docs/formats/storage-inventory.md) records bounds and native-I/O limitations. The typed search-cache registry exposes no clearing. Required format/lint/node-and-web-typecheck passed without warnings/errors. Runtime, layout, native filesystem and large-library observations remain pending; see the linked record/manual guide above. Stop after PS02 for the user's results.

**Outcome:** the user can see which projects and categories consume space before any new content-removal feature exists.

Create a bounded worker-owned inventory service and a scoped Data and recovery view. Include current working databases/assets, derived search data, retained local copies, known external project/previous files, and a separate shared/unattributed category for application/AI storage. Attribute AI content through trusted ownership metadata; do not read every encrypted payload eagerly or infer ownership from the currently selected project.

Use paged/batched work, cancellation and partial results with an as-of time. Missing permissions, unknown legacy artifacts and offline destinations are visible as incomplete/unknown, never zero bytes. Reuse recorded trusted locations for known external files, with safe metadata access and no arbitrary directory traversal. Do not extract archives, migrate unopened projects or persist a new content-bearing inventory merely to calculate sizes.

Define a typed cache-category registry now, but expose no deletion through it yet. Preserve existing recovery inspection and original-project links even when size discovery is incomplete. Physical totals and estimated logical subcategories must explain their different meanings.

**Format impact:** new validated transient reporting contract; no portable format change. Avoid persistent inventory unless a bounded, rebuildable sidecar is actually necessary and documented.

**Manual acceptance for the user:**

1. Open the overview with several genuine disposable projects; per-project totals and shared/application categories are understandable and do not double-count a file.
2. Expand a project; original research and recovery are visibly distinct from derived search data.
3. Cancel/refresh inventory or inspect a naturally unavailable destination; partial/unknown information stays honest and writing remains available.

## PS03 Add storage notices and useful space errors

**Outcome:** the user gets actionable warnings before ordinary storage growth becomes a surprise.

**Implemented October 5, 2026 — awaiting user testing.** See the [record](docs/validation/project-storage-PS03.md), [contract addendum](docs/formats/storage-notices.md) and [manual guide](docs/manual-testing/project-storage-PS03.md). Measure/Refresh remains explicit; conditions use all measured groups, not just the visible page. Passive notices retain dismissal/24-hour snooze with hysteresis, link to the matching breakdown/volume, and show unknown/incomplete results honestly. File/snapshot/export/queued worker budgets account for cooperating jobs on their observed devices; errors show checked locations/estimates or explicitly uncertain native-write context. No continuous monitoring, deletion, cache clearing or new import was added. Preferences are bounded/expire; reservations do not cover other applications or all main/native writes. These limitations and native/manual observations remain pending, not evidence of safe deletion or release readiness.

Build notices from PS02's bounded measurements. Start with the proposed design defaults: cache notices at 500 MiB per project or 2 GiB app-wide, a total-project review notice at 5 GiB, and a low-volume-space notice below the greater of 5 GiB or 10%. These are tunable product defaults, not measured safety thresholds. Use one notice per relevant condition with dismissal/snooze and hysteresis; do not interrupt typing repeatedly or scan the entire library on every keystroke.

Distinguish size advice from operation admission. Preserve existing preflight checks and improve their user-visible explanation with the affected location, estimated extra bytes and next actions. Account for working/destination volumes separately and concurrent reservations among Collie-owned jobs where necessary. Unknown capacity never becomes “enough space,” and free-space estimates cannot reserve space against other applications.

Do not advertise cache clearing before PS04 exists. Initially link to the breakdown, existing Backup/Save As and appropriate recovery actions. On write failure preserve the current exact operation, protected work and live buffers; a low-space notification cannot override close guards.

**Format impact:** any snooze preference is bounded, device-local and non-authoritative; no portable schema change.

**Manual acceptance for the user:**

1. Use the overview on ordinary projects; no repeated warning appears when a threshold is not reached.
2. If naturally accumulated data exceeds a threshold, follow the notice; it opens the relevant category and volume rather than offering to erase the project.
3. If a real low-space/write failure occurs, the message identifies the affected operation/location and retains the existing work. Do not fill disks or manufacture failures for this step; leave unobserved cases pending.

## PS04 Clear rebuildable search data

**Implementation complete — awaiting user testing.** The [record](docs/validation/project-storage-PS04.md), [format/limits](docs/formats/search-cache-actions-v1.md) and [manual guide](docs/manual-testing/project-storage-PS04.md) describe the delivered scope. Data previews the current project's exact search files; confirmation runs under the repository/search owner with durable per-item receipts. Uncertain/changed/sidecar-bearing retained copies stay retained. Check outcome never repeats deletion. Current index proof needs the live search owner; unloaded caches explain how to open Search first. Search initialization is now explicit, with observation-only activity polling and no hidden query/rebuild. Inventory refresh follows the result while Data is visible. No runtime acceptance is claimed and PS05 is not started.

**Outcome:** Clear cache removes only data Collie can reconstruct locally from committed project content.

Implement the first cache registry entry for the current search projection, including any confidently identified retained search-index copies. Coordinate with the repository/search owner: stop index work, close its SQLite connection safely, remove only approved sidecars, and schedule reconstruction on explicit search use. Keep source pages, excerpts, corrections and all project databases intact. Do not immediately rebuild the entire cache merely because the storage screen remains open.

Offer a preview of the known cache files and estimated bytes, followed by the exact scoped action. Exclude symlinks, unexpected files and anything whose cache identity is uncertain. Preserve writing, unsent form owners, history, credentials, AI journals and snapshot leases. Future thumbnails can join this registry only when there is an actual production owner and reconstruction contract; do not invent a preview subsystem for this stage.

Update the inventory after removal. Report what was removed and any retained items; do not guarantee a physical-space reduction from logical SQLite deletion or a quarantine move.

**Format impact:** local cache-action state if needed; no project data migration or blob collection.

**Manual acceptance for the user:**

1. In a disposable project with existing search data, review Clear cache; only search data is eligible and Cancel preserves it.
2. Confirm removal; writing, source originals, citations, saved conversations and history remain available, and the storage view reports the outcome.
3. Use Search again; the app rebuilds the projection from retained records and reports indexing status without a network or AI request.

## PS05 Manage retained previous Save versions

**Implementation complete — awaiting user testing.** See the [record](docs/validation/project-storage-PS05.md), [owner/format/limits contract](docs/formats/retained-versions-v1.md) and [manual guide](docs/manual-testing/project-storage-PS05.md). Data provides four-row pages, explicit single selection, Cancel, irreversible confirmation and original-outcome reconciliation. Only acknowledged same-destination/grant-chain copies with actual archive ownership, expected hash and a retained replacement qualify. The newest previous version, selected/Backup paths and aliases, foreign/uncertain/uninspectable files and reappearing removed paths stay protected. Read-only descriptor inspection does not extract or reconcile. Receipts precede unlink and preserve original Save journals; reporting recognizes confirmed intentional removal only while the path is absent. No runtime acceptance is claimed. PS06 is recorded below.

**Settlement gate decision:** CA03 remains unresolved generally. This action proves settlement through the actual `ProjectFiles` maintenance guard, awaited worker command queue, exact active project lock and repository serial boundary, with live file/snapshot/export owners refused. A caller timeout releases none of these owners. This narrow path satisfies PS05's gate without implementing CA03; it confers no eligibility on other retained-artifact classes or PS07. The contract records the proof and its native/platform limits.

**Outcome:** the user can deliberately reclaim selected old full-file versions, separately from cache clearing.

Introduce the retained-artifact review/receipt contract and its first narrowly bounded class: app-created previous files tied to settled, acknowledged Save operations. Preview exact file identities, actual project/snapshot ownership, dates, sizes and reasons an item is protected. No selection or deletion occurs automatically because of age. Keep the most recent previous version protected by default; never include explicit user Backup files or the currently selected project file.

An old Save As may have replaced a file belonging to another project. Do not attribute that previous file to the initiating project solely from its journal. Validate the actual archive and expected hash before determining eligibility. Unknown ownership, changed bytes, unavailable authority, unresolved journals or missing replacement proof keep the item retained. Existing Data and recovery inspection is not automatically a read-only preview because it can retain another incoming copy; add a bounded inspection path appropriate to this operation.

After visible review and confirmation, execute under the original file-operation/settlement owner, with a durable per-item receipt outside the target. Recheck path identity and grants immediately before removal. Reconcile interrupted outcomes without deleting a newly substituted file or erasing the original Save receipt. Refresh recovery discovery so intentionally removed versions are not presented as inexplicably missing.

**Format impact:** versioned device-local retention records and consumers; no portable project rewrite. Document conservative legacy and older-reader behavior.

**Manual acceptance for the user:**

1. Make several ordinary Saves of a disposable project; review previous versions, with current/manual-backup/protected entries excluded.
2. Cancel a review, then confirm removal of an eligible older version; only that selection disappears and the reported space reflects the result.
3. Open the current file and a remaining previous version; each still follows its existing guarded open/restore path. Changed or naturally unavailable candidates remain protected.

## PS06 Manage completed local artifacts

**Implementation complete — awaiting user testing.** See the [record](docs/validation/project-storage-PS06.md), [supported/protected matrix and v2 contract](docs/formats/local-artifact-retention-v2.md), and [manual guide](docs/manual-testing/project-storage-PS06.md). The shared retention interface adds a separate completed-local-artifact review and pending-action owner. It removes one exact file from a transferred candidate, completed capture, or snapshot/Save/Backup inspection only after single-consumer snapshot completion/released-lease proof, original acknowledgment and full destination/content validation. Ordinary Save requires the current destination/grant generation; Backup requires its exact still-valid file. Normal successful work already removes these copies, so an empty review is expected. Unknown/unsupported content stays retained and counted. New v2 receipts and per-payload references precede unlink and preserve original journals; status never repeats deletion. No portable or snapshot-journal migration was added.

**Settlement and export gate decision:** the awaited worker/file/repository boundaries are extended by the actual snapshot control owner, which refuses outstanding tasks and active/pending work through the entire action. This supplies narrow PS06 settlement proof; CA03 remains unimplemented generally. Export artifacts remain excluded under unresolved CA07/CA08, along with incoming archives lacking consumption receipts, migration/reset recovery and AI outcomes. No runtime acceptance is claimed. PS07 has its own requested implementation checkpoint below; PS08 and AI import remain separate requests.

**Outcome:** the same retention UI can address additional large local copies only when their owners prove they are no longer needed.

Extend PS05's registry and operation record to specific completed snapshot/inspection/transfer payloads. Reuse durable destination acknowledgment and lease release where applicable. A job's age, filename, terminal label or absence from a live map is insufficient proof. Keep small operation identities/receipts needed for exact replay even when a large payload is removable.

Implement each eligible artifact class through its existing owner. Keep incoming archives without a durable consumption receipt, interrupted/corrupt journals, untransferred candidates, provisional/exact leases, export artifacts affected by unresolved audit findings, migration originals/backups, reset recovery and encrypted AI outcomes protected. Show a reason instead of a misleading general “Clean all” button.

This stage intentionally does not make every recovery category purgeable. It should produce a documented matrix of supported removal classes and retained classes, with concrete prerequisites for future expansion. Do not hide unclassified bytes to make the totals look cleaner.

**Format impact:** additive local retention classes/readers; preserve snapshot journal versions and original operation semantics unless an explicit compatible migration is necessary.

**Manual acceptance for the user:**

1. Review naturally accumulated completed artifacts from disposable projects; each eligible item names its owning operation and reason for eligibility.
2. Remove a reviewed eligible payload; the saved project and operation outcome remain discoverable without repeating Save/import/export.
3. Inspect uncertain or unsupported classes; they remain retained with a useful explanation and their recovery actions still work.

## PS07 Remove an eligible inactive working copy

**Status: implementation complete — awaiting user testing.** Required format/lint/node/web typechecks passed cleanly. See the [record](docs/validation/project-storage-PS07.md), [v3 local contract and limits](docs/formats/working-copy-removal-v3.md), and [manual guide](docs/manual-testing/project-storage-PS07.md). No runtime acceptance is recorded.

**Delivered boundary:** Data and recovery offers inactive-project review, Cancel, explicit confirmation, original-outcome checking and paged removal history. Confirmation revalidates the actual saved archive against all database content/history and managed assets. Verified content files are unlinked individually; small original metadata/operation journals and empty directories remain at their original paths. A global retirement marker, locator and v3 retention receipt precede removal. Library/open/create replay refuse the old scope; ordinary validated file opening creates a new workspace without overwriting retained records or transferring access authority.

**Settlement decision:** CA03 remains unresolved generally. PS07 holds the actual worker/file/repository boundaries and inactive project root lock; outgoing snapshot owners include their actual task lifetime. Main checks hot/cold AI history and reserves the original scope through removal or authoritative status settlement, never releasing it on a caller timeout. Persisted retirement blocks new AI dispatch to that scope. Initial eligibility excludes all AI-linked work, protected migration/snapshot/export recovery, prior local cache/artifact cleanup records, unknown files and unsupported/oversize evidence. This is a narrow removal action; it does not implement CA03 or relocate recovery. PS08 and AI import remain separate requests.

**Outcome:** a user can remove a redundant local working copy after preserving its current project in a validated portable file.

Implement an explicit **Remove local working copy** action for a closed/inactive workspace. Prove that the currently accessible saved archive contains its current committed head and complete managed inventory; a catalog pathname, old hash or newer timestamp alone is insufficient. Resolve pending drafts and original file/snapshot/search/AI activity before releasing local content. Reject destination-null, locally newer, uncertain, inaccessible and unreadable cases with Save/Backup/recovery guidance.

Define precisely what remains: a bounded locator/removal receipt outside the removed workspace, required global operation history, account stores and separately retained recovery. A later Open revalidates the actual file and recreates a workspace through the existing import/identity flow; it does not silently treat the stale locator as file access authority. Cancellation or interrupted removal must reconcile through PS05's durable operation record without claiming that a quarantine move freed space.

Protected migration originals, independent snapshot candidates and other recovery inside the workspace must remain discoverable outside the removal target with their ownership intact, or removal must be refused. Initial eligibility may exclude these cases instead of introducing a broad recovery relocation system. A current saved archive does not prove that all such local historical artifacts are redundant.

Original AI handoffs can require records in the original workspace. If those dependencies cannot remain valid without that workspace, **refuse its removal**. Initial eligibility may therefore exclude AI-linked workspaces; show the precise reason. This stage must not delete bindings, orphan original-project recovery links or invent a new authority from a portable copy. Supporting those cases would require a separately specified extension.

**Format impact:** bounded local locator/removal state and library/recovery consumers; no portable schema change. Whole-workspace removal is explicit data removal, never cache clearing.

**Manual acceptance for the user:**

1. Save a disposable eligible project, switch away and review removal; the exact saved file and local-only consequences are shown.
2. Confirm, then open the retained `.collie`; writing, research, citations and saved project history return through normal opening, with derived indexes rebuilt as needed.
3. Try the review on never-saved, locally newer or AI-dependent work; removal is unavailable with a specific safe next action. Archive and Reset retain their separate meanings.

## PS08 Compress suitable new archive entries

**Implementation complete — awaiting user testing.** The [record](docs/validation/project-storage-PS08.md), [manual guide](docs/manual-testing/project-storage-PS08.md) and [archive policy/budgets](docs/formats/archive-compression-v1.md) describe streamed deflate level 6, the 2 MiB known-text threshold, stored blobs, owned stream closure, worst-case candidate bounds and full expanded validation admission. Required format/lint/node/web typechecks passed cleanly; no runtime size, compatibility, cancellation or performance acceptance is recorded.

**Outcome:** newly saved text/database-heavy projects can use less space without changing the self-contained format.

This optional stage comes after useful storage accounting. Initially compress `project.sqlite` and small manifest/citation text entries using the already accepted ZIP deflate method; keep blobs stored until reliable media classification and resource budgets justify extending compression. Do not infer type from hash filenames. Existing archives are never recompressed in place.

Retain hashes of expanded content, CRC checks, reader bounds, coherent capture, cancellation and publication validation. Recalculate conservative temporary-space budgets, including deflate worst-case overhead and full validation extraction. Never admit a Save on an assumed compression ratio. CPU/memory/elapsed-time costs remain unmeasured until the user observes representative real projects.

**Format impact:** archive container remains v1 only if the existing supported reader contract accepts every emitted entry; no SQL migration solely for compression. Document the writer policy change and preserve stored-entry reads.

**Manual acceptance for the user:**

1. Save a disposable text-heavy project to a new file and inspect its size; record the observed result without a promised reduction percentage.
2. Open that file and an older genuine uncompressed project; compare writing, citations, attachments and conversation history through the app.
3. Use Save/Backup on an attachment-heavy disposable project; observe normal progress and safe cancellation where available. Do not run benchmarks or generated workloads.

## Work deliberately outside this sequence

**AI-powered import is a separate feature.** Its Research/Writing/AI chats selection, file intake, Codex analysis, organization preview and conversion into a Collie project belong to [ai-import-design.md](ai-import-design.md). This plan does not implement file-format adapters, dataset browsers, AI classification, import review or conversion schemas. A future importer will respect the storage ownership/retention contracts delivered here without becoming a prerequisite for them.

The accepted design raises useful longer-term questions without requiring all of them now. This plan does not introduce encrypted project archives, shared global research libraries/blob storage, automatic cloud synchronization, simultaneous editing/merging, live-working-root relocation, an exploded large-project format, automatic backup scheduling, a sanitized Share a copy feature, or arbitrary bulk purge of managed originals/migration/reset/AI history.

Those need separate product and persistence contracts. PS02 will expose their retained costs honestly; it will not conceal them or make future deletion commitments. A new paper-sheet document icon is also optional—the approved existing artwork is enough for PS01.

## Completion and user handoff

For every requested implementation stage:

1. Re-read the current source, this stage's dependencies, [AGENTS.md](AGENTS.md) and relevant format/decision records. Preserve any concurrent user changes and previous stage outcomes.
2. Implement only that stage and necessary fixes within its defined boundaries. Preserve existing retained owners and exact operations; do not expand a destructive feature when its proof is unavailable.
3. Inspect script/ignore scope, then run `npm run format`, `npm run lint`, and `npm run typecheck` in that order. Fix all errors and warnings, including surfaced pre-existing findings, without broad ignores or rule suppression. Documentation-only work needs none of these checks.
4. Do not create or run automated tests, fixtures, test tools, builds, app launches, browser automation, screenshots, benchmarks, disk-filling or failure-injection tasks. The user owns runtime/manual acceptance.
5. Add `docs/validation/project-storage-PSxx.md` and `docs/manual-testing/project-storage-PSxx.md`, recording actual changes, formats, code-check outcomes, limitations and observations still pending. Update this stage's ledger and applicable project guidance.
6. Give a short ordered “Stage PSxx complete. As a user:” guide pairing actions with visible outcomes. Include the user's setup/launch step—normally `npm run dev` for development-only observations, with packaged-only checks deferred until an appropriate artifact exists. Use disposable projects/copies for removal and import scenarios.
7. State **implementation complete — awaiting user testing** only after implementation and required code checks are clean. Stop for the user's results. Missing packaged/native evidence remains pending and does not become acceptance because source checks passed.

For an implementation blocker, record what is incomplete and its exact prerequisite; do not mark the stage complete. Overall storage acceptance and release readiness remain distinct.
