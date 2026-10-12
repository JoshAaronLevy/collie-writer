# Collie Writer refactor report

October 11, 2026 · Repository source review and staged implementation

**RF01–RF11 and RF13–RF18 are implementation complete — awaiting user testing.** RF12 remains intentionally deferred pending Josh’s further Import testing and an explicit request. [RF18’s record](docs/validation/refactor-RF18.md) and [manual guide](docs/manual-testing/refactor-RF18.md) cover the documentation consolidation. The original review below describes the pre-refactor checkout; its source observations are not runtime acceptance.

**The main problem is that Collie makes the user operate its internal safety machinery.** Recovering writing, opening a file, exporting a document, and managing an AI response too often become instructions to inspect, protect, reconcile, acknowledge, refresh, or navigate somewhere else. The underlying precautions often have a valid purpose. Making the user coordinate them does not.

The storage warning is a concrete example. It combines several different conditions into one alarm, loses important diagnostic information, and sends the user to a general settings page instead of resolving their specific problem. Fixing that requires both a simpler interaction and a better recovery result from the backend. Shorter paragraphs alone will not fix it.

This review covered the repository inventory and the architecture, callers, state owners, user interactions, and persistence boundaries across the application. The checkout contains 1,030 tracked files, including 431 TypeScript/TSX/CSS files under authored `src` paths, totaling 109,523 lines, and 176 documentation files. These are inventory figures, not a claim that every line or dependency has been proven correct. Detailed reading concentrated on the live feature paths and their storage/recovery dependencies; bundled upstream code, binary assets, and historical testing material were inventoried and their integration inspected, not independently audited.

No app, test, build, provider request, or runtime verification was run. No user project or recovery directory was inspected or changed. The actual cause of Josh's current recovery warning is therefore **not established**. Findings below distinguish what the source demonstrates from proposed behavior. At the original review checkpoint, only this report was added; implementation changes are recorded separately above.

## Implementation standard — clarified October 11, 2026

Josh's objective includes a smaller, cleaner implementation. A simpler screen is insufficient if it leaves unnecessary workflows intact or adds another layer around an overcomplicated owner. Prefer the smallest readable solution that fully serves the current feature. Remove redundant state, duplicated orchestration, obsolete paths and needless abstractions as their replacements land. Moving code between files is not evidence of simplification; extractions must remove duplication or clarify a real responsibility without creating parallel owners.

Small additions are justified when they fix a concrete correctness gap or make necessary behavior clear to the user. Preserve live data and compatibility obligations, and trace downstream callers before removing code. Avoid speculative flexibility, generic frameworks and code compression for the sake of a lower count.

The implemented RF01–RF11 and RF13–RF18 stages produce a **measured net decrease of 4,901 non-documentation application source lines** relative to the pre-RF01 checkout. RF18 changes documentation only; RF12 remains unimplemented, so this is not a final count for all numbered stages. Line count supports, but does not establish, simpler behavior or user acceptance.

Record each stage's source-line delta and the cumulative delta, excluding docs/Markdown, generated/vendor files and historical tests. Explain increases by the concrete problem solved. Remove replaced implementations, callers and exclusive styles within the same stage rather than promising later cleanup. Completion requires simpler behavior and ownership as well as cumulative reduction; a succession of larger implementations behind smaller interfaces does not meet this objective.

| Implemented stage | Net source lines | Cumulative from pre-RF01 | Concrete change                                                                                                                                                                        |
| ----------------- | ---------------: | -----------------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [RF01](docs/validation/refactor-RF01.md)              |             +968 |                     +968 | Specific recovery issues and direct actions, with shared local acknowledgment and preserved alternatives.                                                                              |
| [RF02](docs/validation/refactor-RF02.md)              |              −38 |                     +930 | One Save presentation, removal of the FilePanel wrapper and duplicate full controls, direct ordinary Open and focused version choices.                                                 |
| [RF03](docs/validation/refactor-RF03.md)              |             −693 |                     +237 | Locations and space first; direct cache clearing, dated version deletion, focused temporary/local-copy actions; replaced dashboards and Reset/picker-history authoring removed.        |
| [RF04](docs/validation/refactor-RF04.md)              |              +22 |                     +259 | Bounded local discovery replaces opening every inactive project; compatible hints and direct Open recovery preserve admission and access boundaries.                                   |
| [RF05](docs/validation/refactor-RF05.md)              |             −146 |                     +113 | One shared project menu and retained details dialog replace overlapping panels; Move authoring is retired in favor of existing Save As behavior.                                       |
| [RF06](docs/validation/refactor-RF06.md)              |             −771 |                     −658 | Unused helpers/shims/styles and dormant Grok code removed; inert review/Re-Analyze UI and duplicate startup copy retired with their wiring.                                            |
| [RF07](docs/validation/refactor-RF07.md)              |             −181 |                     −839 | One export action and guarded writer replace the preview ceremony and separate DOCX authoring; optional recipes/order, retained results and safe Show file remain.                     |
| [RF08](docs/validation/refactor-RF08.md)              |              −22 |                     −861 | Direct style selection and internally protected refresh replace preview acknowledgment/revision/occurrence UI; retained retries and canonical bibliography/notes remain.               |
| [RF09](docs/validation/refactor-RF09.md)              |             −302 |                   −1,163 | Direct source Details, automatic original/text reading and excerpts; shared Import intake replaces the per-record bibliography workflow and backend authoring.                         |
| [RF10](docs/validation/refactor-RF10.md)              |              +35 |                   −1,128 | Compact note/label controls and selected-item evidence entry; concrete draft/cancellation/first-decision guards, with replaced state and duplicated rendering removed.                 |
| [RF11](docs/validation/refactor-RF11.md)              |             −541 |                   −1,669 | Direct account/model controls and response recovery; slot/connection dashboards and duplicate notices removed; existing local handoff eligibility shared.                              |
| [RF13](docs/validation/refactor-RF13.md)              |              +67 |                   −1,602 | Direct dated history/restore; automatic incremental search updates and honest incomplete/original coverage, with contextual Stop/Continue/Rebuild and redundant state removed.         |
| [RF14](docs/validation/refactor-RF14.md)              |              −11 |                   −1,613 | Dedicated contextual notices and quiet successes; direct bounded support preview, plain panel recovery and one local icon family; redundant status state, copy and dependency removed. |
| [RF15](docs/validation/refactor-RF15.md)              |               −9 |                   −1,622 | Direct retained setup remedies and proportionate access controls; duplicate picker/status/copy and ineffective controls removed, with local read retry and contextual expiry.          |
| [RF16](docs/validation/refactor-RF16.md)              |           −3,404 |                   −5,026 | Unreachable Codex/registered authoring, runtimes, IPC and controls removed; current direct dispatch stays separate from frozen history and encrypted recovery readers.                 |
| [RF17](docs/validation/refactor-RF17.md)              |             +125 |                   −4,901 | Separate retained manuscript protection and navigation/focus owners; one section-field update path, shared document-ID indexing and fewer commit reads.                                |
| [RF18](docs/validation/refactor-RF18.md)              |                0 |                   −4,901 | Consolidate current guidance and repair links; documentation-only change.                                                                                                            |

These are formatted authored-source line deltas against pre-RF01 `2b4307a`, including new/deleted authored application files and excluding documentation, generated/vendor files and historical tests. The cumulative implemented-stage change is **−4,901 lines**. RF12 has no implementation or source delta. Each stage label above links its dated record with detailed changes, code-check outcomes and pending observations. Native, provider, content and accessibility acceptance remain pending.

