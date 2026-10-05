# Collie Writer UI improvements

Created October 5, 2026. **UI01–UI06 implementation complete — awaiting user testing.** See the [combined walkthrough](docs/manual-testing/ui-improvements-UI06.md), [UI06 record](docs/validation/ui-improvements-UI06.md), and per-stage records in the progress ledger. No user runtime acceptance is recorded.

This is the working plan for the requested ChatGPT connection and project-creation improvements. Add later improvements as new stages without renumbering these. A request to implement a named stage authorizes that stage and its necessary fixes; this document does not authorize automatic advancement or another plan.

## 1. Intended experience

Connecting ChatGPT should feel like connecting an account to Collie Writer. It should happen once per app profile on a device and apply to every project. Creating a project should lead into writing, without a separate AI setup page or a redundant request for permission to edit.

The header will show **ChatGPT** and one small status dot. Clicking it will open the same compact connection dialog from anywhere in the app. A healthy returning user will reach the normal opening destination without a connection prompt. A user who needs to connect or resolve a problem will see the dialog at startup, with a clear next action, an ordinary dismissal, and **Don't show this automatically again**.

Routine session renewal and model preparation will happen through the existing account owner. The user will not need to understand the current sequence of Renew session → Refresh models → Choose a model simply to get started.

The dialog will explain that the account applies to all projects on this device. It will not imply synchronization between devices or guaranteed permanent authorization: the provider can still require reauthorization.

### Scope and decisions

| Area                 | Planned behavior                                                                                                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header               | `ChatGPT` followed by a red, yellow, or green dot; no inline account, connection sentence, or build explanation.                                                                                    |
| Account ownership    | Reuse the existing app-wide account service and selected account. Project creation never creates its own connection.                                                                                |
| Startup              | Read local state, prepare an existing connection where safe, and prompt only if the resulting state needs attention.                                                                                |
| Browser sign-in      | Start only after an explicit Connect/Reconnect action. Opening the app or dialog does not open the browser.                                                                                         |
| Dismissal            | Close, Escape, outside click, or **Not now** dismiss the dialog without blocking local work. During an account action, dismissal hides its presentation; it is not cancellation.                    |
| Persistent dismissal | A device/profile preference suppresses automatic opening, including future reconnect prompts. The header always opens the dialog manually.                                                          |
| Model setup          | Discover models automatically after successful connection and on returning startup; restore the account's remembered choice when valid. Use the initial default policy below when no choice exists. |
| Project creation     | Two visible steps: project type and project details. Successful creation proceeds to the created project's writing workspace.                                                                       |
| Editing access       | Remove redundant designation steps; integrate a necessary free-project switch into the creation action with a clear explanation. Preserve the current free/paid rules.                              |
| Detailed information | Keep useful model/account controls and sanitized troubleshooting available through disclosures. Remove duplicate technical explanations from the normal path.                                       |

This is a presentation and connection-lifecycle change within the current direct ChatGPT-plan architecture. It does not implement another provider, activate proofreading, alter billing, remove the free-project limit, or establish commercial/release readiness.

## 2. Findings from the screenshots and source

The four supplied screenshots show one setup screen stretched across several views. They expose sign-in, authorization, model discovery, request history, runtime policy, capacity, commercial status, and editing access together. They also show a storage error. The proposed UI needs to separate those concerns while keeping the actual blocking action understandable.

The following findings describe the source at planning time, before UI01, not an app launch or runtime test. The UI01–UI03 records identify the subsequent status/header, automatic model-setup, and shared-dialog changes:

