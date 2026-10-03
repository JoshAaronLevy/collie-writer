# CD01 — Owner-only Codex route and compatible contracts

October 2, 2026. **Implementation complete — awaiting user testing (document review).** CD01 defines and wires a source-owned route, transient status contracts and compatible local-format boundaries. It does not deliver sign-in or inference. CD02–CD09 remain not started; commercial I10 and Grok I14 remain partial and release remains **NO-GO**.

## Scope and spending decision

Josh selected normal Codex subscription behavior for his own unpackaged local development, with API-key fallback disabled. The local route may consume available credits under the signed-in account's settings. Collie cannot purchase credits, enable top-ups, upgrade the plan, change spending settings, use a proxy/shared account or change billing routes. This is not an included-only or free-usage promise. The registered commercial route keeps its unresolved approval, registration, included-only enforcement, packaging and release requirements.

Use Codex app-server with Codex-managed ChatGPT authentication, not Collie's registered-client OAuth or externally injected tokens. Keep one `AiService`, one shared durable content coordinator and the existing conversation/proofreading adapters. Do not add the TypeScript SDK or a parallel execution stack. No domain, business email, hosted callback or interest-form submission is a prerequisite to this local engineering.

## Provider scope evidence

The current [app-server authentication documentation](https://learn.chatgpt.com/docs/app-server#auth-endpoints), read October 2, 2026, addresses existing users with the exact phrases “If you’ve built a local or open-source application” and “you can continue using it”. Its explicit exclusion is: “App-server authentication has never been permitted for commercial or hosted services.”

That wording does not explicitly classify a newly built private owner-only POC for a future commercial product. No clarification or approval for Collie was supplied. Our engineering classification remains **unresolved**, recorded in the local route itself. An unpackaged guard is a product boundary, not provider permission. The explicit exclusion prevents treating this route as commercial/hosted activation; it does not establish a blanket prohibition on writing the independent local implementation. A later applicable rule or clarification must be applied to the affected live action. Nothing in CD01 authorizes provider login, inference, outreach or registration by the assistant.

The [authentication documentation](https://learn.chatgpt.com/docs/auth) distinguishes managed ChatGPT credentials, keyring storage and enforced login methods. The [pin-specific map](../ai/codex-local-contracts.md) records actual published source/types and the network/compatibility caveats instead of assuming current web examples all work on 0.160.0.

## Trusted route and delivered behavior

`src/main/ai/deployment.ts` selects the local route only when **all** of these match: Electron is unpackaged, release channel and distribution are `development`, and app ID is `com.colliewriter.app.dev`. No arguments from IPC, project data, preferences or environment flags can select it. Packaged apps with the release reader's development fallback receive `packaged-development-refused`. Correct packaged direct beta/production identities select registered OAuth, still subject to the original authentic registrations and refusals. Other identities are unavailable.

All three `OPENAI_REGISTRATIONS` remain null. `requireIncludedFunding`, `requireTextOnlyRuntime` and the packaged binary refusal remain. Registered OAuth actions explicitly require the registered route. A local connection cannot fall through to a commercial token/client record. Old encrypted records remain readable for local operation recovery; their saved accounts are not advertised as local Codex sessions.

`shared/ai-route.ts` owns discriminated route, session, funding and separate conversation/proofreading availability. The exact shared status schema is used for main replies, preload replies and connection events through one named-channel response validator. Account action permissions and status sequence ordering remain. CD01 defines future session presentation states but reports the actual local state as unavailable because managed login has not been implemented. Feature availability intentionally has **no ready variant** at this checkpoint; CD03 must add an exact model/policy contract when it implements readiness. A login or catalog cannot turn on either feature. Main still refuses local preparation and dispatch; both existing renderer Send/Run predicates also require their own action availability.

The existing Settings/setup/companion panel now describes normal subscription/credit behavior for the local route and separately describes unresolved commercial funding. Its details identify each unavailable feature. This is a bounded correction to existing presentation, not the CD02 connection flow or a new testing screen. Existing Mantine components, semantic feature CSS and CSP remain.

## Formats and ownership

The [compatibility record](../formats/codex-local-v1.md) freezes registered credential/journal v1 reads and exact digest bytes. Local managed-session metadata is a separate versioned main-only declaration with an exact validator; CD02 owns its encrypted reader/writer and secure profile. No metadata/profile/credential is created by CD01. Route-bound operation v2 is reserved for CD04, not silently accepted by today's v1 reader. Connection-only reasons never enter `AiReason`, portable records or transcript exports.

The existing development profile remains selected by `profile.ts`; the verified working-root owner remains authoritative. Historical testing profile hooks are not used or changed. Future local runtime profiles belong under that working root's AI owner, use a stable isolated Codex home and one process owner, and must never borrow the user's default Codex credentials. SQL/minimum reader **12**, AST/archive **1**, compilation **3**, dependencies and bundled notices are unchanged.

## Full-plan review and downstream findings

The entire CD01–CD09 plan was read before implementation. Its ordered milestones and separate stage requests remain appropriate. The review found these concrete implications:

1. Channel text alone cannot protect the local route because missing packaged metadata currently falls back to a development identity. CD01 now enforces the separate Electron packaging predicate.
2. Normal development spending conflicted with current I10/runbook/approval wording and generic connection copy. Bounded current cross-references and route-specific copy reconcile it while dated evidence and commercial requirements remain intact.
3. Published 0.160.0 supports managed login, namespaced keyring, fresh ephemeral threads, final-message schema and message phases. It is retained for this contract foundation; no dependency/notices change is needed. Full execution isolation is **not** established by that selection.
4. In the pin, app-server startup has background model refresh; account reads can discover workspace routing even without proactive token refresh. CD02 must start/resume a child only on explicit action, and status polling must use Collie's cache. CD03 must disclose/control runtime network behavior rather than promise that a started child is offline.
5. Current web documentation's restricted-read sandbox fields are absent from the pin's published stable TypeScript `SandboxPolicy`. Its tool registry also has independent/model-driven utility tools. CD03 must use actual supported controls and refuse unsupported isolation; empty maps, read-only sandbox, `disabledPluginIds` or a prompt are insufficient. An exact future pin change is bounded CD03 work if required; no newer release is assumed suitable today.
6. CD04 must version route/session execution identity before either feature sends. CD05 owns actual conversation acceptance; CD06 depends on that first owner observation and must separate final structured output from commentary. CD07 owns full lifecycle, CD08 shares C07's receipt-based handoff and both 64-binding bottlenecks, and CD09 reconciles integrated observations. None was implemented or advanced here.

No tests/checks, builds, launches, protocol generation, account access, sign-in or inference occurred. Ordinary source and Git reads are not passed tests. See the [record](../validation/codex-CD01.md) and [manual guide](../manual-testing/codex-CD01.md).