## 1. What can be deleted

These are bounded removal candidates, not permission to wipe old-looking directories. Removing a referenced component includes removing its imports, mounting code, and exclusively owned styles in the same change. “No caller found” means repository source references were inspected; it is not a runtime guarantee.

### Unused code and obsolete wiring

| ID  | Delete                                                                                                                                                                                                                                                                                             | Evidence and scope                                                                                                                                                                                                                                                           | What remains                                                                                                                                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D01 | `copyDocument()` in [editor/schema.ts](src/domain/editor/schema.ts), starting at line 275                                                                                                                                                                                                          | The exported helper has no repository caller. Its ID-remapping implementation is unused. Delete this function, not the schema module.                                                                                                                                        | `readDocument`, editor validation, actual project duplication, clipboard handling, and their own identity rules.                                                                                               |
| D02 | `templateNames` in [projects/templates.ts](src/domain/projects/templates.ts), line 52                                                                                                                                                                                                              | Only the definition remains. Current UI reads `projectTypes` and template helpers.                                                                                                                                                                                           | Templates, names in `projectTypes`, and `projectTemplates`, which have active callers.                                                                                                                         |
| D03 | [Projects.tsx](src/renderer/src/features/projects/Projects.tsx)                                                                                                                                                                                                                                    | The entire file is a two-line forwarding shim for `WorkspaceViews`. `App.tsx` can import that component directly. This removes an obsolete architectural name.                                                                                                               | `WorkspaceSessionProvider`, `useWorkspaceController`, `WorkspaceViews`, and the editor/draft owners. Do not delete `Projects.css`, which is separately used.                                                   |
| D04 | The commented-out citation `<aside>` in [App.tsx](src/renderer/src/App.tsx), and its `.citation-attribution` rules in [App.module.css](src/renderer/src/App.module.css)                                                                                                                            | The JSX is commented out; the matching styles no longer style rendered content.                                                                                                                                                                                              | Bundled notices/source, Help license actions, and any actual attribution obligations. This is removal of dead markup, not a licensing decision.                                                                |
| D05 | `.storage-details` and its descendant rules in [App.module.css](src/renderer/src/App.module.css)                                                                                                                                                                                                   | No authored source consumer remains.                                                                                                                                                                                                                                         | Live storage styles under the settings and project feature owners.                                                                                                                                             |
| D06 | Unreferenced rules/selectors in [AiConnections.module.css](src/renderer/src/features/ai-connections/AiConnections.module.css): `.ai-provider-heading`, `.ai-provider-symbol`, `.ai-provider-description`, `.ai-connection-state`, `.ai-status-actions`, `.ai-sign-in-progress`, `.ai-funding-note` | Source searches find these names in CSS but no live JSX consumer. For grouped rules, remove only the unused selector.                                                                                                                                                        | Shared selectors such as `.ai-sharing-note`, `.ai-account-actions`, `.ai-current-account`, `.ai-account-choice`, `.ai-saved-accounts`, `.ai-connection-details`, and `.ai-execution-availability` are used.    |
| D07 | The unused `compact` prop, `data-compact` attribute, and compact-only rules for [AiConnectionPanel.tsx](src/renderer/src/features/ai-connections/AiConnectionPanel.tsx)                                                                                                                            | Its sole current mount in `ConnectionSettings.tsx` does not supply the prop. There is no active compact variant.                                                                                                                                                             | The current account settings entry and shared ChatGPT dialog.                                                                                                                                                  |
| D08 | [grok-runtime.ts](src/main/ai/grok-runtime.ts), [grok-deployment.ts](src/main/ai/grok-deployment.ts), and their import/member in [registry.ts](src/main/ai/registry.ts)                                                                                                                            | This is 382 lines of dormant implementation before registry cleanup. The only registered consumer selects `PROVIDER_RUNTIMES[AI_PROVIDER]`; `AI_PROVIDER` is fixed to `openai-codex`. No live route selects `xai-grok-build`, and its launch function always refuses anyway. | Current ChatGPT features and their recovery formats. Retain the research decision in historical documentation if useful. This does not justify deleting Codex/registered-OpenAI compatibility code as a group. |

D01–D08 need no project-data migration. D03 and D08 need small caller/import edits. Update current documentation that links to removed paths; dated records may explicitly describe historical paths.

### UI that adds no usable feature

These are product simplifications, rather than claims that the components are unreachable. They deliberately revise earlier placeholder UI decisions in favor of the MVP direction requested here.

| ID  | Delete                                                                                                                                                                                                                                                                                                      | Why it can go                                                                                                                                                                                                                 | Boundary                                                                                                                                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D09 | [ReviewOptionsDialog.tsx](src/renderer/src/features/workspace/ReviewOptionsDialog.tsx), its [CSS module](src/renderer/src/features/workspace/ReviewOptionsDialog.module.css), and the review-options-only trigger/state in [WritingWorkspace.tsx](src/renderer/src/features/workspace/WritingWorkspace.tsx) | The dialog offers eight choices in three groups, explains a future feature, and always disables Submit. None of those choices runs a review. This directly violates the expectation created by a review button.               | Keep actual saved proofreading reviews, findings, correction safeguards, and chat. A future working review can return when implemented. Do not relabel conversation chat as an equivalent proofreading implementation. |
| D10 | The disabled **Re-Analyze / Coming later** block, its `useId` value, and exclusively owned `.futureAction` styles in [ImportResults.tsx](src/renderer/src/features/imports/ImportResults.tsx) and [ImportProvider.module.css](src/renderer/src/features/imports/ImportProvider.module.css)                  | It never performs an action. Cancel and Accept already describe the working result flow.                                                                                                                                      | Keep Submit, explicit continuation/retry eligibility, cancellation, saved findings, and atomic Accept. This report recommends changing the earlier explicit placeholder requirement; no change is made here.           |
| D11 | The sentence claiming cache clearing is unavailable in [LifecyclePanel.tsx](src/renderer/src/features/projects/LifecyclePanel.tsx), around line 188, and [AboutPanel.tsx](src/renderer/src/features/settings/AboutPanel.tsx), around line 93                                                                | It contradicts the live `SearchCachePanel`, which is mounted by `StorageInventoryPanel`. Incorrect reassurance/instructions actively reduce trust.                                                                            | Accurate distinctions between rebuildable search data and irreplaceable project/recovery content.                                                                                                                      |
| D12 | The repeated explanatory paragraphs at the end of [ProjectStorageSummary.tsx](src/renderer/src/features/settings/ProjectStorageSummary.tsx)                                                                                                                                                                 | These repeat the portable-file/local-work model already explained in `FilePanel`, About, and the settings introduction. The summary's useful content is project name, filename, status, and action.                           | Keep those four useful elements and one concise, consistent explanation at the relevant Save/help location.                                                                                                            |
| D13 | Routine internal accounting prose in [StorageAdvicePanel.tsx](src/renderer/src/features/settings/StorageAdvicePanel.tsx)                                                                                                                                                                                    | The opening defaults/threshold paragraph and closing 30-day/hysteresis paragraph explain implementation policy rather than a choice the user needs to make. Their deletion does not change measurement or dismissal behavior. | A specific low-space/size notice, affected location, useful action, and truthful unknown/incomplete status. Keep technical policy in developer documentation.                                                          |
| D14 | The successful-startup version/build line and “Ad-free, always” copy in the footer of [App.tsx](src/renderer/src/App.tsx)                                                                                                                                                                                   | Version is available in About; branding is already present. Hide the empty footer once startup succeeds. Remove styles only if they have no remaining consumer.                                                               | The same footer currently also reports startup/loading failure. Preserve those branches until an equivalent notice exists, along with useful development/beta identity and About/license access.                       |

