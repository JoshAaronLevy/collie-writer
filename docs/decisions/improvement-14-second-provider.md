# I14 — Second-provider transport and remaining integration

October 2, 2026. **Engineering partial.** Grok Build ACP transport is implemented; full second-provider integration is not. Read the [component runbook and official evidence](../ai/grok-runtime.md), [implementation record](../validation/improvement-I14.md) and [manual guide](../manual-testing/improvement-I14.md).

## Decision

Select Grok Build for this increment because the provider documents ACP embedding and publishes an Apache-licensed runtime. Implement the independently supported text transport now. Leave live launch closed where encrypted auth, included-only enforcement and complete runtime isolation lack established contracts. Missing commercial approval is not used as a reason to withhold documented protocol code.

Do not expose an unusable second account choice. The internal runtime registry contains actual constructor implementations, while `AiStatus`, protected credentials and portable attempts still describe only the delivered OpenAI connection owner. A transport's existence is not a capability declaration or a successful authentication. The registry is deliberately main-only and cannot be selected by renderer input or stored project data.

## Ownership and compatibility

The shared `TextRuntime` contract covers models, text execution, interrupt and close. Authentication remains provider-specific: an OpenAI access token is never passed to Grok. The existing main service uses the registry's Codex constructor; its account authorization, journal, operation digest, retention and lifecycle logic remain intact. No generic token broker, API-key adapter, hosted proxy or alternate endpoint was added.

Grok's real protocol component handles initialization, cached auth, a new session and one explicit prompt, text-only incremental updates, bounded data and cancellation/terminal outcomes. The launch owner refuses before child creation. Its missing implementation is tracked as missing, not credited as secure sign-in or funding enforcement. Only the runtime's actual current model is presently supported by the protocol component; other model controls and feature eligibility are unfinished.

The next integration must extend protected account/operation formats and portable provenance deliberately. Current provider IDs are constrained in shared/worker validators and cannot safely be broadened just in the UI. Preserve old credentials, operation hashes and transcript/finding records; allocate migrations from the then-current schema and update portable graphs/copies together. Independent copies never acquire execution authority. Switching requires an explicit selected account/provider and a fresh runtime session with reviewed transferred history.

This pass changes no SQL/AST/archive/compilation format: SQL/minimum reader **12**, AST/archive **1**, compilation **3** remain. No UI, preference, CSP, endpoint allowlist, dependency, runtime binary, credentials or project data changed. Existing uncommitted I13 work was present at entry and preserved. I13's status remains implementation complete awaiting user testing; no acceptance is inferred.

## Completion boundary

The whole I14 stage is **not complete**, and neither is its complete independent provider service. The runbook separates the implemented protocol component, exact technically unresolved methods, remaining integration engineering, channel permissions, distribution and observations. Live sign-in/inference remain unavailable; an approval reference alone cannot activate them. I15 and C/P/TE stages were not implemented. All native, provider and user outcomes remain unobserved and release remains NO-GO.
