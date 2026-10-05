# UI01 — Connection health and compact header

October 5, 2026. **Implementation complete — awaiting user testing. Runtime acceptance remains unobserved.**

Implements only [UI01](../../ui-improvements-plan.md#ui01--define-health-once-and-simplify-the-header). The header now shows **ChatGPT** and a status dot, with a keyboard/hover explanation and accessible state name. Clicking still opens Settings → AI connections. The writing companion's AI toggle retains its existing behavior and presentation. Automatic preparation, remembered models, a connection dialog, startup prompts, and project-creation changes remain UI02–UI06 work.

## Ownership and contract

The new [shared health contract](../../src/shared/ai-connection-health.ts) is an exact, finite `{ state, reason, action }` presentation value on `AiStatus.connectionHealth`. Its validator requires the matching state/action for each reason. `isAiStatus` validates it for every status/account RPC and connection event; existing main IPC and preload calls already use that same validator. No alternate unvalidated event or preload method was introduced.

[AiService](../../src/main/ai/service.ts) produces the health value for every route through [connection-health.ts](../../src/main/ai/connection-health.ts). The calculation deliberately does not read feature availability, project edit capability, active output work, or operation capacity. Account storage initialization/failure is tracked separately from journal/output failure. Pending credential protection remains a connection error. Existing dispatch, funding, project access, close, and storage safeguards still enforce actual actions independently of this presentation value.

The active direct route is not marked broken because its legacy runtime field is unavailable or commercial approval is absent. Historical Codex/registered routes retain their actual build, runtime, configuration, and isolation/funding limitations. No route is newly activated.

## Health precedence and clearing rules

1. Confirmed secure-account-storage failure or pending credential protection is red, with a storage/protection explanation.
2. An unavailable route/build is red. Initialization is yellow. Historical runtime absence is red.
3. Browser sign-in, disconnect, and unresolved renewal/resume show yellow progress. A direct renewal check with a still-verified usable token does not itself change health; this avoids flickering on the no-op renewal check before each Send.
4. A known invalid registration/route is red. No selected signed-in account is red. Saved sessions needing resume/renewal are yellow; unusable credentials cleared by existing auth logic return to signed-out red.
5. Missing plan permission and selected-account connection/admission issues are yellow unless the issue establishes a hard registration/route failure.
6. Missing, failed, or empty catalogs and absent model selections are yellow. A current supported selected model with a usable authorized account and no connection blocker is green.

Green describes configuration and current evidence, not guaranteed future provider admission or remaining quota. It requires neither a prior successful inference nor a hidden probe. Running requests, output protection/capacity, read-only projects, and unavailable direct proofreading do not by themselves alter the dot. Existing feature/global notices remain responsible for those conditions.

`DirectConnectionIssues` retains bounded, session-local reasons by stable saved account ID. The latest diagnostic can still change as before; it no longer erases known health facts merely when an account action starts. A failure for another saved account is not attributed to the selected account. Generic browser failures/cancellation and request-specific validation, incomplete output, or interrupted streams do not declare a healthy selected account broken.

| Evidence                                                           | Reasons it can clear                                                                                                                                                                                                          |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Successfully protected authorization or actual renewed credentials | Registration/authentication/permission failures and renewal-stage failures requiring authorization evidence. A no-op Renew does not count.                                                                                    |
| Successfully loaded authenticated catalog                          | Catalog-stage failures and earlier authentication/permission refusals contradicted by the successful authenticated catalog. It does not clear registration, quota, eligibility, route, or inference-service refusal evidence. |
| A genuinely completed user-reviewed response                       | Admission/usage/eligibility/service issues and catalog-stage failures; also prior authentication/permission refusals contradicted by successful admission.                                                                    |
| Successful disk-only credential protection                         | The pending-protection flag; it does not manufacture remote success or clear unrelated provider facts.                                                                                                                        |

Repeated metadata failures cannot downgrade the evidence needed to clear an existing admission refusal. Refreshing or selecting models, checking status, switching away and back, or reauthorizing does not clear a retained quota/admission refusal. The warning can remain yellow while existing main rules allow a new explicitly reviewed request; a successful response clears it. This advisory status adds no new send permission or automatic retry. Reasons are not persisted across app restarts; catalogs also reset on restart under the unchanged DP01 contract.

Renderer transport uncertainty is separate from main's health. Failed status reads and uncertain account replies show yellow/unconfirmed rather than retaining stale green. A failed read started before a newer status arrived cannot invalidate that newer snapshot. A newer valid status restores ordinary confidence; uncertain account replies retain the existing requirement for a subsequent local reconciliation read. Losing workspace availability also prevents displaying cached green. None of these reads renews credentials or contacts the provider.

## Presentation and compatibility

The header uses Mantine's installed Tooltip with hover/focus events, interactive hover retention, Escape dismissal, zero-duration transitions, and feature-scoped semantic CSS. Its accessible name includes ChatGPT, the health category, and the Settings action. Red/yellow/green use existing semantic error/warning/accent tokens, with explicit dot colors plus system-colored boundaries in forced-color mode. The tooltip supplies readable explanatory text beyond color. Static scoped CSS and library CSSOM positioning preserve the existing CSP approach; no stylesheet injection or remote asset was added.

Changed production paths:

- `src/shared/ai-connection-health.ts`, `src/shared/ai.ts`: transient contract and exact validation.
- `src/main/ai/connection-health.ts`, `service.ts`, `direct-session.ts`: derivation, account-scoped evidence, and confidence lifecycle.
- `src/renderer/src/features/ai-connections/connectionState.ts`: status-read/account-reply uncertainty.
- `AiProviderIndicator.tsx`, `connection-copy.ts`, `AiConnections.module.css` in that feature: compact header, explanatory copy, and scoped styling.

No dependency, credential/preference format, portable enum, operation journal, SQL/minimum reader, AST/archive, or compilation format changed. No tests or testing-only infrastructure were added or changed. The original create/Save/recovery contracts and retained editor owners are unchanged.

## Required checks and acceptance

The repository scripts/ignore scope were inspected first. Existing exclusions protect vendored source, generated output, and historical test infrastructure. The scripts have no test/build/launch hooks. The final code passed the required sequence after the last source corrections:

| Command             | Actual outcome                                                           |
| ------------------- | ------------------------------------------------------------------------ |
| `npm run format`    | Exit 0; formatting applied, no warnings/errors.                          |
| `npm run lint`      | Exit 0; no warnings/errors.                                              |
| `npm run typecheck` | Exit 0; both node and web TypeScript targets passed without diagnostics. |

No pre-existing lint/type errors were reported. Final documentation updates were formatted afterward; application code was unchanged by those documentation updates.

No tests, builds, app/browser launches, screenshots, fault injection, provider login, model discovery, inference, credential inspection, or runtime checks were performed. The [manual guide](../manual-testing/ui-improvements-UI01.md) belongs to Josh. UI appearance, assistive technology, CSP, status transitions, real account errors, and native behavior remain unobserved. Release remains NO-GO. Stop before UI02.