### Repeated repository prose

At the original review, [AGENTS.md](AGENTS.md) and [README.md](README.md) repeated dated checkpoint recaps and mixed present behavior with older instructions. RF18 replaced those active recaps with current contracts and links to retained dated records, while preserving the amended format/lint/typecheck policy.

The active entry documents now carry one current summary and point to the existing historical records. Standing user instructions, architecture constraints, compatibility obligations and unresolved acceptance/release status remain. This consolidation did not erase the dated records or retained history.

The original entry documents also linked to absent plans and decisions, including `project-storage-design.md`, `project-storage-updates.md`, `mvp-implementation-plan.md`, and `docs/decisions/save-and-local-recovery.md`. RF18 retired those links from current entry guidance and pointed to available source-backed records. Dated historical records remain available; an absent old link is not current authority.

### Things that are not deletion candidates yet

- **Old import versions.** `import-partition.ts` still contains the guarded `partitionLegacyResult` adapter. `import-plans.ts`, `import-review.ts`, the old prompt/digest validators, accepted transcripts, origins, and receipt readers have real compatibility responsibilities. An old filename or version number does not make them unused.
- **The storage retention subsystem.** Search-cache clearing, previous-version removal, completed-artifact cleanup, and working-copy removal are wired into the UI and IPC. Their presentation is excessive; deleting the owners or their outstanding receipts would change functionality and recovery.
- **The Codex stack as a blanket deletion.** New route selection no longer returns `local-codex-chatgpt`, but live service/storage code still includes old operation/session handling. Separate obsolete launch/account authoring from exact outcome readers before removal.
- **Commerce and release gates.** Configuration is presently closed, but free-project editing, existing access records, installer identities, and future configured commerce share this code. Closed configuration is not proof that the whole subsystem is dead.
- **Assets without TypeScript imports.** PDF.js fonts/CMaps/WASM, print fonts, citation styles/locales, bundled Paged.js, icons, and licenses are loaded through manifests, URLs, print adapters, or packaging. Keep them unless their actual consumers are removed. `@mantine/hooks` is a Mantine peer dependency; `pagedjs` supplies a pinned vendored asset. Neither should be removed just because the app lacks a normal import statement.
- **Historical tests and their dependencies/hooks.** The standing instruction says to leave this material alone. `tests/`, disabled workflows, test scripts/configuration, and `src/main/test-*` are not included in this deletion pass. Some test isolation files are still imported by startup code; removing them is not a standalone file deletion.
- **Any local user data.** Working databases, WAL files, original imports, saved conversations, retained responses, migration originals, backups, and recovery candidates are not repository clutter.

I did not establish a large collection of unused application components that can simply be erased. Most of the excessive UI is actively connected. Calling it “dead code” would disguise a feature change and make cleanup less safe.

## 2. Features to keep, with much simpler implementations and interactions

Effort labels below distinguish a straightforward presentation change from persistence/lifecycle work. A simple screen does not require a new storage format, and a high-risk storage rewrite should not be sold as an easy cleanup.

### S01 — Recovery: fix the specific problem where the user encounters it

**Priority: first. Effort: moderate UI work plus careful diagnostic/reconciliation work.**

The current route is demonstrably wrong:

1. [ProjectLibrary.tsx](src/renderer/src/features/library/ProjectLibrary.tsx), around lines 50 and 124, calculates attention from `data.resets.length + data.issues + list.issues.length`.
2. A nonempty reset batch therefore raises the same warning as an unreadable project or an interrupted operation. A recoverable archive is treated as a problem merely because it exists.
3. **Review recovery** navigates to `{ kind: 'settings', page: 'data' }` without identifying the issue or project.
4. [WorkspaceViews.tsx](src/renderer/src/features/workspace/WorkspaceViews.tsx), around line 399, presents working-location information, selected-file information, the storage inventory and maintenance panels, then recovery.
5. [RecoveryPanel](src/renderer/src/features/projects/LifecyclePanel.tsx) starts as a closed `<details>` element. The destination is not even the visible issue-specific review implied by the button.
6. [ProjectFiles.overview()](src/worker/projects/project-files.ts), around line 1026, increments a numeric `issues` count for multiple unrelated conditions: unacknowledged Save/Backup intents, unreadable operation folders, snapshot discovery failures, reset discovery failures, and result limits. Several catches lose the specific failure context.
7. [DataLocations](src/shared/project-lifecycle.ts) exposes `issues: number`; [ProjectList](src/shared/projects.ts) exposes only `{ projectId, code }` for failed projects. Neither is an adequate recovery explanation.

**Replacement:** a small recovery dialog opened directly from the warning. Each unresolved problem identifies the project, what could not finish, what is known about available copies, and one recommended action. Show the consequence beside the choice in one sentence. No file-path catalog or cleanup controls in this dialog.

Opening recovery should first reconcile the exact interrupted operation locally when that can safely settle it. This should not require an extra **Check**, **Prepare**, or **Confirm status** button. If it succeeds, clear the matching warning and show the outcome. If it cannot settle the issue, show the actual available choice in the same dialog.

Example target copy for an unresolved file save when local work is known to be available and saving an independent copy is safe:

> **The save for “My Book” could not be confirmed.**
> Your latest work is available on this computer. Save a new copy to a location you choose. The existing file will stay untouched.
> **Save a copy…** · **Later**

Keep the result in this dialog or return to the recovered project. Do not send the user through another settings page. If an unsettled writer prevents a safe new save, explain that specific blocker instead of bypassing the existing owner.

| Actual condition                                                                    | User explanation                                                                                            | Useful action and visible outcome                                                                                                                                      |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local work opens; an earlier file Save remains uncertain after local reconciliation | “Your latest work is here. The last file save could not be confirmed.”                                      | When safely available, **Save a copy…** writes to a newly selected file without silently replacing a different version. Otherwise show the specific remaining blocker. |
| Selected file cannot be reached                                                     | “The project file is unavailable. You can keep working from this computer's copy.”                          | **Locate file…** or **Save a copy…**. Offer only actions supported by the current local state.                                                                         |
| Local project cannot be opened; a recoverable version is available                  | “Collie could not open this project's local copy.” Show the available version's date and source when known. | **Recover a copy** opens an independent project and preserves the originals. Do not label it “latest” unless that is established.                                      |
| A retained reset batch exists, with no active failure                               | “Projects from an earlier reset are available.”                                                             | Put it in recovery history, not a persistent startup warning. **Restore projects** names the projects before restoring them.                                           |
| No usable copy has been established                                                 | “Collie could not read this project. Its files have been kept.”                                             | Offer the applicable **Open backup…** or **Copy diagnostic details**. Do not promise repair or claim the latest writing is safe.                                       |
| Local protection itself has failed                                                  | “Recent changes could not be saved on this computer.”                                                       | A clear retry when appropriate; otherwise keep visible writing available and explain how to preserve it. Do not present this as an ordinary completed recovery.        |

