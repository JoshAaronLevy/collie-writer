# UI02 — Automatic connection preparation and remembered model

October 5, 2026. **Implementation complete — awaiting user testing.** Runtime acceptance belongs to Josh.

## Delivered scope

Successful direct ChatGPT sign-in/reauthorization, saved-account selection, and explicit session renewal schedule model setup through the existing main account owner. The connection panel offers **Try again** when setup is incomplete and **Refresh models** for an existing catalog. Both use the same preparation path. The selected **Model for this account** is saved per registration.

UI02 does not trigger preparation at launch. After reopening, use ChatGPT → Settings → Try again to restore the saved selection from a fresh catalog. The shared modal, startup prompting/suppression, project wizard changes, and editing-access simplification remain UI03–UI06. Historical Codex/commercial routes retain their existing behavior and restrictions.

## Ownership, cancellation, and health

- `ai.prepareConnection` accepts only the existing exact `{ connectionId }` input through the trusted main IPC, typed preload API, and exact status/result validators. It accepts one preparation intent; completion/failure is reported through authoritative status. It is separate from `ai.prepare`, which still requires the reviewed conversation capture.
- `DirectPlanSession` keeps one intent bound to the active registration and session generation. Duplicate intents coalesce while queued/running. Confirmed account replacement clears the old intent. Catalog/selection commits check account generation and cancellation before publishing.
- `AiService` drains that intent on existing ownership/settlement notifications. It waits for active inference, content work, handoff, and protection to settle, and respects storage failure, close/update, suspension, and the existing lost-renderer suspension. Polling `ai.status`, opening Settings, and changing projects never enqueue preparation. Waiting does not reserve the owner whose work it awaits.
- Preparation uses the existing credential owner and token rules, including the two-minute renewal margin, `earliestRefreshAt`, pending rotations, verified identity, and plan scopes. Missing/uncertain credentials require deliberate reconnection. No browser is opened automatically. Unknown rotating-token outcomes remain protected and cannot be reused.
- A 45-second overall preparation deadline aborts the owner's transport in addition to the existing endpoint deadlines. The operation awaits owner settlement; it never races away from a credential or preference write. A local filesystem write that has not settled remains owned and close-blocking even after network cancellation. There is no automatic network retry loop or inference probe.
- Closing cancels queued intent; confirmed Stop/close and suspension abort active provider work through the existing owner. A pending preference/credential candidate still blocks successful close until protected. Resuming does not requeue cancelled setup.
- Progress is exposed as `direct.preparation` (`idle`, `waiting`, `running`). The panel displays “Setting up ChatGPT…” or its waiting explanation. Main health adds preparation and preference-recovery reasons without changing portable request reason enums. Known account/usage/admission failures survive catalog success. Explicitly selecting a different model clears only a model-specific refusal; choosing the same refused model is rejected for the current session.
- Account/model/catalog authority changes invalidate existing reviews using the existing revision mechanism. Prompts, context drafts, history, and exact submitted operations stay with their existing owners. No project text is sent by preparation.

## Encrypted preference contract

`src/main/ai/direct-preferences.ts` defines the separate `ai/chatgpt-plan-preferences-v1.json` record. Its exact plaintext payload is `{ version: 1, accounts: [{ connectionId, modelId }] }`, stored only inside the existing encrypted atomic-write envelope. Reads are capped at 16 KiB; there are at most eight unique known saved registration IDs and each model ID uses the existing bounded catalog validator. There are no tokens, labels/emails, paths, or project fields. Existing v1 credentials are unchanged.

Missing preferences start empty. Invalid/decryption/read errors or unknown account references retain the credentials, block automatic selection, and expose a local-only **Retry reading model choices** action. An unreadable record is not overwritten or replaced with defaults. If retry cannot read it, the problem remains visible; no automatic destructive repair is supplied.

After fresh discovery, restore the remembered model if available. Only for an account with no preference, use a unique adapter-reported default, otherwise the first supported visible text model in provider order. The current adapter supplies no default signal, so this is Collie's initial choice, not a provider recommendation. An empty catalog supplies no invented model. A missing or session-refused remembered model remains unselected/yellow and asks for a replacement. Refresh preserves a valid selection; account switching discovers a fresh catalog and restores that account's choice. Disconnect retains preferences and registrations without choosing a different account. Session-local refusal evidence remains transient, as in UI01.

A failed preference write retains the exact candidate and the fresh catalog. **Retry saving model choice** writes it locally and applies the choice only after protection; it does not repeat discovery, renewal, browser authorization, or inference. The account owner is reserved during this local retry. Successfully saved choices survive restart; catalogs must still be freshly prepared.

## Changed owners and compatibility

- Main: `direct-session.ts`, `direct-preferences.ts`, `storage.ts`, `service.ts`, `ipc.ts`, and the UI01 `connection-health.ts` owner.
- Shared/preload: `ai.ts`, `ai-direct.ts`, `ai-connection-health.ts`, and `preload/ai.ts`. Exact transient validators include the new preparation/preference states and stage.
- Renderer: the existing `connectionState.ts` controller, model/panel/progress components, and connection copy. All mounted surfaces still share the same provider. No new effect initiates network work; no new stylesheet, library, dialog, or draft owner was introduced. React best-practices guidance informed the scoped source review.
- The format addendum is in `docs/formats/chatgpt-plan-v1.md`. Credentials v1, operation/binding v4, SQL/minimum reader 13, AST/archive 1, and compilation 3 remain unchanged. No tests or testing-only infrastructure were added or modified.

## Required checks and acceptance

The format/lint/typecheck scripts and their scopes were inspected; vendor/generated/historical test exclusions remain intact. Initial format and lint passed. Typecheck found an action-union comparison in the renderer local-action handler and a catalog-only timeout reason used as a request reason; both were corrected without broadening the portable reason contract. The final production code passed the required sequence:

| Command             | Actual outcome                                           |
| ------------------- | -------------------------------------------------------- |
| `npm run format`    | Exit 0; no warnings/errors.                              |
| `npm run lint`      | Exit 0; no warnings/errors.                              |
| `npm run typecheck` | Exit 0; node and web targets passed without diagnostics. |

Final documentation/status updates were formatted afterward; application code was unchanged by those updates. No user runtime results have been supplied for UI02.

No tests, builds, app/browser launches, account login, provider model calls, inference, screenshots, fault injection, or runtime verification were performed by the assistant. The [manual guide](../manual-testing/ui-improvements-UI02.md) is user-owned. Live transport, encrypted persistence, deadline/close behavior, accessibility, and account eligibility remain unobserved. Release remains NO-GO. Stop before UI03.
