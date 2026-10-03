# Codex local development implementation plan

October 2, 2026.

**Status: CD01, CD02 and CD04 implementation complete — awaiting user testing; CD03 engineering partial; CD05–CD09 not started.** This document plans a real, owner-operated Codex connection for Collie Writer's unpackaged local development app. Creating or approving this plan does not implement or authorize automatically advancing through its stages. No application, runtime, sign-in, inference, build or check was run during assistant implementation. CD01's [decision](docs/decisions/codex-CD01.md), [pinned protocol map](docs/ai/codex-local-contracts.md), [compatibility record](docs/formats/codex-local-v1.md), [evidence](docs/validation/codex-CD01.md) and [manual guide](docs/manual-testing/codex-CD01.md) describe the delivered foundation. CD02's [decision](docs/decisions/codex-CD02.md), [local v2 record](docs/formats/codex-local-v2.md), [evidence](docs/validation/codex-CD02.md) and [manual guide](docs/manual-testing/codex-CD02.md) own the managed account connection milestone; runtime outcomes remain unobserved. CD03's [decision](docs/decisions/codex-CD03.md), [record](docs/validation/codex-CD03.md) and [manual guide](docs/manual-testing/codex-CD03.md) record delivered model controls/transport machinery and the unresolved tool/content-log isolation blockers.

## Outcome and owner decisions

Josh needs to open Collie locally, click a connection button, authenticate his own OpenAI/ChatGPT account in the system browser, return to Collie, and use its existing Conversations and Proofreading features with actual Codex responses. This must exercise the real app and existing durable feature adapters. A separate terminal demo, mock response, login-only screen or permanently disabled Send button does not satisfy the outcome.

The connection is **Codex-managed ChatGPT authentication for subscription access**. It is not identity-only Sign in with ChatGPT: identity-only authorization cannot perform inference. The Codex client runs locally; inference is remote and consumes the signed-in account's applicable allowance.

Josh explicitly selected the following policy while requesting this plan:

> Use normal Codex subscription behavior for my local development only; keep API-key fallback disabled.

That is a deliberate, narrowly scoped change to the earlier requirement that every development request prove included-only funding. Under this plan:

- The owner-only development route follows Josh's normal Codex/ChatGPT subscription and account spending settings. Available credits may be consumed under those settings. Collie must explain this accurately and must not label the route “guaranteed included-only,” “free,” or “no possible extra usage.”
- Collie must not supply, request, inherit or fall back to any user/company OpenAI API key, hosted proxy, shared account, alternative provider or separate billing route.
- Collie does not purchase credits, enable top-ups, change spending settings or automatically upgrade a plan. Normal account behavior is accepted; app-initiated billing changes are not.
- The commercial route retains its existing approval, registration, included-only funding, packaging and release requirements. Its registrations remain null unless authentic configuration is supplied through separately requested work.
- No domain, company email, hosted callback or merchant setup is a technical prerequisite of this local Codex login implementation. Do not make completing the commercial interest form the first coding task.
- The development connection uses Josh's own explicit browser sign-in. Do not copy the account, tokens, credentials or sessions of the assistant executing implementation work.

This plan uses **CD** stage IDs to avoid collisions with MVP stages, improvement I stages, conversation C stages, proofreading P stages and publication TE stages.

## Scope and relationship to existing plans

Implement a development-specific authentication/execution route behind the existing I10 service, adapt I11 connection presentation, and complete the required I12/I13 consumer changes. Preserve the delivered local writing, project access, storage, export, session and editor safeguards.

The initial usable milestone is the existing feature scope:

1. Conversations: submit a reviewed prompt with optional already-supported context/history; display and retain actual streamed output; stop, reopen and export saved conversations.
2. Proofreading: run en-US mechanics on a supported selection/current section; retain real structured findings; apply or ignore individual suggestions through the existing exact-target workflow.

Do not add broader proofreading modes, whole-book batching, conversation organization, source promotion, autonomous research, external browsing, shell access, Grok activation, commercial sign-in, distribution or an app-wide UI redesign. Those remain their named plans' work. Using Codex does not import the Codex app's conversations, full tool set or account history.

CD08 explicitly covers the shared operational handoff needed for repeated local development and overlaps the existing **C07** contract. It must implement or reuse that single shared owner, not introduce a second retention system. Requesting CD08 authorizes its listed handoff work; it does not authorize the other C stages. Record the overlap in both plans when implemented, without claiming that unrelated C-stage work is complete.

Current project formats are SQL/minimum reader **12**, AST/archive **1**, and frozen compilation **3**. Read the current checkout at implementation time. The intended authentication adaptation is device-local and should not change those formats unless an actual persisted consumer contract requires it.

## Official documentation and the remaining scope uncertainty

Sources consulted October 2, 2026:

| Source | What it establishes for this plan |
| --- | --- |
| [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk) and [TypeScript SDK README](https://github.com/openai/codex/blob/main/sdk/typescript/README.md) | Programmatic local Codex integration. The TypeScript SDK wraps the CLI. |
| [Codex authentication](https://learn.chatgpt.com/docs/auth) | Browser ChatGPT login, subscription authentication, credential-store choices and login-method restrictions. |
| [Codex app-server](https://learn.chatgpt.com/docs/app-server) | Account/login lifecycle, model discovery, threads, turns, streaming and interruption. Current documentation also describes per-turn output schemas. |
| [Sign in with ChatGPT quickstart](https://developers.openai.com/siwc/quickstart) | Identity-only authentication and authorized plan inference are separate capabilities. |
| [Sign in with ChatGPT client registration](https://developers.openai.com/siwc/request-client-id) | The commercial program has a separate registration/waitlist route. |
| [Codex pricing and usage](https://learn.chatgpt.com/docs/pricing) | Subscription limits and available credits are distinct from API-key billing. |

The app-server authentication documentation explicitly excludes commercial or hosted services and allows continued use by existing local/open-source applications. It does not explicitly classify a new private, owner-only POC for a future commercial product. **This plan records that uncertainty; it does not manufacture an OpenAI approval, sandbox entitlement or blanket POC exemption.** Josh has authorized planning for personal development, not asserted that OpenAI has approved commercial embedding.

CD01 must record the exact current wording and any relevant clarification for this narrowly defined use. Do independent implementation without a general commercial-approval veto. If an applicable provider rule expressly blocks the actual route, identify that rule and the affected live action; do not reinterpret a development build flag as permission. This is a specific scope question, not a requirement to recreate I01 research or wait for a public website before writing code.

Latest documentation may describe features absent from the pinned runtime. Consult the selected release's published source/types alongside these pages. Do not generate schemas by running Codex, probe account access, log in or send a sample prompt during assistant implementation.

## Current implementation and concrete gaps

This map describes source inspection, not observed runtime behavior.

| Owner | Existing behavior | Required development adaptation |
| --- | --- | --- |
| `src/main/ai/deployment.ts` | Pins Codex 0.160.0; all registered OAuth clients are null; funding/isolation methods always refuse. | Add a distinct local route policy without populating fake registrations or changing commercial gates. |
| `src/main/ai/openai-auth.ts`, `openai-http.ts` | Collie-owned, registered-client OAuth and token handling. | Retain for the commercial route. Local Codex auth must not impersonate one of these clients. |
| `src/main/ai/codex-runtime.ts` | Fresh process/profile per operation; externally supplied Responses access token; custom provider; streamed text. | Codex-managed login with persistent isolated auth ownership, fresh context per operation and route-appropriate execution. |
| `src/main/ai/runtime.ts`, `registry.ts` | Common text updates; internal Codex/Grok constructors. | Keep one Codex service with explicit internal route selection. Do not expose Grok or a generic runtime RPC. |
| `src/main/ai/storage.ts` | Encrypted v1 credentials require registered client IDs and OAuth token/scopes; encrypted operation journal. | Version local route metadata safely. Codex-managed credentials belong to their supported secure store, not counterfeit v1 token records. |
| `src/main/ai/service.ts` | Registered-account assumptions, exact prepare/start, protected operations, global 64-operation cap. | Separate authentication route, funding policy, capabilities and account lifecycle while preserving dispatch/replay protection. |
| `src/shared/ai.ts`, `src/preload/ai.ts`, `src/main/ai/ipc.ts` | Strict IPC; status permits only partial implementation/unknown funding; models permit only unverified eligibility. | Coherent route-aware status and action eligibility across all consumers. |
| `features/ai-connections/` under `src/renderer/src/` | Persistent I11 account owner and Settings/setup/companion presentation. | A visible local-development Connect action and truthful signed-in/ready/blocked/reconnect states. |
| `src/main/ai/content-service.ts` | Shared durable intent/bind/start/settle/recovery coordinator. | Reuse it for both features; bind operations to the selected local route/session policy safely. |
| `src/main/conversations/service.ts`, renderer `features/ai/conversations/` | Existing request/context/history/persistence and Send wiring. | Align capability checks, model selection, stream/error handling and local readiness. |
| `src/main/proofreading/service.ts`, renderer `features/ai/proofreading/` | Existing captures, strict JSON findings and human Apply/Ignore. | Enable actual eligible execution; preserve exact findings while separating final structured output from incidental agent text. |
| `src/main/release.ts` | Unpackaged development identity; packaged metadata handling can also return a development label. | Require `!app.isPackaged` as well as the trusted development identity. Channel text alone is insufficient. |

Renderer paths in the table are relative to `src/renderer/src/`; they are existing feature owners, not suggestions to create duplicate directories.

The TypeScript SDK is not currently a dependency. `@openai/codex` 0.160.0 is a development dependency, and the resolver currently refuses packaged execution. Conversations accept listed models differently from proofreading, whose `canSend` rejects every current `eligibility: 'unverified'` entry. Simply enabling login or removing one refusal will not deliver both features.

## Selected architecture

Use the documented **Codex app-server with Codex-managed ChatGPT login** as the initial development adapter. This choice serves the required in-app browser authentication and fits the existing transport. Do not add the TypeScript SDK merely for its name or create a parallel inference stack. If the selected SDK release later exposes all required auth/lifecycle/isolation contracts more directly, record that bounded substitution while retaining the owners below.

The intended flow is:

1. A real connection control invokes named main IPC through the existing preload bridge.
2. Main selects the owner-only development route from trusted app state.
3. A pinned local Codex process manages browser login and its isolated secure credential store.
4. Main publishes sanitized connection/model/action status to the persistent I11 owner.
5. Conversation/proofreading workers freeze and commit the reviewed request.
6. The existing shared content coordinator binds that intent to one durable provider operation.
7. The runtime starts a fresh thread and sends only the approved request/context.
8. Real output flows through the encrypted operation journal and the existing feature settlement adapter.
9. Conversations retain text; proofreading validates completed structured output before creating findings. Manuscript changes still require human Apply.

Collie's feature data remains the history authority. A persistent authentication session is useful; silently persistent provider conversation context is not. Default to one fresh, preferably ephemeral when supported, Codex thread per reviewed attempt. Prior conversation messages are included only through Collie's existing explicit selection/review.

### Development boundary

- Main must require an unpackaged Electron process, `RELEASE.channel === 'development'`, the expected development distribution/app identity, and the implemented local-route policy. An environment flag, localStorage entry, portable project, renderer boolean or missing release metadata cannot enable it in a package.
- Use the existing development profile separation. Put route profiles and local metadata under its verified working/profile owners. Never repurpose the existing historical testing hooks or testing root variables.
- Keep the commercial registered-client adapter independently selected for its actual channels. Local account state must never satisfy commercial approval, commercial funding or release readiness.
- The initial target is Josh's current macOS development machine and its actual architecture. Retain supported-platform detection; do not claim Windows behavior from macOS observations. Windows may remain explicitly unobserved until Josh exercises it.
- Dependencies resolve from the pinned project installation, with documented version/platform checks. No ambient PATH lookup, silent download, global Codex installation replacement or self-update.

### Credentials and runtime ownership

Use one active local Codex account at a time for this POC. Retain the existing commercial account machinery; do not promise eight independent saved local Codex accounts without implementing separate credential namespaces. An explicit local account change settles current work and starts a fresh login attempt.

Prefer Codex's supported OS keyring storage with a stable Collie-development Codex home. Confirm from the pinned source that keyring identity is isolated by that home or another supported namespace. Fail visibly if isolation or secure storage is unavailable. Do not choose an automatic mode that can fall back to plaintext, copy `~/.codex/auth.json`, expose tokens to the renderer, or serialize raw secrets into Collie's portable data.

If the selected runtime cannot provide isolated persistent secure storage, document the exact gap. A documented memory-only session can be an explicit limited option with sign-in required after restart; never silently replace encrypted storage with a disk token file. Do not run two processes that independently rotate the same credentials without a documented coordination mechanism.

Main owns a session manager; panels do not own child processes. Start account/runtime work only from an explicit connection/resume/model-refresh/send action as appropriate. Ordinary status reads and project recovery remain local and do not trigger login, model requests, token refresh or inference. On returning launch, show a saved connection as needing an explicit local-session resume until its actual state is established.

An idle authenticated child is not an unfinished inference job and must not block closing forever. Track process presence separately from pending auth, running requests and unprotected writes, and close idle children through the main shutdown owner.

Browser URLs come only from the validated matching runtime login response. Restrict the initial URL to the documented HTTPS authentication hosts for the pinned release, launch through the existing main-owned system-browser mechanism, and never send a credential-bearing URL through generic renderer navigation. Codex owns its loopback callback. Do not intercept passwords or extract browser cookies.

### Status, capabilities and billing

Define explicit route-specific status instead of overloading `commercialApproved` or returning artificial “included” funding:

| Concept | Required meaning |
| --- | --- |
| Route | Local Codex ChatGPT session versus registered commercial SIWC; selected by main. |
| Authentication | Signed out, signing in, saved session needing resume, signed in, reconnect required, disconnecting. |
| Development spending | Normal signed-in account subscription/credit settings, as Josh explicitly accepted. No API-key fallback. |
| Commercial spending | Existing included-only requirement and its unresolved enforcement; unchanged. |
| Runtime readiness | Actual supported version/platform, secure isolated account storage and implemented text-only policy. |
| Model status | Runtime-reported candidate and action compatibility, distinct from a guarantee that a provider will accept the next request. |
| Action eligibility | Main-authoritative conversation/proofread availability with an actionable reason; rechecked at prepare and dispatch. |
| Operational state | Active work, pending protection, unavailable storage or capacity exhaustion. |

Represent these as discriminated typed contracts with exact validators. Do not spread optional booleans across unrelated components. A model catalog is not a funding guarantee or a successful inference observation. Permit a reviewed development request on a genuinely available supported candidate without requiring a hidden paid connectivity probe; map an actual provider denial honestly.

Preserve sequence ordering and invalidate prepared grants/reviews when route, account/workspace identity, selected model, policy revision or captured request changes. Any additional effort option must use the selected runtime's supported values and be included in the captured execution identity; otherwise keep the runtime's documented default.

### Text-only behavior and context

No manuscript filesystem access, shell/command execution, MCP, plugins, app connectors, web search, skills, hooks, subagents or arbitrary tool invocation is needed for these two features. An empty working directory, a read-only sandbox and a prompt saying “do not use tools” are not sufficient enforcement by themselves.

CD03 must establish the actual pinned runtime's tool exposure and config-discovery controls. Use supported controls to disable these capabilities before dispatch, isolate home/config/work/tmp locations, and limit readable roots where supported. Keep authentication/inference networking available through the runtime's normal provider route. Do not confuse disabling tool network access with disabling the provider connection.

Allowlist the child environment. Strip API keys, access-token overrides, alternative provider/base-URL configuration, ambient Codex/project config and unrelated app credentials. Do not alter the user's shell environment or global Codex setup. Keep raw runtime logs/stderr, hidden reasoning and opaque runtime identifiers out of renderer events and support output.

Fresh threads must not load project instructions or undisclosed previous context. Use the pinned version's supported suppression/ephemeral settings, with named refusal for unsupported isolation. Handling unexpected tool requests as errors is defense in depth, not proof that autonomous tools were disabled before they ran.

Retain the current bounds unless separately justified in an implemented owner change: 16,000 UTF-16 prompt units, 64,000 context units across at most 32 chunks, 128,000 output units and at most 12 explicitly selected prior conversation messages. Include serialized framing in the actual request budget. These are content limits, not token-cost or billing guarantees.

### Durable operations and compatibility

Retain one `AiService`, one `AiContentService`, and one shared durable operational journal for both features. Keep the existing order: **commit portable intent → prepare → persist local binding → dispatch → protect real output → settle feature records**.

Changing auth must not reinterpret old records. Existing credential/journal v1 records and digests need exact compatible reads. New route/profile/session metadata uses a separately versioned local envelope and digest contract; preserve originals and interrupted candidates on migration. Never rebind an old operation to a newly signed-in account or compute its old digest using new defaults.

Keep provider provenance `openai-codex` where still true. Account/workspace identity, credential namespaces, auth route grants, runtime thread IDs and execution bindings remain device-local. If a route tag, schema identifier or different error becomes portable, treat that as a real format change with the full strict consumer/migration matrix.

In particular, `isAiReason` participates in portable conversation/proofreading validation. Add development connection explanations to a connection-only reason type where possible, and map durable execution errors to existing accurate portable reasons. Adding an enum member and writing it into a project can change reader compatibility even without SQL DDL.

No automatic resend on refresh, reconnect, restart, cancelled/unknown outcomes or storage retry. Retry local protection repeats only the exact disk operation. Another inference requires a new reviewed attempt. Stop requests do not imply a refund or prove the request never reached OpenAI.

## Stage execution and index

Request a stage explicitly, for example: **“Implement CD02 from codex-implementation-plan.md.”** Read this plan's shared contracts and that complete stage, inspect the current owners and prerequisite records, implement only the requested stage and its necessary owner changes, then stop for Josh's manual results. Do not silently implement missing predecessors.

All implementation follows `AGENTS.md`: no assistant-written or assistant-run tests, harnesses, mocks, automated validation, formatting checks, builds, packaging checks, application/browser/runtime launches, logins or inference. Ordinary source/Git reading and edits are allowed. Production input validation and runtime protection are required product behavior.

Every stage supplies its decision/implementation record and a concise ordered user guide, preferably `docs/decisions/codex-CDxx.md`, `docs/validation/codex-CDxx.md`, and `docs/manual-testing/codex-CDxx.md`. Record **implementation complete — awaiting user testing** separately from user-confirmed outcomes. Update only the relevant current checkpoint/plan ledger when implemented; preserve historical evidence and release NO-GO.

Early stages can use document review where no new user action is yet available. Do not create a testing screen or raw IPC/CLI probe to make an intermediate stage demonstrable. Guides describe only implemented behavior and give setup/launch commands for Josh to run himself.

### Model and effort recommendations

These recommendations select the coding assistant used to implement each stage. They use the same conventions as [app-improvement-plan.md](app-improvement-plan.md#model-and-effort-recommendations): **Astra** means GPT-6 Astra (`gpt-6-astra`), **Sol** means GPT-6.1 Sol (`gpt-6.1-sol`), and **High** / **Extra High** correspond to `high` / `xhigh` where supported by the coding client.

The assignments are engineering judgments based on each stage's scope, informed by [OpenAI's model-selection guidance](https://learn.chatgpt.com/docs/model-selection). Astra / Extra High is recommended for coupled authentication, isolation, persistence and recovery work; Sol / High is recommended for bounded feature integration and the final runbook. Josh selects the model and effort in his coding client. These recommendations do not choose Collie's inference model, alter billing policy, switch the current session automatically or authorize assistant testing.

| Stage | Deliverable | Depends on | Status |
| --- | --- | --- | --- |
| CD01 | Development route, pinned protocol decisions and compatible contracts | Existing I10–I13 owners | Implementation complete — awaiting user testing |
| CD02 | Secure Codex login and real in-app connection controls | CD01 | Implementation complete — awaiting user testing |
| CD03 | Isolated text runtime, model discovery and action readiness | CD02 | Engineering partial — model controls delivered; execution isolation unfinished |
| CD04 | Route-bound durable dispatch shared by both features | CD03 remains partial; live execution refused | Implementation complete — awaiting user testing |
| CD05 | Working in-app conversations with real Codex responses | CD04 | Not started |
| CD06 | Working mechanics proofreading with validated real findings | CD04; CD05 establishes the first live owner observation | Not started |
| CD07 | Integrated account, close, cancellation and recovery lifecycle | CD05–CD06 | Not started |
| CD08 | Shared durable handoff for repeated development use | CD07; reuse C07 if already delivered | Not started |
| CD09 | Owner runbook, integrated manual acceptance and scope reconciliation | CD01–CD08 | Not started |

**Milestones:** CD02 provides actual browser sign-in. CD05 provides the first full conversation path. CD06 provides both AI features. CD07–CD09 finish lifecycle, repeated-use capacity and the full local-development handoff. Earlier milestones must not be called complete if their real request paths remain unimplemented.

### CD01 — Define the local route and pin its contracts

#### Model: Astra | Effort: Extra High

**Implementation checkpoint, October 2, 2026:** delivered the trusted unpackaged/identity selector, separate route/session/funding/feature contracts, exact shared main/preload response validation, truthful existing connection copy and explicit per-feature unavailability. Retained 0.160.0 from published source/types; recorded keyring ownership, method/network map and unresolved isolation. Froze v1 digest compatibility and declared separate future local metadata; no sign-in, new persistence or inference was activated. The [decision](docs/decisions/codex-CD01.md) includes the full-plan review findings; [evidence](docs/validation/codex-CD01.md) and [guide](docs/manual-testing/codex-CD01.md) track pending user results. CD02 is not started.

**Why this recommendation:** Coordinates protocol selection, development boundaries and versioned contracts across authentication, storage and IPC.

**Purpose:** make the personal development route an explicit source-owned architecture with accurate funding semantics and no commercial activation.

**Read:** I10/I11 decisions and runtime runbook; `deployment.ts`, `release.ts`, `storage.ts`, `runtime.ts`, `service.ts`, shared/preload AI contracts; current privacy/profile ownership; pinned Codex package/source and official documentation above.

**Work:**

1. Record the owner-only scope, Josh's explicit normal-subscription decision, commercial exclusion and unresolved provider classification precisely. Update conflicting current I10/runbook/approval-guide wording with a bounded cross-reference to this development plan when implementing; retain the commercial rules and dated historical records.
2. Select the app-server route and inspect whether pinned 0.160.0 supports the required account, keyring, model, thread/turn, structured-output and isolation contracts. Retain that pin if suitable; otherwise select one exact supported release, record why, and plan its dependency/notices change. No “latest” dependency, runtime discovery probe or protocol generation command.
3. Record a small method/field map from published source/types. Cover initialize, local account read, browser login/start/completion/cancel/logout, model listing, fresh thread creation, turn/start/output/interruption and relevant capability controls. State which methods can access the network.
4. Add the trusted unpackaged-development route selector and discriminated route/session/funding/action contracts. Update exact shared/preload/main validation together. Keep all commercial registration records and packaged refusals intact.
5. Define backward-compatible local metadata/journal versions and how old v1 digests remain readable. Keep new connection-only reasons separate from portable error vocabulary.
6. Define feature readiness independently: a stage may implement login while conversation/proofreading execution is not yet ready. Do not let a generic signed-in state prematurely activate either feature.

**Deliverables:** a concrete route decision, version/contract map, type/config owner changes and a compatibility record. A flags-only change that removes existing refusals is insufficient.

**Manual handoff:** Josh reviews the documented route and source-owned development boundary, confirms that normal account billing is described accurately and that production approval remains unresolved. No sign-in or inference is expected from this stage alone.

### CD02 — Implement browser sign-in and connection UI

#### Model: Astra | Effort: Extra High

**Implementation checkpoint, October 2, 2026:** added main-owned managed browser login, strict isolated keyring/configuration handling, exact attempt cancellation and encrypted local v2 active/retired metadata. Existing Settings/setup/companion now expose real account actions, with global Connect Codex, Continue with ChatGPT, explicit returning Resume, single-account replacement, disconnect, visible inactive-session cleanup and disk-only metadata protection. Idle children settle through existing close/update/suspend owners. Normal status reads never spawn or call Codex. The [decision](docs/decisions/codex-CD02.md) records callback handover, configuration/network and account-identity limitations; [record](docs/validation/codex-CD02.md) and [guide](docs/manual-testing/codex-CD02.md) leave native/runtime acceptance pending. Feature Send/Run and commercial activation remain unavailable. No tests/checks/builds/launches/login/inference occurred.

**Why this recommendation:** Combines secure credential ownership with browser callbacks, cancellation races and persistent session state.

**Purpose:** Josh can click a normal app control and complete real Codex-managed login without a terminal login prerequisite.

**Likely owners:** a main-only local-session/auth module under `src/main/ai/`; `service.ts`, `storage.ts`, `ipc.ts`, shared/preload contracts; `AiConnectionsProvider.tsx`, `AiConnectionPanel.tsx`, `AiProviderIndicator.tsx`, `AiConnectionNotice.tsx`, `connection-copy.ts`.

**Work:**

1. Resolve the pinned runtime and prepare its stable isolated auth profile, OS keyring namespace and empty working/config environment. Complete necessary dependency/license edits within scope. Keep credentials out of repo files, default Codex homes, project archives and diagnostics.
2. Implement the session manager and documented managed-login RPC flow. Correlate Collie's attempt ID with the runtime login ID, validate the returned browser URL and start browser navigation in main. Wait for the matching completion and authoritative account state before publishing success.
3. Retain exact cancel/double-click/stale-completion handling. A cancelled late callback cannot replace the active account. Handle browser closure/denial, callback-port conflict, unsupported secure store, offline failure, runtime exit and timeout with retryable real messages.
4. Persist only the required sanitized local account/profile metadata with route/version identity. Do not force native Codex accounts through the existing registered-client token schema. Keep refresh under one supported owner.
5. Implement local resume, reconnect, disconnect and single-account replacement. Logout targets only Collie's isolated Codex credentials. Local removal and any confirmed remote action are distinguished; do not claim global revocation from a local logout acknowledgment.
6. Add a discoverable **Connect Codex** action in the existing global provider indicator/connection surface so it is reachable immediately after opening Collie, including before a project is selected. Reuse Settings → AI connections and the AI companion. Use **Continue with ChatGPT** where required for the actual sign-in button. Show concise **Local development** identification.
7. Reuse existing Mantine components, semantic feature CSS, static CSP, retained drafts, focus return and global progress. A browser return does not steal editor focus or overwrite setup state. No provider event includes raw tokens or credential URLs.
8. On an ordinary returning app launch, show cached local state and an explicit **Resume Codex connection** action where runtime restoration is needed; do not perform hidden network refresh during status polling. Once explicitly resumed, ordinary provider-managed expiry handling may occur within authorized use.

**Done when implemented:** the full button → browser → matching account → connection state path and real cancellation/disconnect are wired. Feature Send/Run may still identify unfinished execution work; do not imply login is the final POC.

**Manual handoff:**

1. Josh starts the development app using the documented existing local setup and `npm run dev`, opens Connect Codex, and sees a system-browser login for his own account.
2. After he completes login, Collie shows the actual connected account and local-development label; it does not claim commercial approval or guaranteed included-only usage.
3. Cancelling and retrying a separate login produces the corresponding state without duplicate account adoption or lost writing.
4. After closing/reopening normally, the saved connection can be resumed explicitly. Disconnect preserves manuscripts and saved AI history.

### CD03 — Implement the isolated execution adapter and real readiness

#### Model: Astra | Effort: Extra High

**Implementation checkpoint, October 2, 2026: engineering partial.** Delivered explicit same-account model discovery/selection, exact transient status/IPC, named execution blockers, and bounded managed text-turn methods with correlation, text-channel separation and uncertainty handling. Full-plan/pinned-source review identified model-driven tools outside the established disable flags and a mandatory content-capable SQLite log sink. The route-specific pre-dispatch isolation refusal remains; this is missing engineering, not a commercial-approval condition or a successful runtime observation. Feature adapters and legacy model-based Send remain unavailable. Read the [decision](docs/decisions/codex-CD03.md), [record](docs/validation/codex-CD03.md) and [manual guide](docs/manual-testing/codex-CD03.md). CD03's done condition is not met. CD04 was subsequently implemented as recorded below; its live path retains this prerequisite refusal. No tests/checks/builds/launches/provider actions occurred.

**Why this recommendation:** Requires careful runtime isolation, event ordering, interruption handling and consistent action eligibility.

**Purpose:** the authenticated runtime can execute exactly one bounded text request with accurate model/action status.

**Likely owners:** `codex-runtime.ts`, a shared app-server transport if needed, `runtime.ts`, `registry.ts`, `service.ts`, `deployment.ts`, shared AI status/model validators and connection presentation.

**Work:**

1. Separate the Codex-managed local route from the existing externally supplied Responses-token launch. Use the runtime's normal ChatGPT authentication/provider path; do not inject an `ACCESS_TOKEN`, dummy API key, copied OAuth client ID or undocumented endpoint override.
2. Implement the actual pinned version's text-only tool/config isolation contract. Document each enforced capability and remaining platform limitation. Do not simply return success from `requireTextOnlyRuntime`; provide a route-specific implementation and keep the commercial refusal where unresolved.
3. Keep authentication persistent while starting a fresh thread per operation. Prevent project instruction discovery, inherited skills/tools and previous-turn context. Establish supported ephemeral/no-history behavior; identify any runtime-created content files and their ownership. No unprotected duplicate manuscript logs may be silently introduced.
4. Implement bounded JSON-RPC transport, UTF-8 buffering, response/event correlation, process loss, timeouts and server-request rejection. Correlate account/session epoch, thread, turn and message IDs, including notifications that arrive before the start acknowledgment.
5. Normalize agent text without duplicating a final item after its deltas. Keep commentary/progress separate from the final response contract, especially for proofreading. A completed RPC response alone does not mean a completed turn.
6. Add explicit model discovery after connection or owner-requested refresh. Use actual supported text models and capabilities; no fabricated list, hard-coded paid model or automatic inference probe. Account/provider refusal remains possible and must be actionable.
7. Implement one authoritative route-aware eligibility decision for each action. The local spending policy is normal account behavior, not the production included-only promise. Expose selected model, reason and capability state consistently; recheck in main before execution.
8. Implement stop/interruption and terminal error mapping. Disable app-level retry/fallback after possible dispatch. Inspect runtime retry behavior against the pin: do not promise exactly-once remote execution or change it into automatic fresh turns. Preserve unknown outcomes and real partial output.
9. Allow only implemented feature adapters to advertise execution readiness. CD03 may finish the transport without exposing unfinished conversation/proofreading actions.

**Done when implemented:** real transport methods exist for authenticated execution, streaming, terminal completion, cancellation and errors; readiness no longer depends on unconditional funding/isolation refusals for the supported local route.

**Manual handoff:** Josh connects and refreshes models through normal UI, sees actual available choices or a precise refusal, and can distinguish connected status from unfinished feature readiness. No standalone SDK probe, test-prompt screen or terminal inference is introduced. Live text-path observation starts in CD05.

### CD04 — Bind both features to the shared durable dispatch path

**Implementation checkpoint, October 2, 2026: implementation complete — awaiting user testing.** Both adapters now share real route-bound session methods, main review stamps, exact local operation/binding v2, protected output settlement and version-aware disk-only recovery. V1 identities and portable formats remain unchanged. Pinned account workspace metadata stays main-owned; no token or endpoint authority is exposed. CD03 remains engineering partial: the actual managed call path retains its tool/content-log refusal, and neither feature is enabled. Read the [decision](docs/decisions/codex-CD04.md), [format/consumer matrix](docs/formats/codex-operations-v2.md), [record](docs/validation/codex-CD04.md) and [manual guide](docs/manual-testing/codex-CD04.md). No tests/checks/builds/launches/provider actions occurred. CD05–CD09 remain unimplemented.

#### Model: Astra | Effort: Extra High

**Why this recommendation:** Must preserve old journal identities, durable dispatch ordering and recovery across both feature adapters.

**Purpose:** route changes must preserve the existing intent-before-dispatch and recovery contracts.

**Read/owners:** `src/main/ai/service.ts`, `storage.ts`, `content-service.ts`, `src/main/conversations/service.ts`, `src/main/proofreading/service.ts`, shared AI-content contracts and local worker operation bindings.

**Work:**

1. Refactor registered-account assumptions behind an explicit session interface used by the same `AiService`. Keep commercial OAuth behavior separate. Bind prepare/start to the selected route, local account/workspace identity, session generation, model, action, policy/template version and exact content digest.
2. Preserve the existing portable commit before prepare, local binding before start, and ordered protected output before feature settlement. An unconfirmed binding/commit never dispatches a replacement request.
3. Make route-specific inputs and output contracts main-owned. The renderer cannot send a runtime handle, arbitrary schema, CLI argument, environment variable, credential path or provider URL.
4. Version new local records/digests without rewriting old v1 identity. Reconcile old records according to their original format. Any route/model/template change invalidates an unsubmitted review; it does not mutate a submitted intent.
5. Reuse coalesced output persistence and sequence guards. Correlate against original scope/binding even if the visible project or selected conversation changes. A dropped notification is repaired by local record reads.
6. Preserve exact replay and disk-only protection retry. Restart marks interrupted work unknown and retains actual output; startup cannot refresh the account, resume a provider thread or resend a request.
7. Enforce existing project edit rights and main lifecycle gates. A ChatGPT subscription does not grant Collie paid access, change the free-project designation or make a read-only project editable.
8. Update action availability and both main adapters together so neither feature has a private alternate network path. Keep the global operation bound until CD08 delivers safe handoff.

**Done when implemented:** both feature adapters can use the same new route through real durable service methods; saved history/recovery and old journals remain readable without inference.

**Manual handoff:** using disposable projects, Josh saves requests locally, switches views and reopens the app. Saved requests remain not sent, existing records remain readable, and signing in does not auto-submit them. Real live dispatch acceptance follows the feature stages.

### CD05 — Deliver real in-app conversations

#### Model: Sol | Effort: High

**Why this recommendation:** Connects the existing conversation UI and adapter to the transport, eligibility and persistence contracts established by CD03–CD04.

**Purpose:** complete the requested prompt → Codex → visible retained response path in the existing conversation UI.

**Owners:** `ConversationProvider.tsx`, `ConversationPanel.tsx`, `src/main/conversations/service.ts`, shared content coordinator, `src/worker/projects/conversations.ts`, shared conversation/capture contracts.

**Work:**

1. Replace the conversation's current model-list-based send check with CD03's authoritative conversation capability. Display useful Connect/Resume/Choose model/Wait for protection states; preserve Save request locally and offline history.
2. Retain current project editing rules, prompt draft protection and explicit review. For a no-context message, creating a conversation, typing a prompt and the normal review/send action must reach the real provider without another manual terminal/configuration step.
3. Preserve default context none and history selection empty. Show clearly that a follow-up remembers only messages selected for that reviewed request. Allow the already implemented prior-message selection in transcript order; do not secretly resume a Codex thread containing more history.
4. Capture selected passage/current section from the protected saved revision. Budget the complete serialized request, including framing and selected history. Refuse oversize input with narrowing guidance rather than silent truncation or extra calls.
5. Translate through the existing main conversation adapter; stream only actual visible agent output. Keep user messages, assistant responses, current run status and local-save status distinct. Do not insert reasoning, tool events, synthetic success text or hidden “repair” prompts.
6. Keep Stop, retained partial/failed/unknown outcomes and explicit new reviewed attempts. A repeated click or unknown acknowledgment reconciles the same request rather than creating a second provider turn.
7. Preserve transcript persistence/export, archive/read-only behavior and manuscript-preserving project-head refresh. Receiving chat output must not remount the editor or alter prose.
8. Record provider/model provenance honestly; runtime/account handles remain local. Unsupported model/quota/auth errors return actionable status without switching models or providers.

**Done when implemented:** Josh can authenticate, select an actual supported model, submit a conversation prompt and receive a real response that remains available after restart.

**Manual handoff:**

1. In an editable disposable project, Josh connects Codex, creates a conversation, types “Suggest three possible titles for an essay about urban gardens,” reviews the no-context request and sends it. Actual output appears and reaches an honest terminal status; wording is model-dependent.
2. He selects relevant prior messages for a follow-up and inspects the review. Only those messages and the new prompt are included.
3. He attaches a small saved passage, sends a request, then changes panels. The request retains the original scope and its response remains discoverable.
4. He stops an ordinary longer response if one is in progress, then reopens the conversation. Any actual partial text and outcome are retained.
5. After a normal restart, saved messages remain readable without reconnecting or resending. The manuscript remains unchanged.

### CD06 — Deliver real mechanics proofreading

#### Model: Astra | Effort: Extra High

**Why this recommendation:** Couples structured output and exact text ranges with finding validation, stale-target refusal and safe editor corrections.

**Purpose:** make the existing review feature consume Codex output safely and enable human-controlled corrections.

**Read/owners:** `src/shared/proofreading.ts`, `src/domain/ai/proofreading.ts`, `src/worker/projects/proofreading.ts`, `src/main/proofreading/service.ts`, `ProofreadingProvider.tsx`, `ProofreadingPanel.tsx`, workspace Apply/editor-lock owner and I13 decision.

**Work:**

1. Replace the impossible current `eligibility !== 'unverified'` check with the same authoritative action capability model used by conversations. Main enforces the identical proofreading requirements.
2. Keep the existing mechanics-only en-US selection/current-section scope and exact protected capture. Preserve 128-run/64,000-context-unit bounds and visible exclusions for tables, quotations, images, citation/footnote atoms and footnote bodies. No hidden batching or expanded research context.
3. Use a main/domain-owned output contract matching the existing complete JSON envelope: `version: 1`, `mode: 'mechanics'`, `findings`; findings retain `targetId`, UTF-16 `from`/`to`, exact `before`, `replacement`, `reason`, and `kind`. Allowed kinds are spelling, grammar and punctuation; offsets are zero-based and end-exclusive within the supplied run. Derive schema constants from the real domain owner instead of maintaining a competing permissive parser.
4. Prefer the pinned app-server's supported per-turn output schema if present. Extend the internal execution descriptor with a main-owned contract/schema identity, and include it in new local execution digests. Do not accept arbitrary schemas from the renderer. If unavailable in the selected pin, retain strict text-to-JSON parsing and accurately document its limitation; never invent a method.
5. Separate the final structured response from progress/commentary items. Preserve actual raw displayable output as required, but never concatenate unrelated progress text into an applicable findings object. Refusals, malformed output, missing final output and ambiguous multiple final objects remain inert.
6. Keep production validation of the entire result before creating any findings: exact keys/targets, boundaries/graphemes, before text, allowed replacements and nonoverlap; at most 100 findings, 4,000-unit spans/replacements and 1,000-unit explanations. Empty findings is a valid completed result. Do not recover a convenient subset from invalid output or run an automatic repair inference.
7. Preserve run outcome, result validity, human decision and target freshness as separate states. Partial/cancelled/failed/unknown output cannot become applicable findings.
8. Keep Apply/Ignore/Undo ignore entirely local. Apply rechecks access/head/finding/document/range/text/marks, protects a checkpoint, commits one correction and reconciles the mounted editor through its normal transaction. Unknown acknowledgments retain the mutation lock and exact operation. Old-revision findings become stale.
9. Keep history comparison, saved review portability and clean manuscript exports unchanged. Do not add inline flags, grouped Apply, language expansion or future P modes.

**Done when implemented:** real complete valid Codex output can populate findings and a separately chosen correction can update writing through the existing I13 safety path. A successful login, simulated finding or merely readable invalid JSON is insufficient.

**Manual handoff:**

1. Josh writes a short disposable en-US passage with deliberate mechanics errors, saves/protects it, chooses its supported selection or section, and reviews the shown text/exclusions.
2. Run sends that reviewed request through his Codex account. A completed valid result shows actual findings or explicitly reports no findings; an invalid result is readable and cannot be applied.
3. If a finding exists, Ignore and Undo ignore change its decision only. Apply changes exactly the reviewed occurrence and exposes the protected prior manuscript in History.
4. Editing the captured text before applying a remaining suggestion makes it stale and refuses a silent retarget.
5. After reopening, the real review/output/decisions remain readable. No additional inference occurs from Apply, Ignore, history inspection or reconnect.

### CD07 — Integrate account changes, close, stop and recovery

#### Model: Astra | Effort: Extra High

**Why this recommendation:** Coordinates account identity, pending writes, retained drafts and native lifecycle transitions across both AI features.

**Purpose:** finish cross-feature lifecycle behavior around the already working live paths.

**Owners:** main AI/session/content services, existing native close/update/suspend and access guards, persistent renderer connection/conversation/proofreading providers, global notices and draft registry.

**Work:**

1. Treat login, credential refresh, active inference, output protection and unknown local acknowledgments as session-owned work. Hidden panels cannot cancel or detach them. Keep each active operation discoverable globally.
2. Settle or explicitly stop/protect work before disconnect/account replacement; invalidate prepared grants and unsent reviewed captures. Do not transfer an active result to the replacement account or currently visible project.
3. Integrate ordinary close, update settlement and suspend behavior with the existing protection handshake. Provider-child timeout handling must preserve uncertainty; never terminate the storage worker as a shortcut.
4. When authentication expires, reflect the real failure and offer reconnect. Automatic credential renewal inside an already authorized provider operation may follow the documented runtime contract; a reconnect must never submit a fresh request behind the user's back.
5. Keep quota exhaustion, unsupported model, transport loss, cancelled request, uncertain provider outcome and failed local protection distinguishable. Sanitize errors; avoid raw network/token/runtime logs.
6. Preserve retained drafts and explicit Save/Clear choices across project/access changes, narrow layouts, browser focus return and IME input. Use semantic Mantine feature styles and the current CSP.
7. Reconcile saved outcomes locally after reopening; identify missing records or independent copies honestly. A copy retains history without the original's active execution authority.

**Done when implemented:** lifecycle transitions protect actual input/output and account identity across both features without silent resends or editor loss.

**Manual handoff:** Josh uses ordinary panel navigation, app close/reopen, account disconnect/reconnect and project switching with disposable work. The app exposes necessary draft/job choices, retains outcomes and resumes local reconciliation only. Observe naturally occurring offline/auth/storage failures if encountered; do not require forced crashes, failure injection or charge-incurring stress runs.

### CD08 — Complete shared handoff and repeated-use capacity

#### Model: Astra | Effort: Extra High

**Why this recommendation:** Changes journal and binding retention while preserving durable handoff receipts, uncertain outcomes and exact replay.

**Purpose:** avoid permanently exhausting the current 64-operation journal during normal development while preserving uncertain and unprotected work.

**Read:** C07 in [conversation-implementation-plan.md](conversation-implementation-plan.md), I10 encrypted journal, shared content coordinator, actual conversation/proofreading durable settlement and current local operation bindings.

**Work:**

1. If C07 already exists, reuse its receipt/index/storage design and adapt only the new route metadata. Otherwise implement the shared C07 contract in these owners and record the overlapping work explicitly.
2. Establish a trusted worker handoff receipt for the original scope, action, attempt/operation, terminal sequence, payload/result digest and committed portable revision. A renderer acknowledgment, independent project copy or “completed” provider event alone cannot release capacity.
3. Split active/unsettled operational records from terminal outcomes whose portable protection is proven. Release a hot slot only after verified local handoff with no remaining write. Apply the same receipt-driven transition to the workers' separately bounded conversation/proofreading binding collections, preserving cold identity/receipts and bounded recovery reads; freeing only the main journal would leave another 64-binding bottleneck. “Verified” here describes runtime product validation, not assistant-executed testing.
4. Retain original encrypted cold records and bounded lazy access under a versioned local index. Do not delete them, discard interrupted candidates, raise the cap without a storage design or reload unlimited output into memory at startup.
5. Preserve unknown/partial outcomes. Any explicit local acknowledgment/archival requires readable retained output and no active child or pending protection; it cannot relabel uncertainty as success. Replaying a retired operation still resolves its original receipt/history and cannot send inference.
6. Make remaining blocked capacity actionable and understandable across both feature panels. Local archival/handoff uses disk operations only. Keep copy identity and closed-project reconciliation exact.
7. Record C07 coverage in its plan/checkpoint. Do not claim broader conversation organization or proofreading expansion.

**Done when implemented:** normally settled requests cease consuming active capacity without losing their durable outcomes or permitting replay to create a new provider call.

**Manual handoff:** Josh uses naturally accumulated genuine requests, observes completed results/history after restart and any handoff/capacity messages, and can still read independent saved copies. Do not ask him to create 64 paid requests, generate fixtures or deliberately corrupt storage. Unobserved capacity/interruption cases remain explicitly pending.

### CD09 — Deliver the owner runbook and integrated handoff

#### Model: Sol | Effort: High

**Why this recommendation:** Consolidates implemented behavior, setup instructions, recovery guidance and honest manual acceptance records.

**Purpose:** make the local development path straightforward to repeat and document exactly what has been observed.

**Work:**

1. Produce a single local setup/runbook covering the pinned runtime/dependency prerequisites, supported local platform, existing `npm run dev` entry, development profile, Connect/Resume/Disconnect, model selection, both feature flows and normal account billing behavior. No public-domain or commercial-registration task belongs in the happy path.
2. Include specific recovery guidance for missing runtime, unavailable secure storage, callback conflicts, signed-out/expired session, model refusal, usage limit, pending local protection and capacity. No instructions to copy auth files, paste credentials, unlock paid access or run a raw test harness.
3. Reconcile current provider runbook/approval guide, I10–I13 checkpoints, privacy/network inventory and relevant user help. State that this plan delivered the local owner route, not that I10 commercial activation or release gates are complete. Keep Grok partial status independent.
4. Document the pinned runtime's local content/credential locations and actual retention/disconnect behavior. Record supported endpoints and absence of app-controlled analytics without asserting undocumented provider-side retention.
5. Provide the full manual journey below and a compact observation ledger: date, stage/runtime version, platform, non-secret outcome and remaining limitation. Do not request raw logs, tokens, manuscript uploads or screenshots containing private account details.
6. Fix user-reported defects within their owning stage/module without adding or running tests. Preserve the no-assistant-testing rule and record unobserved cases honestly.

**Full manual journey for Josh:**

1. Start the unpackaged development app through the documented local setup. Connect Codex is visible without configuring a domain or commercial client.
2. Click the button and sign in in the browser. Collie shows the actual account, local-development status and available model/action state.
3. Open an editable disposable project, create a conversation and send a reviewed prompt. A real response appears, reaches an honest terminal outcome and remains saved.
4. Send a follow-up with deliberately selected history and then a request with a small saved passage. The review shows the exact submitted content.
5. Run mechanics proofreading on another short disposable passage. Inspect real findings or the explicit no-findings/invalid-result outcome; apply a chosen valid suggestion separately.
6. Navigate away, close normally and reopen. Conversation/review history remains available; pending drafts/jobs receive the documented handling; nothing silently resends.
7. Disconnect. Writing, reading prior responses/findings and existing local feature actions remain available according to Collie's independent access rules.
8. Resume/reconnect when wanted. A new explicit request uses the current account and reviewed context, never a stale prepared grant.

**Completion wording:** report **local-development implementation complete — awaiting user testing** until Josh supplies observations. After successful owner observation, report the exact observed local flows and remaining limitations. Commercial activation, packaged/native distribution, broader provider approval and release readiness remain outside this plan and NO-GO.

## Required preservation checklist for each implementation stage

This is an implementation contract, not an instruction to execute checks or automated validation.

- Keep the permanent ad-free rule, local-first writing and human-controlled manuscript changes.
- Preserve one session owner, retained editors/drafts, strict main IPC and project access checks.
- Preserve exact pending requests, old local records, protected output and disk-only recovery.
- Do not use the user's global Codex credentials/configuration or share the implementing assistant's account.
- Do not equate login, model listing or code completion with a live working feature.
- Never turn the accepted development spending policy into a production funding claim.
- Do not advance to another stage automatically or mark unobserved behavior as accepted.

## Current handoff

CD01, CD02 and CD04 are **implementation complete — awaiting user testing**. CD04 delivers shared durable route bindings and recovery, with live execution still refused by its CD03 prerequisite. CD03 is **engineering partial**: explicit runtime model controls and bounded text transport machinery are delivered, while complete tool isolation and protected/suppressed content logging remain unimplemented. The local dispatch refusal stays in place. CD05–CD09 remain **not started**. Josh's normal-subscription development policy is settled above; no further spending-policy decision is needed. Actual provider access, native credential behavior and end-to-end outcomes remain unobserved; manual observation cannot replace missing isolation implementation.

Use the [CD03 manual guide](docs/manual-testing/codex-CD03.md) for the delivered connection/model controls and report observations. Its [decision](docs/decisions/codex-CD03.md) names the remaining CD03 engineering; no later stage was advanced. Implementing this plan must never require starting over on I01–I09 or rebuilding the existing conversation/proofreading storage and editor foundations.