Implement structured, transient issue records through the existing lifecycle API: stable issue identity, project identity/title when known, operation kind, known cause or explicit unknown cause, available actions, and outcome. Keep low-level details locally available for support. Do not add a second authoritative recovery database.

Successful reconciliation clears the _matching issue_. **Later** preserves it; dismissal is not evidence of repair. Old completed/cancelled operations should not repeatedly demand user decisions, but classify them from their actual durable state rather than treating every failed attempt as harmless. An unfinished replacement remains actionable.

This establishes why the current experience is confusing. It does not establish whether Josh's particular warning represents an interrupted Save, a reset batch, an unreadable record, or another counted condition.

### S02 — Save and Open: use the familiar file interaction

**Priority: first. Effort: moderate; preserve the existing file writer.**

Keep one clear contract:

- **Save** writes the project to its chosen `.collie` file; first Save asks for a location.
- **Save As…** writes to another selected location and makes that the Save destination.
- **Make a backup…** writes a separate copy without changing the destination.
- Normal close retains local unsaved work for reopening, as already intended.

The current `SaveMenu`, `FilePanel`, `ProjectStorageSummary`, library row status, workspace status, and project-management page all explain overlapping parts of this contract. Use one small presentation function for user-facing Save status across these locations. Keep the actual local-draft state and selected-file state separate internally.

Suggested ordinary states: **Saving…**, **Saved to My Book.collie**, **Unsaved changes**, and **Couldn't save — Retry**. “Changes saved on this computer; project file has unsaved changes” belongs in a compact detail when needed. Do not claim the file is current based only on local protection, and do not describe cloud upload as complete.

At the original review, [ProjectFiles.open()](src/worker/projects/project-files.ts) reached `choice()` even for an ordinary new file with no local project conflict. The former `FilePanel` then offered another **Open project**, **Open independent copy**, and **Cancel** choice. For a normal native file selection, successful validation should open the project. The user already chose Open. A conflict should produce one focused comparison/choice dialog; deliberate duplication belongs in project actions.

Also clarify a potentially surprising existing behavior: ordinary Save to the assigned path can replace externally changed content after retaining its previous bytes. [ProjectFiles.save()](src/worker/projects/project-files.ts), around line 570, explicitly permits this. The report does **not** recommend changing that settled policy silently. If a future product decision changes it, offer a concise conflict choice bound to the exact file generation. Until then, the affected-state UI must make the overwrite consequence clear before the user acts.

Retain generation checks during writing, staging, previous-copy retention, atomic replacement, final verification, and acknowledgment. Removing these to reduce line count would undermine the reliability the simpler interaction needs.

### S03 — Storage settings: three useful facts, not a maintenance console

**Priority: first. Effort: easy presentation work; moderate command orchestration.**

Keep a compact **Storage** page showing project-file location, local space used, and free disk space. Show unknown measurements honestly. Offer **Show file**, **Clear search cache**, and recovery history when relevant.

Currently [StorageInventoryPanel.tsx](src/renderer/src/features/settings/StorageInventoryPanel.tsx) mounts `SearchCachePanel`, two `RetentionReviewPanel` instances, `WorkingCopyPanel`, and `StorageAdvicePanel` before much of the measured breakdown. The user is offered maintenance procedures before being told what is wrong.

Use these replacements:

| Current interaction                                                                                                   | Simpler interaction                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Review search cache → inspect exact SQLite files/sidecars → clear reviewed files → check outcome                      | **Clear search cache** → “Search data will rebuild when needed. Your projects are kept.” → one confirmation when useful → completion/error. The app performs eligibility and receipt handling internally.                                            |
| Review previous Saves, select a physical file, inspect snapshot/revision identity, remove one at a time               | A dated **Older saved versions** list with project title, size, and **Delete selected version**. Keep the newest/protected versions excluded and confirm actual permanent deletion once.                                                             |
| Review completed local artifacts and their leases/journals                                                            | Do not expose artifacts as a routine user concept. Offer **Clean temporary files** only if eligible redundant files exist. Keep the exact proof and ownership checks behind it.                                                                      |
| Switch projects, select an inactive workspace, review protection exclusions, confirm removal, inspect removal history | Put an explicit **Remove local copy** action on the eligible project, explaining that reopening requires its saved file. Ineligible projects should show a short specific reason. The current action needs backend work before its scope can expand. |
| Persistent reset and picker-history controls beside recovery                                                          | Remove these from routine recovery. Picker history can be cleared from an appropriate preference if needed. Reset is not a recovery remedy or a way to reclaim space.                                                                                |

Do not combine cache, history, working-copy, and recovery deletion into a “clean everything” button. Their data consequences differ. Nor should the same technical dashboard simply move into an **Advanced** accordion.

The current [working-copy proof](src/worker/projects/working-copy-proof.ts) intentionally refuses migration-bearing and import-bearing workspaces, AI/unsupported operation history, and newer local work. Those are real restrictions, not spurious UI warnings. A simpler screen must not imply that those copies can already be removed.

### S04 — Diagnose errors accurately and finish local recovery automatically where safe

**Priority: first. Effort: moderate, with careful lifecycle changes.**

[projectMessages](src/shared/projects.ts) translates broad codes into overly specific explanations. For example:

- `PROJECT_LOCKED` says another process owns the project, but [repository.ts](src/worker/projects/repository.ts) also raises it for this process's file work or snapshots.
- `DENIED` says local storage access was denied, but `fileContext()` raises it when the requested project is not the active owner. Other IPC authorization failures also use it.
- `UNAVAILABLE` can represent an IPC timeout, which does not establish that a write failed or rolled back.

Keep existing persisted codes compatible. Add action-specific transient context at the failing boundary and map it into plain language once. Use **“A save is still finishing”** when known, **“Collie could not confirm the save”** for uncertainty, and **“This project must be reopened”** when the owner is missing. Do not tell users to close another process when none has been established.

On reopening, settle operations that can be settled entirely from exact local receipts and protected results. Ask the user only when choosing between data versions, granting a new AI request, selecting a destination, or accepting a real loss. A local recovery action must never silently repeat inference or accept imported content.

The app already has this machinery in `ProjectFiles.reconcile`, AI handoff owners, and feature receipt reconciliation. Improve those paths; do not create an overarching second operation framework.

### S05 — Project discovery should not behave like opening every project

**Priority: early reliability work. Effort: structural; not an easy rewrite.**

[ProjectRepository.listUnlocked()](src/worker/projects/repository.ts), around line 1321, acquires every inactive project to construct the library. `acquire()` opens/migrates databases, marks interrupted jobs, validates proofreading/conversations/import evidence, writes discovery metadata, and initializes snapshot handling. `ProjectFiles.overview()` calls that list and also scans recovery and size information. Startup calls `refreshData()`.

This tightly couples “show my projects” to broad validation and recovery work. It is a source-level coupling and scaling risk; no startup timing was measured here.

Separate lightweight library discovery from opening/admitting an editable project. Reuse bounded discovery metadata as a _hint_ for titles and dates; never use it as authority to edit, save, or delete. Deep admission remains mandatory when opening a project and at the applicable archive/migration boundaries. Background discovery failures should identify the affected project without hiding all healthy projects.

Do not replace this with “trust the cached database” or skip validation. The change is when and why the work runs, with explicit invalidation, not whether content needs admission.

### S06 — Project actions: a small menu with literal names

**Priority: early. Effort: easy presentation work.**