| Finding                                                                       | Current source and consequence                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The connection is already app-wide.                                           | [App.tsx](src/renderer/src/App.tsx) mounts one [AiConnectionsProvider](src/renderer/src/features/ai-connections/AiConnectionsProvider.tsx) above the conversation/proofreading providers and routed content. Reuse this ownership; the problem is how the connection is presented and initialized.                                                                                                                           |
| The header turns a capability result into a long connection label.            | [AiProviderIndicator.tsx](src/renderer/src/features/ai-connections/AiProviderIndicator.tsx) displays “ChatGPT connection” and “Connected · AI unavailable.” It uses conversation availability, which can also be blocked by unrelated work. Clicking the header currently navigates to Settings.                                                                                                                             |
| One panel exposes nearly every implementation detail.                         | [AiConnectionPanel.tsx](src/renderer/src/features/ai-connections/AiConnectionPanel.tsx) includes account actions, [DirectConnectionProgress](src/renderer/src/features/ai-connections/DirectConnectionProgress.tsx), [AiModelSelection](src/renderer/src/features/ai-connections/AiModelSelection.tsx), capacity, policy paragraphs, and a further details disclosure. Several explanations are repeated.                    |
| Model setup does not survive a restart.                                       | [DirectPlanSession](src/main/ai/direct-session.ts) initializes the catalog as `not-loaded`. Its `reset()` clears catalog/selection on account changes. `refreshModels()` clears selection even after a successful refresh; `selectModel()` changes memory only.                                                                                                                                                              |
| There is no provider-default signal in the current direct catalog adapter.    | [direct-http.ts](src/main/ai/direct-http.ts) preserves the visible catalog order and maps every entry to `isDefault: false`. A new default-selection policy must be explicit; it cannot assume the existing field identifies a recommended model.                                                                                                                                                                            |
| Local status polling cannot complete setup.                                   | [connectionState.ts](src/renderer/src/features/ai-connections/connectionState.ts) reads status initially, on focus, and every five seconds. [AiService.readStatus()](src/main/ai/service.ts) initializes local state and returns a snapshot; it does not renew or discover models. Keep these reads local.                                                                                                                   |
| Renewal already has safeguards to reuse.                                      | [direct-session.ts](src/main/ai/direct-session.ts) serializes account work, checks renewal timing, protects rotation intent, and retains failed credential candidates. [storage.ts](src/main/ai/storage.ts) refuses reuse of interrupted rotating credentials. Automatic preparation must preserve these rules.                                                                                                              |
| “Can send now” is broader than connection health.                             | `AiService.status()` folds active work, pending output protection, and capacity into feature availability. `DirectPlanSession.snapshot()` adds authentication, permission, catalog, and selection requirements. Proofreading is intentionally unavailable on the current route. These facts must not all produce a broken connection indicator.                                                                              |
| The third setup step is hard-coded and persisted.                             | [OnboardingWizard.tsx](src/renderer/src/features/onboarding/OnboardingWizard.tsx) advances a successful create to `connection`, mounts the whole account panel, and ends with “Continue without AI.” [setup-draft.ts](src/renderer/src/features/onboarding/setup-draft.ts) strictly accepts `type`, `details`, `creating`, and `connection`. Removing the JSX alone would strand existing setup records.                     |
| Creation and editing access are separate operations.                          | [entitlements/service.ts](src/main/entitlements/service.ts) permits project creation without designation. `designate()` validates the project scope and access revision and protects active work. [canEditProject()](src/shared/access.ts) separately allows paid access, the designated free project, or the trusted sample. There is no automatic first-project designation in the inspected service.                      |
| The wizard must open the created scope before its current designation action. | `OnboardingWizard.designate()` calls `resumeSetupProject(..., 'setup')`, then `changeAccess('designate')`. The latter currently returns `Promise<void>`, so a combined create-and-open flow needs an explicit confirmed/blocked outcome instead of assuming success.                                                                                                                                                         |
| Startup already owns the correct destination.                                 | [useWorkspaceController.ts](src/renderer/src/features/workspace/useWorkspaceController.ts), particularly `resolveInitialDestination()`, prioritizes saved setup, then a valid last project, then the library/empty setup. Preserve that choice and overlay the dialog without replacing navigation.                                                                                                                          |
| Retained ownership and focus need explicit integration.                       | [WorkspaceSession.tsx](src/renderer/src/features/workspace/WorkspaceSession.tsx), [RetainedRegion.tsx](src/renderer/src/features/workspace/RetainedRegion.tsx), and [AppDialog.tsx](src/renderer/src/components/ui/AppDialog.tsx) already provide persistent owners, hidden/inert regions, and CSP-compatible Mantine dialogs. A new modal must coordinate with destination focus and existing native close/recovery guards. |

The screenshots do not prove why local storage access was denied, whether similarly titled projects have the same identity, or whether account inference completed. Do not hide the storage failure or infer an identity/access bug from titles. During implementation, use exact project/workspace IDs and refreshed access state; treat any reproducible underlying storage defect as a separately identified issue unless it is caused by this flow.

### Existing decisions this plan changes

This plan replaces the third project-setup step in the current I05/I11 experience and the requirement for users to manually discover/select a model on every connection session. It proposes bounded automatic connection preparation for the direct route. It retains local-only status polling, deliberate browser authorization, main-owned credentials, and reviewed inference.

The current [DP01 decision](chatgpt-plan-implementation.md) and [format record](docs/formats/chatgpt-plan-v1.md) remain the provider foundation. Older Codex-specific restrictions apply to that historical route; they are not new blockers for this direct-route UI work. Existing [I06 startup behavior](docs/decisions/improvement-06-library-and-lifecycle.md), [Save/local recovery](docs/decisions/save-and-local-recovery.md), and CA02 renderer recovery ownership remain intact.

## 3. Connection status contract

Add a main-derived, transient connection-health view to the validated status contract. The renderer maps that view to the dot, accessible label, summary, and next action. Do not add a renderer-authored `ready` flag or use the dot as authority to send a request.

Keep connection health separate from feature availability, project editing access, and in-flight request state. Main must still recheck all existing permissions, review captures, account/model identity, and storage protections for every actual operation.

| Dot    | Condition                                                                                                                                                                                                          | Example dialog summary / action                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Yellow | Initial status or routine connection preparation is in progress.                                                                                                                                                   | “Checking ChatGPT…” / progress, with dismissal available.                                                                  |
| Red    | No connected account, including explicit local sign-out.                                                                                                                                                           | “Connect ChatGPT” / **Connect ChatGPT**. A saved registration can be reused by the action.                                 |
| Yellow | A saved connection can potentially be renewed or needs user reauthorization/permission.                                                                                                                            | “Reconnect to continue using ChatGPT” / **Reconnect ChatGPT**, after safe automatic renewal has been considered.           |
| Yellow | Account is connected, but models/settings need attention.                                                                                                                                                          | “Choose a model to finish setup,” “Your saved model is no longer available,” or a concise catalog-retry message.           |
| Yellow | A connected account cannot currently be checked because the network is unavailable, or a recoverable provider/usage restriction is known.                                                                          | “ChatGPT is temporarily unavailable” / **Try again** or a relevant usage explanation. Preserve the account.                |
| Red    | A confirmed hard connection failure prevents use: unusable registration, secure credential storage failure, unsupported connection route/build, or confirmed rejected authorization that leaves no usable session. | State the problem once and show only an action that can help. Do not repeatedly offer sign-in for a storage/build problem. |
| Green  | A permitted route has a protected, usable selected account, required authorization, a successfully obtained current catalog, and a selected usable model, with no unresolved connection-level blocker.             | “ChatGPT is connected” / **Done**.                                                                                         |

Rules for ambiguous cases:

