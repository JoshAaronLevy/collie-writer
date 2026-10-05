# UI03 — Shared ChatGPT dialog

October 5, 2026. **Implementation complete — awaiting user testing.** Runtime acceptance remains user-owned.

## Delivered experience

The header's ChatGPT button opens one app-level dialog over the current destination. It retains the compact status dot and accessible explanation, now identifies a dialog popup, and reflects whether that dialog is open. Settings → AI connections remains a valid typed destination with a short account summary and **Manage ChatGPT**. The existing setup page also uses that summary; removing the AI creation step remains UI05. The writing-tool connection entry and the global account notice open the same dialog. The writing companion's separate AI toggle still toggles its companion.

The dialog presents a short explanation, account identity when applicable, and one relevant primary action: Connect/Reconnect, Try again, Resume, local protection/read retry, Check status, Choose model/account, View connection details, or Done. In progress it shows the actual connection stage without offering conflicting account actions. **Not now**, Escape, the outside overlay, and the close control dismiss it; Done dismisses the connected state. Cancel sign-in is a separate deliberate action.

Model, Manage account, and Connection details are native keyboard-operable disclosures styled with the shared feature's semantic CSS. A needed model/account section opens automatically without moving focus; explicit Choose/View actions reveal and focus the section summary. Normal ready/disconnected views keep the technical details collapsed. Details retain the direct diagnostic stages, feature availability, account spending policy, route/activation restrictions, encrypted-storage explanation, and local AI capacity/recovery controls. Sign-in has a brief privacy/account-use explanation; the request surfaces retain their existing spending disclosure before Send.

Manage account retains saved-account selection, reauthorization, renewal, adding another account, historical-route resume/cleanup, and disconnect. The normal reconnect action reuses the sole saved registration when no account is selected; multiple saved registrations require an explicit choice. No saved account is automatically selected or signed in. Disconnect first shows a confirmation within the same modal. Keep connected returns to its trigger; confirming dispatches the exact existing account action and displays progress. Dismissing confirmation never disconnects. Local sign-out and confirmed/unconfirmed remote revocation remain distinct.

## Ownership and focus

- `useConnectionController` remains the persistent owner of snapshots, attempts, pending/unconfirmed replies, operation registration, and provider actions. It now also owns presentation visibility and a transient opener/destination/generation reference. Dismissal changes only presentation state. No connection work is cancelled or forgotten when modal content unmounts.
- `AiConnectionsProvider` mounts one `ChatGptConnectionDialog` beside its children. It does not replace, wrap in a new boundary, or reparent any editor, project, conversation, research, or explicit-form owner. `PresentationBoundary` sits inside `AppDialog`, beneath the surviving controller; a presentation failure leaves the dialog's close control and account owner available.
- `showOrigin` reopens the dialog at the current destination. The registered Settings destination remains compatible with existing navigation and draft recovery. Browser completion only updates status; it never opens a dismissed dialog or navigates back to the earlier project.
- Action-focus restoration checks dialog generation, visibility, destination, IME composition, and competing dialogs. Completion from an earlier presentation cannot focus a later opening. Closing returns focus after the exit transition to a surviving visible opener, or the header if that opener disappeared. It does not overwrite focus the user already moved elsewhere.
- Explicit opening is refused during an existing modal, navigation, close, or composition; it is not queued as an automatic prompt. `RetainedRegion` defers an existing navigation focus request until dialogs exit, then consumes it once; route changes dispose the waiting observer. It does not compete with the dialog’s focus trap or leave the old request for a later route. Existing native-close and main account settlement remain authoritative.
- The capacity recovery links remain actionable. Explicitly choosing **Open [original project]** closes the presentation and invokes the existing guarded project action. Ordinary dismissal has no navigation side effect.

`AppDialog` supplies the existing Mantine focus trap, accessible title, Escape/overlay handling, constrained scrolling, reduced-motion behavior, and static CSP-compatible scroll lock. The new UI uses feature-scoped semantic CSS and no generated stylesheet, inline style object, new dependency, network origin, or persistent preference. The React best-practices skill informed the source review of hooks, component identity, and event-driven actions.

## Scope and changed owners

Production changes are limited to renderer connection presentation and necessary entry/focus integration:

- New `ChatGptConnectionDialog.tsx`, `ChatGptAccountControls.tsx`, `ChatGptConnectionDetails.tsx`, and `connectionPresentation.ts` in `features/ai-connections/`.
- Existing `connectionState.ts`, `AiConnectionsProvider.tsx`, `AiProviderIndicator.tsx`, `AiConnectionPanel.tsx`, `AiConnectionNotice.tsx`, `AiRequestConnection.tsx`, `AiCapacity.tsx`, connection copy, and feature CSS.
- `App.tsx` header, `ConnectionSettings.tsx` summary, `RetainedRegion.tsx` focus coordination, and the AI work notice's recovery-location wording.

No UI03 main/preload/shared contract, credential/model-preference format, operation journal, project schema, Save contract, or inference behavior changed. Existing UI01/UI02 changes in the working tree were preserved. Opening the dialog performs no new network action or model preparation. Startup preparation/prompting and the suppression checkbox remain UI04. Project-step removal and editing access remain UI05; broader contextual cleanup remains UI06.

## Required checks and acceptance

Scripts and ignore scope were inspected; vendor/generated files and historical testing infrastructure remain excluded. The initial format/lint/typecheck sequence passed without diagnostics. The final production code passed the required sequence without diagnostics:

| Command             | Actual outcome                       |
| ------------------- | ------------------------------------ |
| `npm run format`    | Exit 0; no warnings/errors.          |
| `npm run lint`      | Exit 0; no warnings/errors.          |
| `npm run typecheck` | Exit 0; node and web targets passed. |

Final documentation/status updates were formatted afterward; application code was unchanged by those updates.

No tests, builds, app/browser launches, screenshots, account actions, provider calls, or runtime verification were performed. No tests or test-only infrastructure were added or modified. There are no user-reported UI03 results yet. See the [manual guide](../manual-testing/ui-improvements-UI03.md). Actual modal layout, native/browser return, focus/keyboard/screen-reader behavior, IME/editor retention, provider outcomes, and CSP behavior await user observations. Release remains NO-GO. Stop before UI04.
