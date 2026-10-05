# Improvement I05 — Guided project creation

October 1, 2026. **Implementation complete — awaiting user testing.** Josh explicitly requested I05 after I01–I04. No user-reported I05 results have been supplied; no runtime/native/accessibility acceptance is inferred from source inspection.

## Delivered

| Paths                                                                                                                                                      | Change                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/renderer/src/features/onboarding/OnboardingWizard.tsx`, `OnboardingWizard.module.css`                                                                 | Mantine primary/secondary type cards, details, frozen creation/retry, truthful AI boundary, explicit access choice and writing handoff; semantic scoped CSS     |
| `features/onboarding/setup-draft.ts`                                                                                                                       | Bounded app-profile setup/request/receipt record, strict read/write, explicit discard, optional remembered-author preference                                    |
| `features/onboarding/AuthorPreferenceSettings.tsx`, `AuthorPreferenceSettings.module.css`, `features/settings/SettingsPanel.tsx`                           | Edit/clear author default with component-scoped styles and disclose locally held setup metadata                                                                 |
| `features/project-details/ProjectDetailsFields.tsx`                                                                                                        | Reused I04 details validation/fields with wizard focus and author-preference placement                                                                          |
| `features/workspace/useWorkspaceController.ts`, `WorkspaceViews.tsx`                                                                                       | First-launch destination, exact create/resume integration, pending-work protection and retained setup region; removed transitional single-page New project form |
| [Decision](../decisions/improvement-05-guided-setup.md), [manual guide](../manual-testing/improvement-I05.md), plan, AGENTS, privacy/accessibility indexes | Contracts, pending observations and user-owned handoff                                                                                                          |

No new IPC, provider SDK, account session, migration, chosen-file destination or dependency was introduced. Current working SQL/minimum reader is **10**, editor AST/archive container **1**, frozen compilation **3**. Existing durable create intent/receipt and entitlement services remain authoritative. Study critique gains a primary card, not a specialized PDF/link/refutation workflow.

Read the plan, prerequisite records, source/configuration and Git state; edited implementation and documentation. **No test code, fixtures, mocks, harnesses or verification scripts were written or maintained. No tests, typecheck, lint, audit, formatter, build/package command, app/server/browser launch, screenshot, benchmark, CI check or delegated equivalent was run.** Source review is not a passed test.

## Pending observations and boundaries

- User results: **none**. First-install versus returning startup, seven card choices, keyboard selection/focus, field errors, cancellation and Back/forward persistence await user observation.
- Real restart, unknown-outcome retry, creation receipt recovery, profile storage failure and worker interruption remain unobserved. No failure was injected. The exact operation is retained by source design; native durability is not claimed.
- Free-project designation and protection of another project's pending edits, read-only handling, writing handoff, native first Save, tutorial separation and offline behavior remain unobserved.
- Narrow window, 200% zoom, light/dark, high contrast, reduced motion, VoiceOver/NVDA, packaged CSP and Windows/macOS behavior remain pending. Existing release **NO-GO** and I01 provider eligibility/funding gates remain open.

Record platform, action and actual result here only when Josh supplies them. Stop after the [manual guide](../manual-testing/improvement-I05.md); I06 requires a separate request.