- Initial loading is yellow, never speculative green or a flash of “not connected.” Progress does not itself trigger a startup prompt.
- An active first sign-in is yellow while progressing. Cancellation returns to the actual preceding account state; a failed attempt to add another account does not invalidate a still-healthy selected account.
- A recoverable expired session is yellow. Confirmed invalidation that clears usable credentials is red. The next action can be **Reconnect ChatGPT** in either case; stored registration alone is not a connection.
- A failed connection-status read makes the current state unknown/yellow, even if an older snapshot was green. A confirmed hard failure is red. Keep monotonic snapshot ordering.
- A healthy account remains green while generating a response, while an unrelated project is read-only, or while an unimplemented feature such as direct-route proofreading is unavailable. A request-specific failure stays with that request unless it establishes a current connection/account problem.
- Output protection/capacity remains in the existing global AI work notice and feature action state. It does not ask the user to reconnect. Credential protection failure is a connection problem and must be distinguished from output protection.
- Quota/provider failures must not be “resolved” just because a model list reloads. Track the applicable reason, its lifetime, and the evidence/action that clears it. Retain a usage warning when account admission is still known to be blocked.
- Green means configured and ready for a reviewed request based on current evidence. It does not promise remaining quota, availability of every feature, or a successful future response. A completed inference is not a prerequisite for green; no hidden sample request will be sent.
- Do not use `runtime === 'unavailable'` or `commercialApproved === false` alone to make the active permitted DP01 development route red. Those fields have different meanings on the direct and historical routes. Packaged restrictions still apply to packaged builds.

The visible header remains exactly **ChatGPT** plus the dot in all these cases. A hover/focus explanation and accessible name convey, for example, “ChatGPT — connected” or “ChatGPT — needs attention.” The dialog supplies visible text, so color is not the sole means of understanding status. Use semantic status colors with contrast in light/dark/high-contrast modes, a full button hit area, and a nonanimated dot.

## 4. Automatic connection preparation

### Responsibility and triggers

Add one bounded preparation operation to the existing main AI service/direct-session owner, exposed through narrow typed IPC when the renderer needs to request it. It is account maintenance, separate from `ai.status` and from inference. Proposed names such as `prepareConnection` are implementation names, not user-facing labels.

Run it once per app launch for the selected saved account, after successful explicit sign-in/reauthorization/account selection, and for an explicit **Try again**. Coalesce simultaneous requests for the same account generation. Opening the modal, rendering another panel, switching projects, or polling status must not start new preparation work.

1. Read the saved selected account from protected storage and check route/storage prerequisites.
2. If there is no saved authorized identity/credential to prepare, or its credential state is unresolved, stop with a Connect/Reconnect or protection state. An expired access token with a safely renewable refresh token proceeds to renewal. Do not register an account or open a browser automatically.
3. If renewal is needed and permitted, use the existing serialized renewal path. Respect `earliestRefreshAt`, missing refresh tokens, pending rotations, and invalidation. Never reuse an uncertain rotating token.
4. When authorized and idle, request the selected account's model catalog through the existing transport.
5. Restore or initialize the model selection according to the policy below, then publish authoritative connection health.
6. If the sequence cannot finish, publish one actionable outcome. Keep writing available and offer an explicit retry where appropriate.

Reuse existing transport deadlines and define a finite overall preparation deadline so sequential work cannot leave startup in an unbounded “checking” state. A timeout must settle through the account owner and retain any uncertain credential state. There is no automatic retry loop, synthetic inference, billing fallback, or background account switching.

Preparation must respect active requests, pending protection, close/update, suspend, and lost-renderer ownership. Busy work can defer preparation once until the existing owner settles; every status tick must not enqueue another attempt. Cancellation, account replacement, or shutdown makes a previous preparation generation stale. An old result cannot overwrite the newer account's status/model.

### Model preference and initial default

Persist a small account-specific model preference under the existing main-owned encrypted AI storage, separate from the exact v1 credential format. Bind it to the stable local account/registration identity, never the display email or project. Suggested new record: `chatgpt-plan-preferences-v1.json`, strictly bounded to known saved accounts and valid model IDs.

Use this order:

1. Restore the remembered model if it is in the fresh supported catalog.
2. With no remembered choice, use a unique genuine provider default if the adapter actually supplies one.
3. With no such signal, choose the first supported visible text entry in the provider's returned order as Collie's initial selection. This is a proposed product default, not a claim that the provider recommends that model. Display it under **Model** so the user can change it.
4. If a remembered model has disappeared or been refused, stay yellow and ask the user to choose a replacement. Do not silently substitute a different model for an established choice or reviewed request.
5. If the catalog is empty, show a concise unavailable state and retry path; never invent a model ID.

Successful refresh preserves a still-valid choice. Switching accounts restores that account's own preference after fresh discovery. Disconnect clears usable session/catalog state without selecting a different saved account. Reconnecting the same registration can restore its preference after validation.

A model change invalidates existing reviews through the existing review revision mechanism while retaining their prompts, context, history, and exact submitted operations. A preference write failure retains the intended selection/candidate and offers a local save retry; repeating inference or sign-in is not a persistence repair. Missing preference data starts normally; malformed data does not erase credentials or silently replace an established choice.

Only account/model metadata is exchanged during preparation. Manuscript text, project titles/descriptions, conversation input, and prior results remain outside this operation. Existing per-request review and account spending policy continue to apply.

## 5. Shared connection dialog and startup behavior

### Normal dialog

Use one app-level dialog host within the existing providers, outside routed/retained presentation regions. Keep the workspace and draft owners mounted underneath it. The header, Settings connection entry, and contextual connection actions open this same host.

The first view contains:

1. A short title: **Connect ChatGPT**, **ChatGPT needs attention**, or **ChatGPT is connected**.
2. One plain-language explanation and, when applicable, the selected account.
3. One primary action appropriate to the actual state: Connect, Reconnect, Try again, Choose model, or Done. Put secondary account controls in **Manage account**.
4. **Not now** while attention is needed, plus the standard close control.
5. **Don't show this automatically again**, with a short note that ChatGPT in the header always reopens it.
6. Collapsed **Model**, **Manage account**, and **Connection details** as applicable. Automatically reveal the relevant section when it contains the action needed to proceed.

