# RF05 — Clear project actions

October 11, 2026. **Implementation complete — awaiting user testing.** RF05 implements S06 after reviewing the full refactor report and its protection/cleanup requirements. RF01–RF04 acceptance is not inferred, and RF06–RF18 require separate requests.

## Implemented behavior

- One shared ProjectActionsMenu serves the Save area and library rows. Details, Save As, backup, duplicate and Archive are direct actions. The current project also offers contextual file reveal, Locate and saved-version inspection, Open backup and document import. Library rows retain Open and RF03's guarded local-copy removal. Actions on an inactive row first use the existing guarded project-opening path and check the exact selected scope before proceeding.
- Project details uses a short viewport-bounded dialog with a scrolling body and reachable footer. The existing single retained form/draft owner stays mounted outside hidden destination regions; no second form, metadata state or save coordinator is introduced. Save closes only after a confirmed result. Cancel explicitly discards unsubmitted edits; an uncertain exact request remains frozen and blocks dismissal. Field validation, stale-result reload, other-draft protection and composition guards remain. Confirmed metadata updates preserve editor payload, selection and undo history, refresh the library, and keep the filename unchanged.
- Archive explains its effect only in its action dialog. Confirmation captures the project scope and absolute archived value, so retry cannot invert an already-applied change. The existing backend archive mutation remains; renderer metadata refresh preserves the editor instead of selecting the project again. Archive keeps files, and Unarchive returns the project to All active.
- Save As is the sole product action for changing the save location. Its native picker explains that choosing another location keeps the current file. First Save, assigned-file Save, generation-bound Save As consent, previous-byte retention and publication acknowledgment remain RF02's owners. Backup keeps its existing fresh-filename requirement and does not change the destination. Save As keeps its existing ability to replace an unrelated target only with native confirmation; the former Move-only fresh-filename action is retired rather than relabeled as Save As.
- Duplicate and Open backup reuse existing copy/rekey and native picker/version-choice flows. Completion copy identifies the separate project and its first-Save location choice. The remaining document-import page is labeled Document import/Import, preserving its live draft owner and ImportButton. Existing retained-version recovery remains in Storage.

## Removed code

The ProjectManagement section/grid and exclusive stylesheet, ProjectFileActions panel and stylesheet, redundant Save-menu/library action definitions, duplicate workspace file-actions link, unused renderer rename branch/ref and Move UI branch are removed. New Move authoring is also removed from renderer API, preload/IPC, picker grants and main-to-worker dispatch/save authoring. Historical Move job/result readers and interrupted Save-intent recovery remain concrete compatibility obligations. A small shared ProjectDialogs stylesheet serves the actual file-choice and archive-dialog consumers. Tutorial/current documentation now describe the working menu.

## Preserved boundaries

SQL/minimum reader remains **37**. Portable project/import/conversation formats, frozen evidence/digests, exact immutable originals, atomic import acceptance, pending receipts/handoffs, migration/admission, Save/archive/copy/rekey and restrictive deletion proofs are unchanged. No user data or working/recovery directories were inspected or changed. Current file/editor/draft/account/lifecycle owners remain authoritative; opening a dialog or project grants no AI request or import acceptance. Backend historical rename handling remains unchanged.

## Source size

RF05 removes **146 net authored-source lines** relative to completed RF04. Cumulative RF01–RF05 is **+113** from pre-RF01 `2b4307a`: RF01 +968, RF02 −38, RF03 −693, RF04 +22, RF05 −146. Tracked source contributes −994 and new untracked source contributes 1,107. Counts include TS/TSX/CSS additions and deletions under authored `src`, excluding docs/Markdown, vendor/generated files and historical tests.

The stage removes overlapping panels and authoring branches while introducing one shared menu and reusing the retained details and RF02 file-operation owners. No dependency or workflow framework was added. The overall cumulative reduction goal remains pending.

## Required checks and pending acceptance

Format/lint/typecheck scripts and ignore scope were inspected; vendor/generated artifacts and historical testing code are preserved. With pinned Node 24.21.0/npm 11.19.0, `npm run format`, `npm run lint` and `npm run typecheck` passed cleanly, including node and web typechecks and no lint warnings. The previously applied React checklist informed retained state, scoped actions, accessible labels, modal focus and composition handling; Mantine remains the established UI owner.

No automated tests, test code, harnesses, audits, builds, app/dev-server launches, browser automation, screenshots, provider calls, benchmarks or runtime verification were performed. Native behavior, old pending-operation recovery, copy/import portability and visual/keyboard acceptance remain user-owned through the [manual guide](../manual-testing/refactor-RF05.md). Release gates remain unresolved.
