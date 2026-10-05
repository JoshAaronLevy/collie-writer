# I11 — AI connection presentation and account ownership

> UI01–UI06 supersession, October 5, 2026: this dated record is preserved as history. For current setup/account actions use the [combined UI walkthrough](../manual-testing/ui-improvements-UI06.md). Creation now has two steps and integrates confirmed editing access. ChatGPT setup is one app-wide dialog, models prepare automatically, and capacity recovery belongs to AI work. The older third-step/manual-refresh/designation instructions below are superseded only for that changed behavior; provider constraints, request review/protection, and unobserved results remain.

October 2, 2026. **Implementation complete — awaiting user testing.** This is the local UI implementation over I10's delivered service. Real provider sign-in/inference remain unavailable: registration is unset, funding and isolation enforcement are incomplete, and packaged runtime delivery is pending. No approval, account, AI readiness or native result is implied.

## One persistent owner

`features/ai-connections/AiConnectionsProvider.tsx` is mounted inside the persistent workspace session, above routed content. Setup, Settings and the writing companion share one account snapshot, subscription, pending command and exact sign-in attempt. Panels do not own authentication lifetimes. Hiding a panel does not cancel a connection, discard its result, replace the project or erase a draft.

The owner reads only sanitized local `aiStatus` when the working folder is available, on browser/app focus, on explicit Check status and at three-second intervals during sign-in. Main still owns OAuth, default-browser launch, callback correlation, protected credentials and durable session changes. These reads cannot refresh tokens, launch the runtime, list models or send an inference. Tokens, subjects, client/workspace identities and raw provider failures never enter renderer fields or storage. Account labels and local account UUIDs exist in renderer memory only; no new localStorage record was added.

Actions come from main's new `actions` permissions rather than an inferred green connection state. Main also attaches a monotonic process-local status `sequence`; shared/preload validation includes both fields. Older event/RPC snapshots cannot overwrite newer status. A request remains serial in the renderer while main retains its own independent enforcement. A lost action reply prompts status reconciliation and cannot automatically start another sign-in. Cancellation targets the original UUID even while Connect is still pending; main's existing cancellation tombstone stops not-yet-opened attempts. An explicit fresh sign-in gets a new UUID.

## Product surfaces

- The third setup step replaces its old unavailable paragraph with the actual ChatGPT/Codex connection panel. The exact committed project receipt, details, Back behavior, first-Save semantics and designation action are retained. Continue without AI opens the same project; if editing is unavailable it opens for reading without changing the free designation. Setup fields and project content are not sign-in inputs.
- Settings → AI connections presents the same service-derived connection, account actions and expandable details. Its return action uses the existing guarded Back/return-to-work/library flow. Collie access is explicitly separate.
- Write's AI control shows a compact provider/availability label. Its optional companion shares the connection panel and a link to Settings. There is no composer, greeting, proofreading action or validation inference. Conversations/proposals remain I12/I13.
- Account progress, failures and unknown outcomes remain globally actionable when a panel is hidden. Return to connection uses typed guarded navigation. It never automatically switches projects or reopens completed setup. Account completion does not hijack the user's later destination.

The only advertised adapter is I10's actual OpenAI/Codex implementation. Its card honestly remains unavailable; no nominal Claude/Grok cards, invented accounts, model choices or browser success are shown. Public product names are plain identifying text with a locally bundled generic account icon; no unapproved provider endorsement or branded asset is added.

## Authentication, eligibility and accounts

Browser sign-in, waiting/cancel/retry, expired-session reconnection, explicit renewal, account choice and disconnect call actual I10 methods. New Connect is enabled only when main permits it; missing route/registration and protected-storage problems are explained. Funding uncertainty does not get confused with authentication failure: a route may eventually permit authentication while generation stays disabled.

The current service can never report AI ready. UI labels distinguish loading local status, sign-in, renewal, disconnect, signed out, expired, signed in with AI unavailable, and service-reported quota/funding failures. The detail disclosure separately shows sign-in access, commercial activation, included usage, runtime and unresolved model/workspace authorization. I10 must establish authoritative eligibility/ready semantics before that positive state can be displayed; I11 does not manufacture it from OAuth or a model catalog. Reconciliation/renewal does not claim to check subscription funding. No model lookup occurs during sign-in.

`ai.select` is a necessary bounded I11 integration addition to I10's owner. It accepts the exact existing connection ID, validates the trusted frame and configured client mapping, requires an idle protected service, persists the selected identity and invalidates prepared context grants. It sends no network request and does not establish eligibility. An already signed-in selected account is reused automatically as a summary in new-project setup, with no repeated login. Selecting another saved signed-in account is explicit. Expired/signed-out records use Reconnect. Main's existing eight-account bound remains visible; disconnect retains account mapping rather than silently deleting it.

Disconnect uses a titled Mantine confirmation through the existing CSP-compatible `AppDialog`. While the command is pending its dialog cannot imply cancellation of the sign-out. A local sign-out and confirmed/unconfirmed remote revocation are separately worded. No writing, saved transcript or project is deleted. Unknown results offer Check status. Close/update still use I10 and I03's main and draft protections.

## Focus, styles and compatibility

Authentication completion restores the original control or its panel heading only when that exact destination is still active, the surface is visible, focus has not moved elsewhere and no IME composition is active. A scheduled focus return rechecks the same conditions. Account actions cannot focus an inert retained region. Typed navigation continues using existing retained-region/error focus rules; editor instances and undo state are preserved.

`AiConnections.module.css` owns all new semantic classes, shared at the smallest common feature owner. Mantine controls/dialogs and static Collie tokens supply themes/contrast/motion. Responsive wrapping stays in scoped CSS; no generated stylesheet, remote image/font, utility composition, root CSS rule or CSP exception was introduced.

SQL/minimum reader **10**, AST/archive **1**, frozen compilation **3** remain unchanged. No dependency, migration, portable credential field, worker mutation, endpoint or runtime activation changed. New status fields and named account-selection IPC are transient contracts. Credentials continue using I10's encrypted format; only its existing selected-account value changes. No private/user project data was read.

All runtime, native browser/credential, cancellation/reconnection, keyboard/screen-reader, focus/IME, narrow/200%/theme/CSP and account recovery behavior is unobserved. No tests/checks/builds/app/browser/SDK launch, sign-in, inference or external action occurred. The [manual guide](../manual-testing/improvement-I11.md) separates current available observations from conditional live-path observations. Release remains NO-GO; stop before I12.