Keep a brief useful privacy/account-use explanation at the point of connecting. Keep the existing meaningful spending disclosure reachable and clear before user-requested AI use. Avoid repeating full policy paragraphs and capability lists on each surface.

The common disconnected/connected states should fit in a normal desktop dialog without a multi-screen document. On narrow windows or large text/zoom, allow a constrained scroll area with usable actions; do not truncate important actions or errors.

Browser progress, cancellation, account switching, and disconnect remain real service actions. Closing the dialog never implies cancelling those actions. A compact global notice provides **Open ChatGPT** and, during sign-in, a separate **Cancel sign-in**. Main's native close handling still settles pending work independently.

Keep disconnect confirmation, preferably as a confirmation view within the same dialog rather than competing nested modals. Disable conflicting actions while an outcome is uncertain, and reconcile through local status. Do not disable presentation dismissal merely because a request is pending.

On successful connection, show the short connected state with **Done** and turn the header green. Do not abruptly navigate or steal focus. If the user already dismissed the dialog, completion stays in the header/appropriate notice and does not reopen it.

### Prompt preference

Use a versioned, bounded app-profile record such as `collie.chatgpt-prompt.v1` containing only `{ version: 1, suppressAutomatic: boolean }`. This preference belongs to the device/profile, applies across all projects/accounts, and never travels in `.collie` files.

- Closing without checking the box dismisses for the current app launch. It may appear on a later launch if attention is still needed.
- Checking the box saves suppression immediately; the checkbox must also reflect and permit changing it when opened manually.
- Re-enable automatic prompting through the same dialog or the Settings connection summary. Changing this preference does not immediately reopen a just-dismissed dialog.
- Suppression controls presentation only. It does not disconnect the account, disable status updates, disable maintenance for an existing account, or dismiss independent storage/AI work warnings.
- If saving the choice fails, respect dismissal for the current launch and show “This choice couldn't be remembered.” Do not claim future suppression was saved. Keep an in-memory suppression value so repeated renders cannot reopen the dialog.
- If the record cannot be read, keep the app usable and explain the preference issue in the dialog; do not delete unrelated profile/setup data.

### Launch sequence

1. Mount the existing workspace/AI owners and start normal local initialization. Header status is yellow while unknown.
2. Resolve the ordinary destination using the current startup rules. Do not delay project loading behind a network request or reset the user's location to setup/Settings.
3. Load the prompt preference and request the bounded preparation operation for an existing selected account. First-time users with no account go directly to the disconnected outcome.
4. If green, continue without a modal. If attention is needed and prompting is allowed, open once at the first safe point over the resolved destination.
5. Defer the automatic modal behind required storage-location/recovery actions, existing dialogs/native close handling, and active IME composition. Recheck status and suppression before opening; discard a queued prompt if the connection has become healthy.
6. Closing or completing the modal leaves the same destination visible. Project changes, five-second polls, browser-focus returns, and later transient state changes do not reopen it in that launch.

Use an app-lifetime prompt/preparation marker owned outside remountable panels; expose a main-lifetime identity or acknowledgment if necessary so a renderer recovery does not count as a new app launch. A delayed startup result must not interrupt a user already handling another modal or composing text. After startup, a new connection problem updates the dot and relevant notices; the user can open it manually. The persistent suppression preference takes precedence even for a future hard connection error.

Focus rules must cover the existing `RetainedRegion` startup focus behavior as well as the connection controller's OAuth focus restoration. An underlying route finishing initialization cannot pull focus out of the modal. Closing returns focus to the invoking control if still visible/enabled, otherwise the current destination's safe heading. Preserve manuscript selection, undo history, form buffers, and IME composition.

## 6. Two-step project creation and natural editing access

AI sign-in, model setup, and account eligibility have no role in the project-creation state machine. The two visible steps are **Project type** and **Project details**. Creating and recovering a creation request remain legitimate internal progress states, not a third connection page.

### Access behavior

| Current access                                                              | Creation behavior                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Paid access, or the exact created project is already editable               | Open writing directly. No designation prompt.                                                                                                                                                                                                                                                                                                |
| Free access with no designated personal project                             | The create action also requests designation of that exact created project, after its receipt is known. Confirm the resulting access before enabling editing. No separate permission-to-write button.                                                                                                                                         |
| Another project currently uses the free editing slot                        | On the details step, explain once: “Creating this project will make it your free writing project. Your other projects will remain available to read and export.” Use **Create and write here** as the deliberate action. Protect pending work and switch only after the new project is confirmed. Back/Cancel preserves the existing choice. |
| Access cannot be read, protection fails, or the choice changed concurrently | Keep the created project/receipt and show a short recovery action. Do not claim it is editable or create it again. Reading/recovery stays available.                                                                                                                                                                                         |
| Resuming an older, already-created setup with another free project          | Do not invent prior consent to switch. Offer a concise **Write in this project** action explaining the switch, or **Open for reading**. This is a recovery exception, not a new third step for normal creation.                                                                                                                              |

The proposed **Create and write here** behavior keeps the existing one-free-editable-project rule. Removing that rule would be a separate product decision. Connecting ChatGPT never changes Collie entitlement.

### Persistence and transition requirements