Keep project details, backup, duplicate, archive, and restore. Replace the multi-section [ProjectManagement](src/renderer/src/features/projects/LifecyclePanel.tsx) panel with a project menu and short, task-specific dialogs.

**Move to new location** currently retains the old file. That does not match the ordinary expectation of “move.” Use **Change save location…** with “The existing file stays where it is,” or consolidate the interaction with Save As while preserving any differing filename rules. Do not implement actual file deletion just to make the label true.

The menu can offer **Project details**, **Save As…**, **Make a backup…**, **Duplicate**, and **Archive**. Restore belongs with opening a backup or a specific recovery version. Explain that Archive hides the project at the moment the user archives it, not on every ordinary screen.

### S07 — Export: options, Export, result

**Priority: high after storage. Effort: moderate presentation/controller rewrite.**

At the original review, the former `DocxExportPanel.tsx` was 839 lines and exposed three steps, captured-revision details, source-metadata review, recipes, custom ordering, batch options, and a separate DOCX replacement route.

For MVP: default to the active manuscript in outline order, choose a format, optionally choose sections/options, then **Export…**. Prepare the immutable compilation and validate citations internally. Show a focused problem only if that export actually needs a decision. The finished state has **Show file** and **Done**.

Keep DOCX/PDF/Markdown/text, citation fidelity, formatting-loss disclosure where meaningful, cancellation, and per-file results. Saved recipes and custom ordering can remain intentional secondary tasks. Existing paid/free capability rules remain intact.

Unify the DOCX-only replacement interaction with the ordinary export destination choice. At the original review, `startDocx` and `startCompilation` were both live; replacement behavior and outstanding-result handling needed to be carried forward before removing the earlier route.

### S08 — Citations: format the writing without asking users to manage revisions

**Priority: high. Effort: easy-to-moderate.**

[CitationsPanel.tsx](src/renderer/src/features/projects/CitationsPanel.tsx) exposes **Protect writing and refresh preview**, a local revision prefix, occurrence internals, and a metadata-review checkbox that must be revisited at export.

Replace this with citation style, bibliography preview, and the actual unresolved citations. Refresh after the relevant edits have been protected by existing owners. If refresh must be explicit, call it **Refresh preview** and perform the protection internally.

Remove the preview-only acknowledgment checkbox. It does not repair metadata or provide the final export decision. Where incomplete source information affects an export, ask once about that specific output. A missing or invalid source reference still needs repair; do not fabricate a citation to keep the screen clean.

Keep exact citation identities, source aliases, footnote bodies, and the shared compiler. These are core writing functionality.

### S09 — Research and source import: one source, one clear place to work

**Priority: medium. Effort: moderate.**

Keep sources, attachments, original inspection, excerpts, source usage, bibliography import/export, and provenance. [SourcesPanel.tsx](src/renderer/src/features/projects/SourcesPanel.tsx) currently combines metadata editing, three detail pages, bibliography import decisions, attachment management, raw provenance, trash/restore/merge, and bibliography export in 1,205 lines. [SourceInspector.tsx](src/renderer/src/features/projects/SourceInspector.tsx) adds 1,472 lines of document loading, extraction, versions, excerpts, and editing/recovery state.

Use a source list and a selected source with **Details**, **Read original**, and contextual actions. Opening an attached PDF should display the PDF and prepare its local text as needed; the user should not have to learn extraction-job phases. Selecting a passage offers **Save excerpt** with an optional note.

Use ordinary names: **Read original**, **Save excerpt**, **Attach file**, **Save copy**, **Merge sources**. Retain version distinctions when a user deliberately compares/replaces an original. Raw IDs, aliases, extraction metadata, and raw import JSON belong in support/provenance details only when relevant, not in the ordinary editing path.

There are two bibliography ingestion experiences: the current hybrid Import flow and the older per-source **Commit reviewed import** flow in `SourcesPanel`. Reuse the simpler summary/Accept interaction for ordinary bibliography intake. Preserve deliberate duplicate merging as a separate action and preserve the existing duplicate/rejected-source semantics. Do not erase source history or conflate “candidate match” with verified equivalence.

Split presentation from PDF/text loading and retained mutation ownership. Merely cutting the large file into several equally coupled components would not simplify its behavior.

### S10 — Notes, labels, questions, and evidence: start from the user's content

**Priority: medium. Effort: mostly presentation work.**

Keep these research features. [NotesPanel.tsx](src/renderer/src/features/projects/NotesPanel.tsx) is 1,121 lines; [EvidencePanel.tsx](src/renderer/src/features/projects/EvidencePanel.tsx) is 1,083. Both expose several independent editing tasks through one stateful surface.

Notes should begin with a list and a note editor. Use compact tag/category pickers rather than a full set of section/label checkboxes. Rename/merge labels belongs in the label's menu. Passage comments should open at the passage or through a clearly named comment list, with the original quote visible.

Questions and claims should expose their own related sources/evidence directly. From a selected claim, **Add evidence** already knows the target; the user should choose a source/excerpt and optionally describe support or challenge. The all-purpose evidence-link form currently asks for source, excerpt, target kind, target, assessment, and context. Keep the general form only for deliberately organizing links across different sections of the current project.

Preserve human judgments, rejected sources, original quotes, links, and revision history. Do not collapse tags/categories or remove evidence tables without an explicit migration/product decision.

### S11 — AI: retain the useful experience and remove operational administration

**Priority: high. Effort: moderate UI work; careful backend retirement work.**

Keep the user's own ChatGPT account, real model selection, conversations, web research, project context, saved references, import interpretation, and saved proofreading. The recent conversation composer and import flow already provide a better direction; do not replace them with a new AI setup wizard.

Three specific changes:

1. **Connect and manage an account.** The main [ChatGPT dialog](src/renderer/src/features/ai-connections/ChatGptConnectionDialog.tsx) should lead with account, model, connection status, and sign-in/out. At the original review, the former `ChatGptConnectionDetails.tsx` exposed registration, commercial activation, runtime, workspace identity, and architecture explanations. Keep build restrictions truthful, but express the applicable blocker in one sentence. Engineering eligibility records belong in development/support documentation.
2. **Recover the response in its feature.** At the original review, [AiWorkNotice.tsx](src/renderer/src/features/ai/AiWorkNotice.tsx) sent **Review saved result…** to a dialog titled **Dismiss saved result?**. That is another concrete button-expectation mismatch. **View response** should display the response; **Dismiss** should dismiss a retained notice with its consequence clear. Import recovery should open the existing import dialog. A missing local result should say whether retrying will only save retained output or send a new request.
3. **Hide local slot management.** The former `AiCapacity.tsx` explained active slots, bindings, original projects, and acknowledgments. These are internal resources. Let existing owners settle completed, protected work automatically. If a genuine block remains, offer **Open affected project** or **Finish saving response**, with the project named. Preserve the distinction between local slots and ChatGPT usage limits.

Do not delete protected output, silently resend uncertain requests, change models, use an API key, or add a hosted proxy to make the UX appear smoother. Keep Send/Submit as the explicit request action.

For the backend, [selectAiRoute()](src/main/ai/deployment.ts) now selects direct ChatGPT for the owner development identity; it never selects the old local Codex route. At the audit baseline, [AiService](src/main/ai/service.ts) spanned those routes, registered auth, catalog selection, dispatch, recovery, capacity, and account lifecycle in 1,893 lines. RF16 retires unreachable _new-work_ authoring while preserving exact legacy identities and decryption/read paths. Its current service is 1,184 lines, with direct dispatch and historical recovery separated by their types and entry points.

