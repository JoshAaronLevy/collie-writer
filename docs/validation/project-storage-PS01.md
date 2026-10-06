# PS01 implementation record — Storage locations and project identity

October 5, 2026. **Implementation complete — awaiting user testing.** Runtime acceptance has not been observed.

## Delivered changes

- Settings → Data and recovery explains the shared local working folder separately from the current project's selected `.collie` file. The working-folder disclosure includes its existing main-owned reveal action. A new, stateless `ProjectStorageSummary` shows the current project title, selected path, never-saved state and file status, with Show project file and guarded navigation to Project file actions. Without an open project it explains how to choose one. File status from a different scope is withheld while the matching status is pending; the renderer never constructs a workspace path or uses a catalog row as proof of file availability.
- `project-file-presentation.ts` supplies the same presentation to that summary, `FilePanel` and the non-writing workspace file summary. It distinguishes live typing awaiting local protection, protected local changes awaiting Save, an active Save's captured project, confirmed saved content, and existing checking/unavailable/external/interrupted states. Library rows no longer describe current unprotected typing as protected or saved. No new polling, status reconciliation, draft owner or Save operation was introduced.
- Project-file actions, library, tutorial and About text explain that `.collie` opens the whole saved project, including research, citations, managed original files and saved conversations. Account credentials and unsent forms are excluded. First Save, later explicit Save, normal close/local recovery and separate cloud uploads retain their established meanings.
- The stale claim that no disposable content cache exists was removed. Search indexes are rebuildable, but cache clearing is not delivered in PS01. Clear picker history continues to forget only a folder hint. Archive changes visibility, and Reset retains recovery; neither is advertised as freeing storage space.
- The direct production association is now platform-specific: macOS uses `icon.icns`, Windows uses `icon.ico`, both relative to the existing `build/` resources directory. The `.collie` type name and macOS Editor/Owner values are preserved. Global associations are empty to avoid duplicating the platform entries; beta entries are empty and the development configuration remains unchanged. The installed builder's `FileAssociation` declaration, resource resolver, macOS document-type writer and NSIS association writer were inspected to establish those configuration semantics. No packaging or config-execution probe was run.

## Scope and persistence

Changed renderer owners: `WorkspaceViews`, `WorkspaceStatus`, the new `ProjectStorageSummary` and its scoped CSS Module, `FilePanel`, the new presentation helper, `LifecyclePanel`, `ProjectLibrary`, `TutorialPanel`, and `AboutPanel`. Native configuration: `electron-builder.direct.cjs`. Existing app artwork and master are unchanged. Styles are owned by the summary, with semantic class names and existing theme tokens/Mantine controls.

React best-practices source review focused on deriving presentation without effects or redundant state, stable retained owners, direct imports, scoped semantic markup, and event-owned guarded actions. No editor, PDF host, persistent workspace controller or draft owner was moved/remounted. The new summary has no filesystem authority; its actions use existing validated main/preload APIs and the retained session's navigation guard.

There is no project schema, archive, account, Save, cleanup or location migration. SQL/minimum reader **13**, AST/archive **1**, compilation **3**, existing setup/preferences, file journals and recovery readers are unchanged. Production shell-open handling is unchanged. No cache/deletion action, inventory service, storage threshold, compression or new import functionality was added. The previously untracked storage/design/import documents were preserved.

## Checks and pending observations

The repository scripts and ignore scopes were inspected before formatting. Format and lint already exclude bundled upstream files, generated/local output and historical testing infrastructure; no exclusions or rules were weakened. The scripts do not chain tests, builds or launches.

| Command             | Actual outcome                                           |
| ------------------- | -------------------------------------------------------- |
| `npm run format`    | Exit 0; no warnings/errors.                              |
| `npm run lint`      | Exit 0; no warnings/errors.                              |
| `npm run typecheck` | Exit 0; node and web targets passed without diagnostics. |

These ran in the required order on the final production code. Final documentation-only checkpoint updates were formatted afterward; production code remained unchanged.

No automated tests or test infrastructure were added or run. No builds, app/browser launches, screenshots, probes, account actions, inference or runtime verification were performed. Source inspection is not runtime evidence.

The [manual guide](../manual-testing/project-storage-PS01.md) owns user observations. All UI, focus/layout/accessibility, native picker/reveal, close/reopen and production document-icon/double-click observations remain pending. An appropriate installed production artifact is needed for association acceptance; development cannot establish it. This configuration is not proof of signing, registration, provider approval, commercial readiness or release readiness. Release remains **NO-GO**. PS02–PS08 require separate requests; AI-powered import remains a separate plan.