- Keep exact create request identities and receipts. Creation, designation, opening, and clearing setup are a sequence with independently confirmed outcomes; they are not an assumed atomic operation.
- Change the relevant controller operations to return explicit results so the wizard can distinguish creation success, access success, opening success, and retained recovery.
- Introduce a strict setup v2 record for the new internal completion/access state and any captured editing intent. Read v1 alongside it, preserve the original until a replacement is successfully stored, and document restart behavior. Use the new record preferentially when valid; an unreadable new record must not silently resurrect an older conflicting operation.
- A v1 `creating` record replays the original create operation. A v1 `connection` receipt resolves the already-created project. A v1 `details` record with a receipt also remains an existing project. None starts a new project identity or reopens AI setup.
- Retire the active legacy key only after the replacement record is saved. On completion, clear any superseded active v1 key before removing the completed v2 record, so a partial cleanup cannot resurrect the old AI step. Retain the completed v2 record and explain cleanup failure if that order cannot finish.
- Capture the observed free-project scope/access revision with an explicit switch decision. If access changes before designation, reconcile instead of silently overriding a newer choice. Compare IDs, not titles.
- Route designation through the existing trusted access service and its protection/transition checks. Refactor narrowly if needed; do not enable editing through renderer state alone or globally designate every opened/read-only project.
- After an uncertain designation reply, read authoritative access for the exact scope before another mutation. If already designated, finish opening; if the previous access changed, explain and require a fresh choice.
- Clear completed setup only after the destination and required access outcome are confirmed. If cleanup fails, retain a recoverable completed state rather than creating a duplicate on restart.
- Retain first Save's native destination picker, explicit Save semantics, local recovery, and all existing draft protection. A ChatGPT modal is not a save/protection barrier.

## 7. Implementation stages

**UI01 is implementation complete — awaiting user testing; UI02 is implementation complete — awaiting user testing; UI03 is implementation complete — awaiting user testing; UI04 is implementation complete — awaiting user testing; UI05 is implementation complete — awaiting user testing; UI06 is implementation complete — awaiting user testing.** Each stage includes a concrete user-visible boundary and ends with its own implementation record, command outcomes, and user-owned manual guide. Do not auto-advance after a handoff. Manual cases below are acceptance targets, not results already obtained.

| Stage | Deliverable                                                         | Prerequisite |
| ----- | ------------------------------------------------------------------- | ------------ |
| UI01  | Authoritative connection health and compact header                  | This plan    |
| UI02  | Automatic connection preparation and remembered model               | UI01         |
| UI03  | One compact, dismissible ChatGPT dialog                             | UI01–UI02    |
| UI04  | Startup prompting and persistent dismissal                          | UI02–UI03    |
| UI05  | Two-step project creation with integrated editing access            | UI03–UI04    |
| UI06  | Consistent contextual UI, documentation, and final user walkthrough | UI01–UI05    |

### UI01 — Define health once and simplify the header

**Status: implementation complete — awaiting user testing (October 5, 2026).** Format, lint, and node/web typecheck passed without warnings or errors. See the [record and health decisions](docs/validation/ui-improvements-UI01.md) and [manual guide](docs/manual-testing/ui-improvements-UI01.md). The header still opens Settings; no UI02–UI06 behavior was activated.

**Outcome:** The header shows only ChatGPT plus an accurate dot, without changing provider behavior yet.

Implementation:

1. Add the connection-health contract from section 3, with explicit reasons/progress/next-action categories where needed. Derive it in main from the actual route/account/catalog state, separately from request availability.
2. Update every exact status validator and consumer in shared, preload, and main together. Do not extend portable attempt reasons merely for UI presentation.
3. Replace the global indicator's long label with ChatGPT plus a semantic status dot. Add accessible state text and a focus/hover explanation. Preserve the writing-companion toggle's existing function; the same component currently serves both header and companion.
4. Keep the existing Settings destination as the temporary click target in this stage. UI03 changes it to the shared modal. Do not claim the full requested dialog behavior is delivered at UI01.
5. Document health precedence and reason-clearing rules, including healthy active work, unavailable proofreading, disconnected/expired sessions, and failed status reads.

Primary files: [shared/ai.ts](src/shared/ai.ts), [shared/ai-direct.ts](src/shared/ai-direct.ts), [shared/ai-route.ts](src/shared/ai-route.ts), [main/ai/service.ts](src/main/ai/service.ts), [main/ai/direct-session.ts](src/main/ai/direct-session.ts), [preload/ai.ts](src/preload/ai.ts), [AiProviderIndicator.tsx](src/renderer/src/features/ai-connections/AiProviderIndicator.tsx), [connection-copy.ts](src/renderer/src/features/ai-connections/connection-copy.ts), [AiConnections.module.css](src/renderer/src/features/ai-connections/AiConnections.module.css), [App.tsx](src/renderer/src/App.tsx).

User-owned acceptance:

1. Open Collie and inspect the header: only ChatGPT and the dot occupy this control; focus/hover explains its meaning.
2. Observe naturally available disconnected, incomplete, and ready states: colors follow section 3 without misleading “AI unavailable” header text.
3. Use a ready connection for a reviewed request if available: ordinary response progress does not make the connection look broken. Unsupported proofreading remains honestly unavailable in its own feature.
4. Use keyboard navigation, dark/light modes, and enlarged UI: the button and state remain understandable and usable.

### UI02 — Complete routine setup automatically

**Status: implementation complete — awaiting user testing (October 5, 2026).** Format, lint, and node/web typecheck passed without warnings or errors. See the [record](docs/validation/ui-improvements-UI02.md) and [manual guide](docs/manual-testing/ui-improvements-UI02.md). Automatic preparation follows explicit sign-in, reauthorization, account selection, and session renewal. Startup preparation remains UI04.

**Outcome:** A successful connection prepares models automatically and remembers a valid account-specific choice.

Implementation:

1. Implement the main-owned preparation sequence, generation checks, coalescing, finite deadlines, and narrow IPC. Keep `ai.status` a local read.
2. Trigger preparation after confirmed connection/reauthorization/account selection. Expose one retry action through the existing connection surface; launch triggering belongs to UI04.
3. Add the bounded encrypted model preference record and its strict reader/writer. Preserve v1 credentials and registration identities. Implement the explicit first-selection policy and unavailable-preference behavior.
4. Preserve selection on catalog refresh when still valid. Publish health without losing known authorization/usage failures, and preserve existing review invalidation when account/model authority changes.
5. Keep renewal/protection/unknown-outcome safeguards, close/suspend settlement, and account-action exclusion. Update UI progress so the old panel can show “Setting up ChatGPT…” without a required refresh-and-pick sequence.

Primary files: [direct-session.ts](src/main/ai/direct-session.ts), [service.ts](src/main/ai/service.ts), [storage.ts](src/main/ai/storage.ts), [direct-credentials.ts](src/main/ai/direct-credentials.ts) for compatibility reference, new bounded preference record module, [main/ai/ipc.ts](src/main/ai/ipc.ts), [shared/ai.ts](src/shared/ai.ts), [shared/ai-catalog.ts](src/shared/ai-catalog.ts), [preload/ai.ts](src/preload/ai.ts), [connectionState.ts](src/renderer/src/features/ai-connections/connectionState.ts), [AiModelSelection.tsx](src/renderer/src/features/ai-connections/AiModelSelection.tsx).

User-owned acceptance:

1. Connect an eligible account: Collie completes model setup without a separate Refresh models action and reaches green when prerequisites succeed.
2. Choose another available model and refresh: the choice remains selected. When the app is restarted and preparation is explicitly requested at this intermediate stage, the valid remembered choice returns.
3. If multiple accounts are available, switch between them: each restores its own model preference without moving project history or resending a request.
4. With a network interruption encountered during metadata setup, observe a concise retry state and retained account. Reconnect only when the actual authorization state requires it.
5. Review a request, then change its model: input stays present and the request requires review again before sending.

### UI03 — Introduce the shared ChatGPT dialog

**Status: implementation complete — awaiting user testing (October 5, 2026).** Format, lint, and node/web typecheck passed without warnings or errors. See the [record](docs/validation/ui-improvements-UI03.md) and [manual guide](docs/manual-testing/ui-improvements-UI03.md). The shared dialog opens explicitly over the current destination. Startup preparation/prompting and suppression remain UI04.

**Outcome:** Clicking ChatGPT opens a short, actionable modal from any destination.

Implementation:

1. Add a single app-level dialog host and presentation controller beneath the existing connection provider. Reuse `AppDialog` and scoped semantic Mantine styling.
2. Implement the normal/progress/problem/connected views from section 5 with one relevant primary action. Move model/account/technical controls into purposeful disclosures. The suppression checkbox and automatic prompting arrive together in UI04; do not display a nonfunctional checkbox in UI03.
3. Change the header to open the dialog without navigation. Give Settings a connection summary and **Manage ChatGPT** entry; remove its duplicate full account panel. Keep its existing typed destination valid for stored/in-flight navigation targets.
4. Update `showOrigin`, origin focus capture, and connection notices to reopen the same modal. Keep real action ownership and exact cancellation identities alive after dismissal.
5. Keep disconnect confirmation and saved-account management available. Ensure dismissal does not perform cancellation, disconnect, credential deletion, or project navigation.
6. Coordinate dialog focus with retained-region focus and browser-return focus. Keep the modal presentation boundary inside its surviving state owner, following CA02; do not wrap/unmount an editor host.

Primary files: new `features/ai-connections/ChatGptConnectionDialog.tsx` and presentation owner, [App.tsx](src/renderer/src/App.tsx), [AiConnectionsProvider.tsx](src/renderer/src/features/ai-connections/AiConnectionsProvider.tsx), [connectionState.ts](src/renderer/src/features/ai-connections/connectionState.ts), [AiConnectionPanel.tsx](src/renderer/src/features/ai-connections/AiConnectionPanel.tsx), [AiConnectionNotice.tsx](src/renderer/src/features/ai-connections/AiConnectionNotice.tsx), [DirectConnectionProgress.tsx](src/renderer/src/features/ai-connections/DirectConnectionProgress.tsx), [ConnectionSettings.tsx](src/renderer/src/features/settings/ConnectionSettings.tsx), and the existing dialog/retained-focus owners where necessary.

User-owned acceptance:

1. Open ChatGPT from Projects, writing, research, and Settings: the same dialog appears over the same destination.
2. Close with Not now, Escape, outside click, and the close button: the current work stays present and keyboard focus returns appropriately.
3. Start browser sign-in, hide the dialog, then return: progress remains accessible; hiding did not cancel, and success does not reopen the modal.
4. Open account/model/details controls: advanced functions remain available without dominating the first view. Disconnect still asks for confirmation.
5. Open and dismiss the dialog while editing a disposable project: text, selection where applicable, undo history, and unsaved forms remain intact.

### UI04 — Add startup prompting and remembered dismissal

**Status: implementation complete — awaiting user testing (October 5, 2026).** See the [record](docs/validation/ui-improvements-UI04.md) and [manual guide](docs/manual-testing/ui-improvements-UI04.md). Startup preparation and prompt reservation are owned by the main process. The shared dialog remembers automatic-prompt suppression in the local app profile. Ordinary project restoration remains independent.

**Outcome:** Ready users go straight to work; users needing attention receive one dismissible startup prompt unless they opted out.

Implementation:

1. Add the profile-scoped prompt preference with strict parsing, write-failure feedback, and in-memory session dismissal.
2. Integrate startup preparation with the existing storage and destination initialization. Do not replace `resolveInitialDestination()` or make project restoration await network work.
3. Implement once-per-launch prompting, waiting behind higher-priority recovery/dialog/composition states, and rechecking before a delayed prompt opens.
4. Ensure renderer remount/recovery, focus, polling, project changes, and status events cannot repeatedly prepare or prompt. Keep app-lifetime acknowledgment separate from persistent suppression.
5. Add the suppression checkbox to the shared modal and a clear way to reverse it. Respect suppression for disconnected, expired, and hard-error states while keeping the header actionable.

