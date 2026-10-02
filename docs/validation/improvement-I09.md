# I09 implementation record

October 2, 2026. **Implementation complete — awaiting user testing.** This record describes source/document changes, not executed validation. The working tree was clean at the start of this stage. I01–I08 acceptance remains unreported. Josh’s I07 sidebar note, I08 source-usage note and stage model/effort recommendations are preserved.

## Delivered paths

| Area | Changed production/documentation owners |
| --- | --- |
| Export flow, bounded preflight validity and results | `features/projects/DocxExportPanel.tsx`; new `features/export/ExportResults.tsx`, `ExportWorkspace.module.css`, `CitationsPanel.module.css`; old `ExportMetadata.module.css` removed |
| Reference style/retry and import/access presentation | `features/projects/CitationsPanel.tsx`, `InterchangeImportPanel.tsx` and stylesheet, `AccessPanel.tsx`, `DirectAccessPanel.tsx`; `features/settings/CollieAccess.module.css` |
| Save and global scoped operation results | `features/workspace/SaveMenu.tsx` and stylesheet, `WorkspaceStatus.tsx`, `WritingWorkspace.tsx`, `app/navigation.ts` |
| Destination composition and help/settings | `App.tsx`, `WorkspaceViews.tsx` and stylesheet, `WorkspaceNavigation.tsx`, `SettingsPanel.tsx` and stylesheet; new `AboutPanel.tsx`, `ConnectionSettings.tsx`, `UpdateSettings.tsx`, `NativeHelpActions.tsx` |
| Trusted native Help actions | `src/shared/commands.ts`, `src/preload/index.ts`, `src/main/ipc.ts`, `index.ts`, `menus.ts` |
| Optional orientation and nonfiction teaching sample | `features/help/Orientation.tsx`, `WritingGuide.module.css`, `features/projects/TutorialPanel.tsx`, `src/main/tutorial.ts`, `resources/tutorial/reading-study.txt`; old tutorial resource retained |
| Semantic ownership cleanup | `features/projects/Projects.css`; feature rules moved to their actual owners |
| Contracts/handoff | [decision](../decisions/improvement-09-local-journey.md), [navigation map](../design/local-navigation.md), [manual guide](../manual-testing/improvement-I09.md), privacy/accessibility addenda, direct-update runbook, improvement plan and AGENTS checkpoint |

Renderer paths in the table are relative to `src/renderer/src/` unless fully qualified. No tests or test-only resources were added or edited. No dependency install, command-line validation, formatter, app/server/browser launch, screenshot, native picker, network action, account action or publication was performed.

## Contracts and compatibility

- Export capture validity covers head, selected order, formats and visible output options; changing these requires a fresh preflight/acknowledgment. Destination grants, worker frozen compilation, per-file retention/loss reports and exact recipe retries remain existing production contracts.
- Results/polling remain session-owned; global links carry only typed project/workspace/job IDs. No new persistent export-history format was introduced.
- `app.helpAction` is exact, allowlisted, trusted-frame IPC for existing native license/update functions. It accepts no URL/path/feed. Update restart continues through the existing close/flush service.
- Orientation adds only `collie.orientation.v1` to the device-local profile. Portable SQL/minimum reader **10**, AST/archive **1**, compilation **3** remain; no migration occurred.
- Fresh tutorial material is synthetic production help, not evidence about real participants. Existing sample identities, resources, edits and chosen files remain retained; only a fresh reset rotates the trusted sample allowance.
- Save, Backup, Move, Duplicate, Restore, archive/reset recovery, free/paid rights, CSP, visible citeproc attribution and license delivery retain their prior contracts. AI remains unavailable. No merchant, issuer, signing or feed prerequisite was invented.

## User observations and pending gates

**No user-reported I09 results.** Local journey comprehension, calm appearance, export/picker cancellation, selection/IME/focus, keyboard/screen reader, narrow/zoom/theme, sample reset, offline return, native file operations, paid batch/recipes, packaged CSP/resources, update restart and output fidelity remain unobserved. See the ordered [manual guide](../manual-testing/improvement-I09.md).

Prior migration, recovery, large-document, PDF/footnote/font/script, security/native signing, commerce/value, store and release gates remain unresolved. The local I02–I09 implementation milestone is delivered, not user-accepted or release-ready. Release remains **NO-GO**. Stop for Josh’s results; I10 is unrequested and independently provider-gated.
