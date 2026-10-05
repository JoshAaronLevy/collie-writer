# UI06 implementation record — Consistent AI entry points

October 5, 2026. **Implementation complete — awaiting user testing.** Required code checks passed; runtime acceptance remains pending. This stage covers contextual presentation and current documentation, not new provider or release work.

## Delivered behavior

- `AiRequestConnection` now presents the relevant conversation/proofreading availability and one Manage ChatGPT action. Availability still comes from main's feature snapshot, with uncertainty shown honestly. The duplicated model picker, progress, account actions, capacity panel, and funding explanation were removed from the introduction. Account details remain in the shared modal. Exact reviewed account/model/context, feature limits, Send/Run/Stop, local save/review, transcript export and request recovery remain in their existing owners.
- The Write AI indicator is a compact companion toggle. Its existing callback in `WritingWorkspace` is unchanged: it opens/closes the retained AI pane, including narrow-window behavior. It does not open the account dialog or replace conversation navigation. The global ChatGPT dot/button keeps its UI01/UI03 behavior.
- `AiWorkNotice` owns the Local AI capacity and recovery disclosure. The notice also remains discoverable when capacity is occupied/unreadable even if there are no work rows. `AiCapacity` retains exact original-project links, missing-record explanations, and slot details, with styles extracted beside that component. Original-project opening now uses the existing session action wrapper so busy state settles and draft guards remain. Confirmed empty capacity renders no routine panel. The connection dialog no longer contains operational capacity. Existing stop/protection/handoff/acknowledgment controls and exact pending actions are unchanged.
- Settings navigation and its retained region now say ChatGPT. Account notices use the shared concise progress presentation and Manage ChatGPT, keeping separate sign-in cancellation and local status reconciliation. The tutorial describes two-step creation and the shared dialog instead of claiming AI is unavailable throughout the build. It includes its own Manage ChatGPT entry. Request errors point to the actual dialog; historical provider provenance and route-specific refusals remain accurate.

## Source and documentation scope

Renderer: `AiRequestConnection`, `AiProviderIndicator`, `AiConnectionNotice`, `ChatGptConnectionDetails`, `AiCapacity` and its new CSS Module, connection copy/shared feature CSS, `AiWorkNotice` and CSS, conversation/proofreading panel copy, `ConnectionSettings`, `WorkspaceNavigation`, `WorkspaceViews`, and `TutorialPanel`. No persistent provider/workspace owner was moved or remounted. React best-practices review focused on hook order, retained identity, semantic labels, and event-owned actions. Mantine/static CSP conventions remain.

Current experience/navigation guidance, README, the active UI/app/DP01 plan checkpoints, manual-guide index, format addendum and AGENTS checkpoint were updated. I05/I11 decisions/manual guides and DP01's manual guide have explicit supersession notices; their dated bodies/results remain. README retains the older Codex summaries as historical context. The [combined walkthrough](../manual-testing/ui-improvements-UI06.md) covers UI01–UI06 and lists unobserved cases.

No main/preload/shared protocol, credential store, model/prompt preference, setup record, project schema, AST/archive, compilation, conversation attempt, operation journal, dependency, transport, access rule, Save contract, billing policy, or release gate changed in UI06. Earlier working-tree changes from UI01–UI05 were preserved. Current persistence remains SQL/minimum reader 13, AST/archive 1, compilation 3, setup v2 with v1 compatibility, and the existing UI02/UI04 local preferences.

## Checks and acceptance

Scripts/ignore scope were inspected before formatting. Vendor/generated artifacts and historical testing infrastructure remain excluded. An initial format/lint/node-and-web-typecheck sequence completed without diagnostics; the final production code also passed the required sequence after the remaining presentation changes:

| Command             | Actual outcome                       |
| ------------------- | ------------------------------------ |
| `npm run format`    | Exit 0; no warnings/errors.          |
| `npm run lint`      | Exit 0; no warnings/errors.          |
| `npm run typecheck` | Exit 0; node and web targets passed. |

Final documentation-only status updates were formatted afterward; production code remained unchanged.

No tests, test infrastructure, builds, app/browser launches, screenshots, probes, account actions, inference, or runtime verification were performed. No test code was modified. User acceptance is unobserved for all six UI stages; thanks and requests to continue are not test results. The direct route remains eligible-account-dependent and conversation-only, commercial restrictions remain, and release remains NO-GO. See the combined walkthrough for user-owned observations.