Primary files: new prompt-preference and startup-coordinator modules in `features/ai-connections/`, the shared dialog/provider, [App.tsx](src/renderer/src/App.tsx), [useWorkspaceController.ts](src/renderer/src/features/workspace/useWorkspaceController.ts), and main/shared status or startup-operation ownership for the app-lifetime marker.

User-owned acceptance:

1. Open with a ready saved connection: routine setup finishes, the dot turns green, and the normal last project/library/setup destination remains without a prompt.
2. Open without a connection: one dialog offers Connect and Not now. Dismiss it, then visit several projects/settings views: it does not reopen in that launch.
3. Reopen the app with attention still needed and no suppression: the prompt returns once. Check Don't show this automatically again, close, and reopen: it stays suppressed.
4. Click ChatGPT after suppressing: the dialog still opens. Re-enable prompting and verify a later launch follows the preference.
5. Open offline with a saved account: local projects stay usable, the account is retained, and the connection has a recoverable status. A successful explicit retry can restore green.
6. When a genuine storage/recovery prerequisite is present, it remains actionable before the connection prompt; resolving it does not produce stacked or repeated dialogs.

### UI05 — Remove AI from project creation and open directly for writing

**Status: implementation complete — awaiting user testing (October 5, 2026).** Format, lint, and node/web typecheck passed without warnings or errors. See the [record](docs/validation/ui-improvements-UI05.md), [setup v2 format](docs/formats/project-setup-v2.md), and [manual guide](docs/manual-testing/ui-improvements-UI05.md). Creation now has two visible steps and integrates confirmed editing access and opening. Existing requests/receipts remain recoverable, including v1 records; no AI setup page remains in the wizard.

**Outcome:** Project creation has two visible steps and no routine permission-to-edit chore.

Implementation:

1. Replace the wizard's `connection` presentation and step labels with the two-step journey. Successful create/access/open completion goes directly to writing.
2. Add the setup v2 compatibility reader/writer and retained conversion from v1 as specified in section 6. Preserve exact create requests, receipts, details, and author preference.
3. Return explicit completion/blocked outcomes from setup/access controller helpers. Reconcile a refreshed access snapshot with the exact created project.
4. Implement first-free-project designation as part of creation; skip it when already editable. For an actual switch, display the consequence in details and make **Create and write here** the intentional action.
5. Preserve previous drafts before switching, enforce main access revision checks, and retain a created receipt if designation/opening fails. Keep recovery actions short and separate from ChatGPT.
6. Handle old committed setup records without duplicates, lost projects, forced sign-in, or an invented prior switch decision. Keep archive/missing-project recovery explicit.

Primary files: [OnboardingWizard.tsx](src/renderer/src/features/onboarding/OnboardingWizard.tsx), [setup-draft.ts](src/renderer/src/features/onboarding/setup-draft.ts), [OnboardingWizard.module.css](src/renderer/src/features/onboarding/OnboardingWizard.module.css), [useWorkspaceController.ts](src/renderer/src/features/workspace/useWorkspaceController.ts), [shared/access.ts](src/shared/access.ts), [main/entitlements/service.ts](src/main/entitlements/service.ts) only where the trusted transition needs a bounded change, and existing startup/setup consumers.

User-owned acceptance:

1. Create a disposable first personal project: see two steps, then an editable writing workspace without AI setup or a separate designation button.
2. Create another disposable project under free access: see the switch consequence before confirming; the new project becomes editable and the previous writing remains available to read/export.
3. Under paid access, create another project: no free-project switching controls appear.
4. Cancel from details: no project is created and the existing editing choice remains. With unsaved work in the previous project, protection/explicit-draft requirements still apply before replacement.
5. If an older unfinished setup exists naturally, resume it: the original project/request is retained, no duplicate is created, and the old ChatGPT step does not return. Do not manufacture or corrupt records to create this case.
6. Save the new disposable project for the first time: the native destination picker still appears; later normal close retains local writing under the current Save/recovery contract.

### UI06 — Make remaining entry points consistent and finish documentation

**Status: implementation complete — awaiting user testing (October 5, 2026).** Format, lint, and node/web typecheck passed without warnings or errors. See the [record](docs/validation/ui-improvements-UI06.md) and [combined UI01–UI06 walkthrough](docs/manual-testing/ui-improvements-UI06.md). Contextual AI introductions are concise; account management uses one shared dialog and operational recovery belongs to AI work. Current navigation/design guidance and historical supersession notices are updated. No runtime acceptance is claimed.

**Outcome:** The simplified account experience is consistent throughout the app and documented without stale setup instructions.

Implementation:

1. Simplify [AiRequestConnection.tsx](src/renderer/src/features/ai-connections/AiRequestConnection.tsx) to the relevant feature state and **Manage ChatGPT** action. Remove duplicate full connection/model/progress/capacity explanations from conversation/proofreading introductions. Keep their feature-specific limits and reviewed-request controls.
2. Keep the writing AI button opening its companion; connection management within it opens the shared modal. Do not replace conversation creation/navigation with account management.
3. Keep operational capacity/protection in [AiWorkNotice.tsx](src/renderer/src/features/ai/AiWorkNotice.tsx) and its contextual details. Avoid routine “0 of 64” infrastructure displays in the basic connection path, while preserving actual recovery actions.
4. Update Settings, tutorial/help, connection notices, navigation labels, and old “Continue without AI”/“Return to AI step” copy in the changed journey. Preserve useful reading-only/access explanations where genuinely needed.
5. Update current design/navigation guidance, active plan checkpoints, and format documentation. Mark old I05/I11/DP01 manual-setup requirements as superseded for the changed behavior; preserve dated evidence rather than rewriting historical results.
6. Produce one combined user walkthrough and record any remaining unobserved cases. Do not broaden into unrelated layout, export, provider, or release work.