### S12 — Import: keep the simplified flow and reduce its controller coupling

**Priority: preserve now; structural work after storage. Effort: moderate-to-large internally.**

**RF12 deferred — October 11:** Josh intentionally skipped this stage to test the recently refactored Import feature further. Return to RF12 after the rest of the refactor, on an explicit request. RF13 changes only History/Search and their existing owners; it makes no additional Import changes. RF06 already removed the inert Re-Analyze placeholder described in the original observations below.

Keep files → categories/instructions/model → Submit → short summary → Accept/Cancel. Do not reintroduce per-message decisions, request budgets, payload displays, or manual preparation stages.

The remaining surface cleanup is small: remove the inert Re-Analyze placeholder, avoid routine saved-attempt/accounting copy unless it answers a real usage question, and show human-readable progress and specific partial-result limitations. Preserve the consequence of accepting partial findings and the ability to pause unfinished analysis. Do not call processed tasks successful imports or equate saved attempts with billed requests.

Internally, [ImportProvider.tsx](src/renderer/src/features/imports/ImportProvider.tsx) has 1,413 lines, [useImportFlow.ts](src/renderer/src/features/imports/useImportFlow.ts) 1,510, and [import-review.ts](src/worker/projects/import-review.ts) 2,220. Separate current selection/recovery coordination from dialog presentation, and distinguish current evidence construction from frozen historical admission in the worker. Keep one retained owner, not a second controller with copied state.

Retain deterministic local extraction, bounded mapping/semantic interpretation, original bytes and ancestry, deduplication, atomic Accept, and exact historical readers. The amount of compatibility code should shrink only when there is a supported path for the data it reads.

### S13 — History and Search: useful results before maintenance details

**Priority: medium. Effort: easy-to-moderate.**

For [HistoryPanel.tsx](src/renderer/src/features/outline/HistoryPanel.tsx), lead with dated versions and readable comparison. Show **Restore this version** with one explanation that current writing is preserved first. Block-order strings, top-level block counts, index-byte sizes, and detailed retention prose do not belong in normal comparison. History deletion is a separate deliberate maintenance action.

For [SearchPanel.tsx](src/renderer/src/features/projects/SearchPanel.tsx), keep query, optional filters, results, and **Open**. Update the local index through the existing search owner when necessary. **Refresh index**, **Rebuild index**, and **Cancel indexing** should not be three routine decisions. Surface a rebuild action for an actual index problem, while retaining cancellation for lengthy work and disclosing genuinely unsearchable originals. An incomplete index must not produce a misleading “nothing found” claim.

### S14 — Notifications, support, and visual consistency

**Priority: throughout, beginning with storage. Effort: mostly easy presentation work.**

[App.tsx](src/renderer/src/App.tsx) mounts `WorkspaceStatus`, `AiConnectionNotice`, `AiWorkNotice`, `ConversationNotice`, `ProofreadingNotice`, and orientation content. Several can describe the same underlying work. Keep the state owners, but choose one user-facing notice per problem and one direct action. Ordinary success should be quiet; recovery errors should remain visible until settled or deliberately deferred.

[PresentationBoundary.tsx](src/renderer/src/components/PresentationBoundary.tsx) tells users that a “state owner is still mounted” and describes draft ownership. Replace that with **“This panel couldn't open. Your visible text is still here.”** only when that is true, plus **Try again**. If restart is necessary, explain the effect and use the existing guarded lifecycle. Never overstate what was saved.

[AboutPanel.tsx](src/renderer/src/features/settings/AboutPanel.tsx) requires **Review support preview** followed by **Prepare content-free preview**. Opening the preview can prepare the bounded local summary immediately. Keep the user in control of copying/sharing; there is no reason for a second preparation ceremony.

Use the existing Mantine components, theme tokens, `AppDialog`, and accessible icon controls. They already provide useful consistency. Prefer a short introduction, compact form, one primary action, and Cancel. Large lists/documents scroll within a bounded body; primary actions stay reachable. Give destructive or unfamiliar actions readable labels rather than hiding meaning behind icons.

At the original review, both Tabler and Lucide were actively used. Consolidating onto the currently established Tabler controls would remove a dependency and visual variation, but requires replacing live icons first. It is not a delete-only task. Keep keyboard focus, composition handling, contrast, reduced motion, and accessible labels; simplicity includes these users.

### S15 — Split large owners by responsibility, without rebuilding the application

**Priority: only alongside the flows being improved. Effort: structural.**

The most consequential concentration is [useWorkspaceController.ts](src/renderer/src/features/workspace/useWorkspaceController.ts): 2,581 lines covering startup, navigation, manuscript protection, section metadata, files, recovery, outline/history, citations, access, setup completion, and AI integration. [ProjectRepository](src/worker/projects/repository.ts) is 1,739 lines and also spans many feature entry points.

Extract cohesive responsibilities with explicit inputs and results:

- File-session actions and Save status, retaining the exact pending Save identity.
- Library discovery and project-specific recovery presentation.
- Navigation/focus coordination, preserving editor and draft lifetimes.
- Manuscript protection, preserving in-memory edits, composition, undo, and acknowledged revisions.
- Feature presentation inside Sources, Notes, Evidence, Export, and Import.

Do not replace this with a universal workflow engine, generic plugin layer, or one giant new application store. Do not unmount every hidden panel to make the JSX shorter: [RetainedRegion](src/renderer/src/features/workspace/RetainedRegion.tsx) and [DraftRegistry](src/renderer/src/features/workspace/drafts.ts) currently protect real drafts and operations. Lazy mounting can be considered after state ownership is durable and explicit.

The shared IPC types/validators, narrow preload bridge, main-process authority, and single storage writer remain useful boundaries. Repeated validation at different trust boundaries is not automatically redundant. Remove duplicated presentation and orchestration first; consolidate validation only when the exact accepted shapes and version semantics remain unchanged.

### S16 — Keep onboarding and edition controls proportionate

**Priority: lower; avoid destabilizing the working creation flow. Effort: easy presentation changes, moderate recovery consolidation.**

Josh explicitly identified New Project as an interaction that already behaves reasonably. Preserve its current simple type/details → writing path. Improve only its error cases: an unavailable working folder or pending setup receipt should lead to a direct remedy and return to the existing setup, not a settings scavenger hunt or duplicate creation.

The [access panel](src/renderer/src/features/projects/AccessPanel.tsx) and [purchase panel](src/renderer/src/features/projects/DirectAccessPanel.tsx) contain detailed signed-document and provisioning language. Present current editing access and the applicable action. Keep free switching, read/export/backup/recovery access, purchase restore, and offline behavior. If commerce is unavailable in this build, one accurate sentence is enough.

The separate [entitlement service](services/entitlements/README.md), signed grants, update feed checks, and blocked store configurations should not be rewritten during storage UX work. Commercial configuration is unresolved; removing guards would not make a simpler or shippable MVP.

## 3. Refactor order, protection boundaries, and completion criteria

### Recommended order

Do this in a few cohesive changes that each improve a real interaction. A repository-wide rename or rewrite should not precede the recovery fix.

