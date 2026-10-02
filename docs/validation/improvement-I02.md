# Stage I02 completion record

October 1, 2026 — **implementation complete — awaiting user testing.** No user acceptance is recorded. This is improvement I02, not MVP Stage 2.

## Review and scope

Josh explicitly requested a thorough read of the entire improvement plan followed by I02. All fifteen stages, shared contracts and confirmed choices were reviewed; I01's design/architecture/evidence, current AGENTS guidance, D4 attribution/license obligations, source preferences/shell/security, package metadata and asset origins supplied the implementation context. I01 has no user-reported document-review results; its delivered specification is the prerequisite, and this explicit request authorizes only I02. The working tree began clean.

The full-plan review confirms the ordering: a persistent visual owner comes now; persistent draft/session extraction precedes routing; real metadata/migrations precede the wizard; qualified provider execution remains independent. No new question or reopening of settled choices was necessary. Existing MVP commerce, signing, MAS, acceptance and release gates are unchanged.

## Delivered changes

| Paths | Result |
| --- | --- |
| `package.json`, `package-lock.json` | Exact Mantine core/hooks 9.6.3 and Lucide React 1.49.0, with resolved transitive dependencies; prior runtime/build selections retained |
| `src/renderer/src/main.tsx`, `theme/visual-preferences.ts`, `theme/VisualPreferencesProvider.tsx` | One startup preference owner/provider, legacy-field preservation, light/dark/system, OS listeners, root contrast/motion, independent native zoom, safe fallback and persistence/error handling |
| `theme/theme.ts`, `theme/tokens.css` | Semantic visual tokens, matching static Mantine variables/defaults, local Source Serif faces, theme/contrast/forced-color roles |
| `components/ui/Controls.tsx`, `ActionMenu.tsx`, `AppDialog.tsx`, `Feedback.tsx`, their CSS Modules | Real shared buttons, labeled fields/errors/choices, action menu, titled dialog, banners, surfaces and empty state |
| `App.tsx`, `App.module.css` | New shell, labeled header controls, ordinary initial attribution, existing destination focus, global preference warnings and available engine disclosure |
| `features/settings/SettingsPanel.tsx`, `SettingsPanel.module.css` | Appearance/accessibility controls and preserved privacy narrative; explicit read-only support preview dialog with pending/error/dismiss/selection behavior |
| `features/projects/Projects.tsx`, `Projects.css` | Stylesheet import only in the session component; prior aggregate feature rules moved out of global CSS, scoped and connected to theme roles; editor font presentation updated |
| `assets/main.css`, `components/ErrorBoundary.tsx`, `ErrorBoundary.module.css` | Minimal global base layer and a scoped fallback that can render outside Mantine |
| `src/main/security.ts`, `protocol.ts`, `windows.ts` | Explicit existing strict style policy, exact emitted TTF allowance, matching light startup background; no new request origin or permission |
| `resources/licenses/NOTICE.txt`, `resources/licenses/dependencies/` and inventory | Complete retained package notices for selected UI dependencies; upstream-license provenance for the npm scroll-bar notice omission |
| [Decision](../decisions/improvement-02-visual-foundation.md) | Dependency selection, preference contract, token mapping, stylesheet ownership, CSP/portals and future component rules |
| [Manual guide](../manual-testing/improvement-I02.md), guide index, privacy/accessibility addenda, AGENTS and improvement plan | User-owned handoff, truthful checkpoint and boundaries |

All authored classes use semantic names. New shared/feature presentation uses CSS Modules; existing workspace rules are beneath `.projects` in its own stylesheet pending their later stage-owned extraction. No component gallery, testing UI, utility-class system or broad Mantine override was introduced.

## Implementation decisions

The [decision](../decisions/improvement-02-visual-foundation.md) owns detail and official-source links. Mantine uses static bundled CSS with provider variable/global-class injection disabled. React CSSOM assignments supply library runtime values; generated style text remains denied. AppDialog replaces the generated scroll-lock stylesheet with scoped CSS while retaining focus/escape/return behavior. Production CSP is not relaxed. Future styling that generates style tags requires a separate documented solution.

`collie.visual-settings.v1` is extended additively with `appearance`. It remains device-local and is applied independently of Settings. Valid older fields survive normalization; malformed/inaccessible preferences cannot block project access. Zoom failures offer a labeled field error/retry. The support preview still calls the existing content-free IPC and has no network/send function.

Existing initial attribution is preserved with source/license access. Icons and font assets are bundled. Data and draft ownership stay with existing code, and all existing project commands/flush logic remain in place. Native Save/pickers/confirmations, entitlement behavior and update handshake are not replaced.

## Formats and execution

Working SQL/minimum reader **9**, editor AST **1**, archive container **1**, compilation model **2** remain unchanged. No project migration or data change occurred. Only the local visual preference adds a field.

Dependency metadata reads and an install with `--ignore-scripts --no-audit --no-fund` were performed as implementation work. The install shell reported Node 22.22.3/npm 10.9.8 and an engine mismatch against the still-pinned Node 24.21.0/npm 11.19.0; installation completed, but this establishes no app/build compatibility. Use the pinned toolchain for user-owned launch work. Notices were copied from installed package artifacts; the omitted react-remove-scroll-bar license was obtained from official upstream and its retrieval provenance recorded.

No test code, fixtures, mocks, probes, test-only controls, automated checks, typecheck, lint, formatter, audit, build/package, app/server/browser launch, screenshot, benchmark, CI action or delegated verification was created or executed. Source and Git inspection is not a passed test. No provider sign-in, inference, registration, account action, deployment or publication occurred.

## Pending observations and next boundary

| Item | Status |
| --- | --- |
| I02 source/configuration/docs | Implementation complete |
| Visual quality / calmness / readability | Awaiting Josh; no screenshot or runtime judgment made |
| Preference preservation, OS changes, restart, malformed/read/write/zoom failures | Implemented, behavior unobserved; no artificial failure injection |
| Keyboard/menu/dialog focus and outside-click/scroll behavior | Unobserved on macOS/Windows; guide supplied |
| VoiceOver/NVDA, increased contrast/forced colors, reduced motion, 200% zoom | User-owned accessibility gates remain open |
| Packaged fonts and strict CSP | Unobserved; separate packaged step required, HMR not sufficient |
| Existing editor/native/save/export behavior | No acceptance inferred; prior native/output/scale gates retained |
| I03 | Not started; no automatic advancement |
| Full local redesign / AI / release | Not complete; I03–I15 and independent existing gates retain their statuses |

## User-reported results

None supplied for I02. Record dated platform/action/outcome details here after Josh follows the [manual guide](../manual-testing/improvement-I02.md), distinguishing accepted behavior, defects and unobserved paths. Stop after this handoff.

## Follow-up request — October 1, 2026

On the repeated request to review the full plan and implement I02, the complete plan was reread and the existing uncommitted I02 implementation preserved. The plan's opening status still incorrectly said I02 had not started; it now agrees with this record, the stage brief and completion ledger. The source-baseline table is explicitly labeled as the I01 baseline. No dependency reinstall, runtime change, test/check, launch or user acceptance resulted from this follow-up. I02 remains implementation complete — awaiting user testing; I03 remains unstarted.