Primary files: contextual AI components, [WritingWorkspace.tsx](src/renderer/src/features/workspace/WritingWorkspace.tsx), [ConnectionSettings.tsx](src/renderer/src/features/settings/ConnectionSettings.tsx), [WorkspaceNavigation.tsx](src/renderer/src/features/workspace/WorkspaceNavigation.tsx), [TutorialPanel.tsx](src/renderer/src/features/projects/TutorialPanel.tsx), [docs/design/app-experience.md](docs/design/app-experience.md), [docs/design/local-navigation.md](docs/design/local-navigation.md), this plan, applicable format/decision records, and `AGENTS.md` checkpoints.

User-owned acceptance:

1. Start the app, connect or dismiss, create a project, and begin writing: there is one account setup experience and no third creation step.
2. Create/open another project: the same selected account/model applies without repeated sign-in, and each project's own drafts/history remain with it.
3. Open ChatGPT from the header, Settings, and a conversation: all reach the same dialog and describe the same state.
4. Use local writing while disconnected or with the modal suppressed: editing follows Collie access, and Save/export/recovery remain available as before.
5. Review and send synthetic content if the current account permits it: the selected model/account is used, existing review/protection behavior remains, and no setup action has submitted a request on its own.
6. Check keyboard operation, screen-reader status, narrow windows, enlarged text, dark/light/high-contrast modes, and IME use through this journey; report actual observations separately from implementation completion.

## 8. Boundaries, records, and completion policy

### Data and behavior to preserve

- One main-owned account/credential lifecycle; no second login store, copied Codex credentials, renderer tokens, API key, hosted proxy, automatic purchase, or billing fallback.
- Stable account registrations, exact OAuth attempt identities, protected rotation candidates, honest local/remote disconnect results, and bounded sanitized error details.
- Existing request review, provider/model provenance, exact operation replay, output protection, retained uncertain results, and project-specific history. Automatic setup cannot resend inference or apply writing changes.
- Persistent workspace/editor/research/draft owners. Modal visibility does not reset content, cancel work, reload the renderer, or bypass close/update/suspend recovery.
- Current free/paid/sample access rules and native selected-file Save/local recovery contracts. A green connection never grants editing access.
- Mantine, static CSP, scoped semantic CSS, theme tokens, required attribution/license behavior, and existing packaged/commercial restrictions.

Expected persistence changes are limited to the new main-owned model preference, the prompt-suppression preference, and the setup v2 compatibility path. No project SQL, AST, archive, compilation, conversation-attempt, or operation-journal migration is expected. The current referenced baseline is SQL/minimum reader 13, AST/archive 1, compilation 3; confirm the current checkout when implementing rather than allocating against an older plan. Any necessary additional persistent change must name all readers/writers and retain prior data.

### Stage handoff requirements

For each implemented code stage:

1. Inspect the current package scripts and ignore scope. Run `npm run format`, then `npm run lint`, then `npm run typecheck`. Fix all surfaced issues, including pre-existing warnings/errors, and rerun affected commands until all three are clean on the final code. Preserve vendored/generated files and historical tests; do not suppress diagnostics or weaken rules.
2. Do not add/modify/run automated tests, harnesses, fixtures, probes, builds, app launches, browser automation, screenshots, audits, or other prohibited verification. Runtime/manual acceptance belongs to Josh. Source inspection is not a passed test.
3. Add `docs/validation/ui-improvements-UI0N.md` and `docs/manual-testing/ui-improvements-UI0N.md` with actual changed paths, data compatibility, command results, known limitations, and ordered manual actions paired with visible outcomes. Use actual stage numbers.
4. Include setup/launch instructions for the user only. The current development entry point is `npm run dev`; give it in the manual guide when relevant, without running it. Use disposable projects/copies for access and data-risk cases. Conditional account/error scenarios remain unobserved if they cannot be reached naturally; do not require fault injection.
5. Mark **implementation complete — awaiting user testing** only after implementation and required checks finish. Record user-confirmed acceptance separately, then stop for results before another stage.

The original planning task changed documentation only and required no format/lint/typecheck execution. The subsequently requested UI01–UI06 implementations ran all three required scripts successfully. No automated tests, app launches, connection actions, account inspection, or runtime acceptance were performed. The existing release NO-GO remains separate from this UI plan.

### Progress ledger

| Item                        | Implementation                                              | Required code checks             | User acceptance       |
| --------------------------- | ----------------------------------------------------------- | -------------------------------- | --------------------- |
| Source review and this plan | Document delivered                                          | Not required: documentation only | Awaiting plan review  |
| UI01                        | Complete; [record](docs/validation/ui-improvements-UI01.md) | Format, lint, typecheck clean    | Awaiting user testing |
| UI02                        | Complete; [record](docs/validation/ui-improvements-UI02.md) | Format, lint, typecheck clean    | Awaiting user testing |
| UI03                        | Complete; [record](docs/validation/ui-improvements-UI03.md) | Format, lint, typecheck clean    | Awaiting user testing |
| UI04                        | Complete; [record](docs/validation/ui-improvements-UI04.md) | Format, lint, typecheck clean    | Awaiting user testing |
| UI05                        | Complete; [record](docs/validation/ui-improvements-UI05.md) | Format, lint, typecheck clean    | Awaiting user testing |
| UI06                        | Complete; [record](docs/validation/ui-improvements-UI06.md) | Format, lint, typecheck clean    | Awaiting user testing |

Additional requested improvements will be appended from UI07 onward, with their own scope and dependencies.
