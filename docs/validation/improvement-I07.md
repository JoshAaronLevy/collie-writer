# Improvement I07 — Focused writing workspace

October 2, 2026. **Implementation complete — awaiting user testing.** The improvement plan, I03/I04/I06 contracts, rich-editor and outline/reference sources, D3 and Stage 9/15 decisions informed this implementation. No user acceptance result has been supplied.

| Paths (renderer paths relative to `src/renderer/src/`) | Delivered change |
| --- | --- |
| `features/workspace/WritingWorkspace.tsx`, `WritingWorkspace.module.css`, `PaneResizeHandle.tsx`, `useWritingPreferences.ts` | Project-switching sidebar, nested outline beside manuscript, resizable optional companion, narrow alternate views, focus mode, local layout preference, on-demand section details and compact save state |
| `features/workspace/WritingSidePanel.tsx` | Read-only saved note/source/excerpt companions, exact Research links and honest unavailable AI state |
| `features/workspace/WorkspaceViews.tsx`, `WorkspaceNavigation.tsx`, `WorkspaceStatus.tsx`, `App.tsx`, `App.module.css` | Retained Write/History presentation outside legacy styles, direct writing navigation, wider writing shell, preserved global errors/jobs/attribution |
| `editor/RichDraft.tsx`, `RichDraft.css`, `ReferenceTools.tsx`, `ReferenceTools.css`, `selection.ts`, `useEditorFormDraft.ts` | Compact menus, contextual tools, retained find/reference regions, labeled link/image/citation dialogs, captured-selection guards and explicit form ownership |
| `features/workspace/useWorkspaceController.ts` | Persistent layout owner, prompt-free managed-image insertion with async selection checks, exact annotation capture after protection; existing cadence/close/storage authority retained |
| `features/outline/OutlinePanel.tsx`, `OutlinePanel.css`, `HistoryPanel.tsx`, `HistoryPanel.css` | Semantic scoped Mantine outline/history presentation, chapter/part jumps, nested collapse, non-drag actions, explicit retained structural forms and reachable existing history operations |
| `components/ui/ActionMenu.tsx`, `AppDialog.tsx`, `features/projects/Projects.css` | Menu selection-capture hook, dialog exit/focus hooks, relocation of editor/outline-owned styles |
| [Decision](../decisions/improvement-07-writing-workspace.md), [manual guide](../manual-testing/improvement-I07.md), plan, AGENTS, privacy/accessibility/manual index | Ownership, limits, current stage status and user handoff |

No main/worker/IPC command, package dependency, export format or persistent content schema changed. SQL/minimum reader **10**, AST/archive **1**, compilation **3** remain. The only new persisted data is bounded device-local layout preference `collie.writing-view.v1`. Pane/editor visibility does not duplicate drafts or data stores. Sources/notes retain their existing editing owners and manual provenance.

**No test code, fixtures, mocks, harnesses, verification scripts or testing-only UI was added or maintained. No tests, typecheck, lint, audit, formatting checks, builds, packaging, app/server/browser launches, screenshots, benchmarks, CI checks or delegated equivalents were run.** Work consisted of source/documentation and Git reads/edits. Source reasoning is not a passed check.

Pending user observations: visual calm/readability; project/chapter/section jumps and draft guards; pane widths, focus restoration and narrow/200% layout; editor selection, undo and IME; link/citation/image dialog cancel/apply; managed image/native picker behavior; rich paste/plain-paste restrictions, tables and footnote bodies; annotation targeting; structural operations/checkpoints/restore; local versus selected-file status, close/retry/conflict visibility; screen readers, themes, contrast, reduced motion and packaged CSP. Native output, large documents, migration, platform/store/commerce/signing and provider funding/permission gates remain independently unresolved. Release remains **NO-GO**.

Known presentation limits: companions show saved plain note text and up to 20 retained excerpts; editing and complete source inspection use Research. Find remains section-local and case-sensitive, with the existing text-node matching behavior. Undo is editor-session history, distinct from persisted checkpoints; switching real sections may replace the editor after protection. AI remains unavailable. These are not new content/export capabilities.

Record platform, action and actual result here only when Josh supplies it. Stop after the [I07 guide](../manual-testing/improvement-I07.md); I08 is not authorized by this implementation.
