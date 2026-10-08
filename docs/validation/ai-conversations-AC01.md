# AC01 implementation record

October 8, 2026. **Implementation complete — awaiting user testing.** No user runtime acceptance or live response is recorded.

The [decision/extension contract](../decisions/ai-conversations-AC01.md) records the current official provider evidence, frozen historical behavior, research eligibility distinction and distribution gates. The [manual guide](../manual-testing/ai-conversations-AC01.md) covers the actual text-exchange milestone and offline transcript access. Scope is AC01 only.

## Changes

- `src/shared/ai-capabilities.ts`, `src/main/ai/capabilities.ts`, `src/shared/ai.ts`, `src/shared/ai-route.ts`, `src/main/ai/service.ts`: main-owned transient capability envelope with exact route/account/model/catalog/review binding and strict IPC consistency. Text mirrors existing readiness; web research separates missing implementation from unknown provider eligibility. No probe, capability cache, new IPC command or dispatch grant.
- `src/main/ai/direct-session.ts`: allow still-valid access while refresh is premature/unavailable; retain catalog failure reasons; enforce account-session request-contract refusals in both availability and execution and retain their diagnostic.
- `src/main/ai/direct-errors.ts`, `connection-health.ts`, `src/shared/ai-direct.ts`: distinguish confirmed unusable tokens from generic admission/subscriber failures; preserve bounded indexed field names; model-specific unsupported capability requires explicit model replacement; fixed capability/route refusals survive catalog refresh and reauthorization within the app session.
- Shared connection UI `ChatGptConnectionDetails.tsx`, `DirectConnectionProgress.tsx`, `connection-copy.ts`: separate Web research disclosure and accurate recovery copy. Existing dialog, state, focus and preparation owners remain; no new effects or background work.
- Root plan, this record, decision, guide and AGENTS checkpoint record stage scope and outstanding acceptance.

## Compatibility and inspection

No dependencies, persistence formats, migrations, direct v4 instructions/digests, portable messages/captures, archive/copy/retention behavior or existing transcript dispatch/handoff owners changed. Current SQL/minimum reader remains 16. New capability status is transient and checked by the existing shared/preload boundary. `direct-auth.ts`, `direct-http.ts`, `direct-operation.ts` and `deployment.ts` were inspected against the cited official contract; their frozen request and route policy remain unchanged.

React source review: the two changed components retain semantic description lists, contextual disclosure and the existing controller; no hooks, subscriptions, focus actions, async effects, dependencies or raw provider-message rendering were added. This source inspection is not a passed runtime or accessibility test.

## Required checks

Using `.tools/node-v24.21.0-darwin-arm64/bin` first on PATH, `npm run format`, `npm run lint` and `npm run typecheck` completed with exit 0 and no remaining warnings/errors. Typecheck covered both node and web configurations. Initial lint found two unnecessary regex escapes in the new indexed-field handling; those were corrected and format/lint rerun cleanly before typecheck. Format/lint scopes exclude vendor/generated assets and historical test infrastructure. Repository formatting also removed one trailing blank line from `uat-notes.md`; its content is unchanged.

No tests, builds, app launches, probes, browser automation, live provider requests, credential inspection or fault injection were performed or added. Official public documentation was read; source inspection and code-check success do not establish runtime acceptance.

## Acceptance and remaining gates

User results: **none recorded**. The live development response, native sign-in/renewal/revocation, stream compatibility, interrupted outcome protection, reopen behavior and visual/accessibility observations remain unobserved. The guide distinguishes these from code-check success. Catalog/sign-in success cannot satisfy the actual-response milestone.

Commercial registration/permission, included-only enforcement and the installed adapter remain blocked in source; native signed packaging acceptance is outstanding. Web research requires AC06 implementation and observed account/model eligibility. Automatic context and the remaining conversation experience require AC02–AC08. Release remains **NO-GO**. Stop for Josh's results before another stage.
