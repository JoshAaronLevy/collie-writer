# Improvement I03 — Session/navigation implementation record

October 1, 2026. **Implementation complete — awaiting user testing.** No user-reported results have been supplied. The full improvement plan and I01/I02 prerequisites were read; the existing Stage 7/18 lifecycle/access boundaries remain authoritative. The subsequent explicit I04 request is tracked separately, without treating I03 as runtime-accepted.

| Changed paths | Delivered responsibility |
| --- | --- |
| `src/renderer/src/app/navigation.ts` | Local typed app and entity destinations; no routing URL/hash or filesystem authority |
| `features/workspace/WorkspaceSession.tsx`, `useWorkspaceController.ts` | One persistent project/editor/session owner, cadence, exact retries, close/access/file lifecycle and guarded transitions |
| `features/workspace/drafts.ts`, `DraftOwner.tsx` | Live draft registrations, composition/dirty/busy/pending/focus contracts and flush outcomes |
| `features/workspace/RetainedRegion.tsx`, `WorkspaceViews.tsx`, `WorkspaceNavigation.tsx`, `WorkspaceNavigation.module.css` | Hidden/inert retained views, focus restoration and explicit feature entry points |
| `features/workspace/WorkspaceStatus.tsx`, `useExportOperations.ts` | Global draft/file/export outcomes; export polling continues outside the export screen |
| `features/projects/Projects.tsx`, `App.tsx`, `features/settings/SettingsPanel.tsx` | Presentation extraction, persistent root and typed app-level entry points |
| `features/projects/NotesPanel.tsx`, `SourcesPanel.tsx`, `EvidencePanel.tsx`, `SourceInspector.tsx`, `DocxExportPanel.tsx`, `LifecyclePanel.tsx`, `InterchangeImportPanel.tsx` | Retained draft/operation integration, stable note editor identity, exact unknown-outcome retries and explicit-save guards |
| `src/worker/projects/repository.ts`, `src/worker/exports/jobs.ts` | Existing export status/cancel commands resolve their own scoped job after project navigation |
| [Decision](../decisions/improvement-03-session-navigation.md), [manual guide](../manual-testing/improvement-I03.md), plan/AGENTS | Ownership/transition handoff and pending acceptance |

No migration is attributable to I03. Its baseline remained SQL/minimum reader 9, AST/archive 1, compilation 2. I04 subsequently adds its own schema 10 and compilation 3. No test code or verification tooling was added or maintained; no test/check/build/launch/browser/screenshot/CI or delegated equivalent was performed. Ordinary source/Git reads are not passed tests.

Pending: retained-draft/undo/IME behavior, exact target navigation, keyboard/focus/zoom/screen readers, background job completion across project switches, close/update/access draining, native Save and conflict recovery. See the user-owned guide. Existing commerce, signatures, store/native adapters, output fidelity, scale and provider funding/permission gates remain unaccepted; release remains NO-GO.

## User-reported outcomes

None. Record dated actions, platform and observations here only after Josh supplies them. No automatic advancement is authorized beyond the explicitly requested I04.