| Order | Work                                                                                                                                        | User-visible completion criterion                                                                                                                                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | **Storage trust:** S01–S04, plus the relevant dead copy/CSS removals                                                                        | A warning names the affected project and problem. Its button opens the relevant recovery action directly. The user can predict the consequence before clicking. Healthy retained history is not a recurring alarm.                                              |
| 2     | **File and library reliability:** S05–S06; continue S02 where backend work is needed                                                        | Normal Open opens; normal Save saves; reopening restores the correct local work. File conflicts, missing files, and uncertain saves have short, specific choices that preserve alternatives. Healthy projects remain usable when another entry fails discovery. |
| 3     | **Remove empty promises and shorten everyday tasks:** D01–D10/D14, S07–S08, targeted S14                                                    | There is no working-looking review form that cannot submit. Export completes from one options surface. Citation preview updates without an explicit “protect” ceremony.                                                                                         |
| 4     | **Keep research and AI useful:** S09–S13                                                                                                    | Source, note, evidence, chat, and import actions stay within their task. A response-recovery button opens or saves that response; it does not open an unrelated administration screen.                                                                          |
| 5     | **Finish the code cleanup:** S15–S16, icon consolidation, current documentation consolidation, carefully scoped legacy authoring retirement | Owners and names match responsibilities; removed UI has no abandoned state/styles. Current instructions describe the current app. Existing project files and saved history remain readable.                                                                     |

Apply local responsibility extraction during the relevant change; do not defer all cleanup or use order 5 to justify another framework. Dormant Grok removal can be an independent small change. The order above prioritizes user trust over the easiest line-count reduction.

### What the refactor must preserve

| Boundary          | Preserve                                                                                                                | Simplify                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Project ownership | One portable `.collie` artifact for saved project content; separately owned local working/recovery data                 | User-facing terminology and how status is presented               |
| Save correctness  | Exact pending operation, staged output, previous bytes, content-change checks, atomic publication, final acknowledgment | Number of exposed phases and places that repeat Save explanations |
| Local writing     | Automatic local protection, dirty buffers, IME composition, selection/undo, guarded close/restart                       | Routine protection controls and recovery detours                  |
| Compatibility     | Current SQL/minimum reader 37; existing archive/editor versions; exact frozen validators/digests and migrations         | Placement of legacy readers and unreachable new-work authoring    |
| Import            | Originals, valid selected findings, source ancestry, deduplication, explicit request authority, atomic Accept           | Controller coupling and technical status text                     |
| AI                | Own-account connection, exact chosen model, bounded explicit requests, protected results and historical outcomes        | Account engineering details and local slot administration         |
| Research          | Source versions, original quotes, citations, rejected/merged-source intent, human decisions                             | Routine metadata/provenance/maintenance overload                  |
| Security          | Sandboxed renderer, narrow preload, trusted IPC sender checks, path/asset confinement, credential isolation             | Boilerplate where a proven shared helper suffices                 |
| Distribution      | App identities, signing/update protections, content-free support, unresolved provider/commerce/store gates              | Repeated explanations in ordinary UI                              |

Do **not** turn this into a new “one live database on a cloud drive” design, a new file extension, blanket automatic deletion, or a requirement to manually Save before every normal close. None is needed to resolve the reported confusion. Preserve the current local/portable separation first; any later storage-format change needs its own concrete benefit and migration design.

### Repository coverage and disposition

This is the architectural coverage map for the review. It also records where wholesale removal is not supported by the inspected evidence.

| Area                          | Source reviewed / integration traced                                                                                                    | Disposition                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| App shell and navigation      | `App.tsx`, `app/navigation.ts`, `WorkspaceViews`, `WorkspaceStatus`, session/context/retained-region owners                             | Simplify notices/routes; remove forwarding shim and dead styles; retain draft lifetimes          |
| Writing and outline           | `editor/`, `features/outline/`, `WritingWorkspace`, writing preferences/positions, domain editor schema                                 | Keep editing and structure behavior; remove inert review UI; make history clearer                |
| Project setup/library/details | `onboarding/`, `library/`, `project-details/`, templates and setup recovery paths                                                       | Keep ordinary creation; fix recovery routing; delete unused template name map                    |
| Storage/file lifecycle        | `main/paths/`, `main/lifecycle.ts`, project-file IPC, worker repository/files/archive/snapshot/migrations/retention modules             | First priority; better diagnosis and interaction, no blanket deletion                            |
| Storage UI                    | All settings storage/notice/cache/retention/working-copy panels, `FilePanel`, `LifecyclePanel`                                          | Replace administrative surfaces with task-specific actions                                       |
| Research                      | Sources, Notes, Evidence, SourceInspector, ResearchData/layout/usage, worker sources/notes/evidence/inspection                          | Keep features/data; smaller retained owners and direct actions                                   |
| Citations and exports         | ReferenceTools, CitationsPanel, ExportPanel, interchange, domain compilation, worker citation/export modules, main PDF adapter          | Keep compilation/provenance; consolidate live export paths and simplify preview                  |
| Search/history                | Renderer panels, worker search/cache/manuscript/outline, shared contracts                                                               | Keep indexing and recovery; remove routine maintenance ceremony                                  |
| AI connection/execution       | `main/ai/`, connection UI/state, work/capacity notice, shared AI contracts                                                              | Delete unused Grok transport; isolate current route from legacy recovery before further removal  |
| Conversations/proofreading    | Renderer feature owners, main services/drafts, worker transcript/context/memory/reference/proofreading modules                          | Keep useful AI and retained outcomes; simplify recovery and split large owners                   |
| Import                        | Renderer intake/flow/results/progress/origin readers, main coordinator, worker local readers/mapping/semantic/review/commit/admission   | Preserve current simple UX and exact compatibility; refactor internal responsibility boundaries  |
| Desktop bridge/security       | Main startup/profile/windows/protocol/menus/support/update paths, preload APIs, storage-worker/worker dispatch, shared validators       | Preserve process and authority boundaries; no broad validation removal                           |
| Commerce                      | Desktop entitlement service/grants/vault, renderer access panels, separate service routes/store/provider/reconciliation/configuration   | Keep rules and data boundaries; shorten presentation; no service deployment or purchase activity |
| Packaging/resources           | Package scripts/dependencies, builder/Vite/TypeScript/lint/format config, manifest and asset consumers, icons/fonts/PDF assets/licenses | Keep runtime and license assets; icon-library migration is conditional on replacing consumers    |
| Documentation/history/tooling | Root plans/instructions/README, docs inventory and current contracts/records, disabled workflow/test setup                              | Consolidate current guidance; preserve historical tests and compatibility evidence               |

No new dependency, external research, service deployment, or code-analysis harness is necessary to begin these changes.

### What “done” means for each implementation change

For future code changes, run the required **format → lint → typecheck** sequence, repair all reported errors/warnings, and retain the standing prohibition on assistant-run tests, builds, launches, and runtime verification. Source inspection and code checks do not establish native reliability or visual acceptance.

Each implementation handoff should give Josh a short manual guide tied to the changed behavior. Use disposable projects/copies for data-risk cases. The most important eventual observations are:

1. **A normal launch and reopen:** the intended project and retained writing are available; historical copies alone do not generate an alarm.
2. **An actual recovery notice:** the affected project, known problem, recommended action, and consequence are clear in the opened surface. If the cause is unknown, the app says so.
3. **A recovery action:** it visibly resolves the matching condition or explains the remaining blocker. It does not loop back to generic settings, delete alternatives, duplicate content, or start AI work.
4. **Save, Save As, backup, and ordinary Open:** each does what its label implies; the chosen file and local unsaved work remain distinguishable.
5. **A naturally encountered unavailable/different file:** the app offers the applicable choices without implying that another copy is necessarily current or safe to replace.
6. **Draft preservation:** moving among writing, research, settings, and recovery preserves text, selection, composition, and pending feature work as applicable.
7. **Existing projects with imports and AI history:** reopening and copying preserves original content, references, conversations, and retained outcomes. Recovery sends no new request.
8. **The simplified screens:** normal tasks have a clear primary action, reachable Cancel/Done, keyboard access, and understandable layout at narrow sizes and increased zoom.

These are acceptance criteria for the staged refactor. RF01–RF11 and RF13–RF18 implementation is recorded in the stage records; runtime/manual acceptance remains pending. RF12 is intentionally deferred.

## For Josh's Reference

These stages expand the five work groups above into an implementation sequence. **RF01–RF18 are stage identifiers; D and S references point to findings earlier in this report.** The model and effort recommendations are for the coding assistant implementing each stage, not for Collie's in-app AI.

Each stage includes the relevant removal of replaced code, styles, and copy, plus any necessary extraction of responsibilities from large controllers. Finish the required code checks and user manual handoff before moving to the next requested stage; documentation-only work does not require code checks. RF01–RF11 and RF13–RF18 are implementation complete — awaiting user testing. RF12 is intentionally deferred pending further Import testing and an explicit request. Keep the original stage numbers.

| Stage                                                                                                                                                                                                                                                                                                                                                                              | Model       | Effort     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------- |
| **RF01 — Direct, understandable recovery.** Add specific issue information and accurate error explanations; replace the settings detour with a focused recovery dialog and safe local reconciliation. Preserve alternatives and clear only resolved warnings. **S01, S04; recovery-related S14–S15.**                                                                              | GPT-6 Astra | Extra-High |
| **RF02 — Predictable Save and Open.** Unify Save status, make ordinary Open open the selected project, and give file conflicts or uncertain saves clear choices. Preserve exact operation identities, retained copies, and the existing Save policy. **S02; file-related S04 and S15.**                                                                                            | GPT-6 Astra | Extra-High |
| **RF03 — Simple storage settings and maintenance.** Replace the maintenance dashboard with useful location/space information and focused cache, older-version, temporary-file, and eligible local-copy actions. Keep existing deletion restrictions and receipts. Remove redundant or incorrect storage prose. **S03, D11–D13.**                                                   | GPT-6.1 Sol | High       |
| **RF04 — Lightweight project discovery.** Separate listing projects from opening, migrating, and fully admitting them. Keep full validation at the boundaries that need it, and identify individual failures without blocking healthy entries. **S05; library-related S15.**                                                                                                       | GPT-6 Astra | Extra-High |
| **RF05 — Clear project actions.** Consolidate project details, Save As, backup, duplicate, archive, and restore into direct actions with literal names and short dialogs. Reuse RF02's file behavior. **S06.**                                                                                                                                                                     | GPT-6.1 Sol | High       |
| **RF06 — Remove unused code and nonfunctional UI.** Delete the confirmed unused helpers, forwarding shim, styles, compact variant, dormant Grok implementation, inert review dialog, and Re-Analyze placeholder. Remove redundant successful-startup footer copy while preserving startup errors. **D01–D10, D14.**                                                                | GPT-6.1 Sol | Medium     |
| **RF07 — One straightforward export flow.** Replace the multi-step export surface with options → Export → result; consolidate the live DOCX replacement path without losing formats, recipes, cancellation, or outstanding-result handling. **S07.**                                                                                                                               | GPT-6.1 Sol | Extra-High |
| **RF08 — Simple citation previews.** Refresh through existing writing-protection owners, remove revision-management wording and the redundant preview acknowledgment, and keep actionable citation problems and output-specific decisions. **S08.**                                                                                                                                | GPT-6.1 Sol | High       |
| **RF09 — Focused sources and original reading.** Simplify source details, attachment reading, excerpt capture, and bibliography intake. Separate presentation from retained loading/mutation owners while preserving provenance, duplicate decisions, and source history. **S09.**                                                                                                 | GPT-6.1 Sol | Extra-High |
| **RF10 — Focused notes and evidence.** Simplify note editing and label controls; make adding evidence start from the selected claim/question. Preserve original quotes, human judgments, relationships, and revisions. **S10.**                                                                                                                                                    | GPT-6.1 Sol | High       |
| **RF11 — AI connection and response recovery.** Shorten account controls, make response actions open the corresponding result, and settle eligible protected local work through existing owners. Remove routine slot administration without resending requests or discarding outcomes. **S11's user-facing flow and local recovery; AI-related S14.**                              | GPT-6 Astra | Extra-High |
| **RF12 — Simpler import internals.** Separate selection/recovery coordination from presentation and current evidence construction from historical admission. Preserve the existing simple import flow, one retained owner, original evidence, explicit AI authority, and atomic Accept. **S12; import-related S15.**                                                               | GPT-6 Astra | Extra-High |
| **RF13 — Useful history and search.** Present readable dated versions and direct restoration; handle ordinary search indexing internally and surface maintenance only for an actual problem. Keep cancellation and honest incomplete-result messages. **S13.**                                                                                                                     | GPT-6.1 Sol | High       |
| **RF14 — Consistent notices, support, and visual controls.** Finish notice deduplication, simplify panel-error/support flows, and consolidate icons after replacing live consumers. Keep keyboard/focus behavior, accessible labels, reduced motion, and bounded layouts. **Remaining S14.**                                                                                       | GPT-6.1 Sol | High       |
| **RF15 — Proportionate setup and access controls.** Preserve normal New Project, give setup failures direct recovery actions, and simplify edition/purchase wording. Keep setup receipts, offline/free access, signed grants, and unresolved commerce gates intact. **S16.**                                                                                                       | GPT-6.1 Sol | High       |
| **RF16 — Retire unreachable AI authoring safely.** Separate current direct ChatGPT execution from legacy recovery readers, then remove only new-work paths proven unreachable. Preserve stored operation identities, protected results, account isolation, and historical read/decryption paths. **S11's backend cleanup.**                                                        | GPT-6 Astra | Extra-High |
| **RF17 — Finish remaining controller and repository separation.** Complete only the cohesive extractions still needed after the feature stages, particularly navigation/focus and manuscript protection. Preserve retained drafts, composition, undo, pending operations, and process authority. **Remaining S15.**                                                                | GPT-6 Astra | Extra-High |
| **RF18 — Consolidate current documentation.** Shorten active AGENTS/README guidance, remove duplicated checkpoint recaps, repair stale links, and update the current architecture/acceptance summary. Preserve standing instructions, compatibility records, historical tests, and unresolved release gates. **Section 1's repeated repository prose; Section 3's final cleanup.** | GPT-6.1 Sol | Medium     |

**Selection rationale:** Sol is the default here for bounded implementation and UI work; Astra is reserved for changes with intertwined persistence, recovery, or compatibility obligations. This applies [OpenAI's model-selection guidance](https://developers.openai.com/api/docs/guides/model-selection) to the inspected code; the individual assignments are engineering recommendations, not measured comparisons on this repository. **Ultra is not a default recommendation for any stage**—the stages are deliberately bounded, and Extra-High is my starting recommendation for the hardest work.
