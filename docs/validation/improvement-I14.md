# I14 implementation record

October 2, 2026. **Engineering partial — Grok ACP transport component delivered; second-provider integration incomplete.** No provider login, inference, runtime installation/invocation or user acceptance occurred. This is not a usable multi-provider milestone.

## Work delivered

| Paths                                                                         | Result                                                                                                                                                                                |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main/ai/grok-runtime.ts`                                                 | Real ACP initialization/cached-auth/session/prompt protocol, incremental agent text, current-model catalog, bounded frames/output, cancellation/terminal mapping and process teardown |
| `src/main/ai/grok-deployment.ts`                                              | Pinned source-reference identifier and explicit pre-spawn refusal; documents the missing protected launch methods without implementing a bypass                                       |
| `src/main/ai/runtime.ts`, `registry.ts`                                       | Shared text-operation interface and main-only Codex/Grok transport constructors                                                                                                       |
| `src/main/ai/codex-runtime.ts`, `service.ts`                                  | Codex uses the common update/interface and registry constructor; account/operation behavior and existing refusals retained                                                            |
| `docs/ai/grok-runtime.md`, provider eligibility/runtime records               | Official route/source evidence, implemented protocol, unfinished components, provider-specific funding/access, distribution and privacy requirements                                  |
| Decision, this record, manual guide/index, plan, AGENTS and privacy inventory | Honest partial checkpoint and concrete continuation without previous-stage reimplementation                                                                                           |

The full improvement plan and shared rules were reviewed. I10/I11 records, current I12/I13 boundaries, provider types, deployment, runtime, credential storage, operation service and packaging source informed scope. Official Grok/Claude/ACP pages and the pinned public Grok source were read without execution. See the [runbook](../ai/grok-runtime.md) for primary-source links and exact remaining work. The internal registry has two real transport classes, but only the existing OpenAI account service is exposed. No nominal connection card or canned success was added.

## Incomplete components

Grok protected browser authentication/account lifecycle, binding included-only funding, complete isolated launch, pinned binary resources/notices/signing, provider-aware account/operation persistence, portable provenance migrations, model/capability eligibility, renderer selection and shared journal/content-service dispatch are **not implemented**. Missing methods are not solely approval/configuration tasks; their technical contracts and engineering remain required. General consumer credit behavior does not establish included-only execution. The pre-spawn refusal is not itself completion of those requirements.

I14 does not change working SQL/minimum reader **12**, AST/archive **1** or compilation **3**. No dependency/lockfile, schema, portable reader, UI, private profile, credential, runtime artifact or test file was modified. The initial working tree contained the uncommitted I13 implementation; it was preserved. No earlier stage acceptance, release artifact or provider approval is inferred.

## Observations and handoff

No tests, test code, fixtures/mocks/harnesses, checks, typecheck, lint, formatting, audit, build/package, app/dev-server/browser launch, screenshot, probe, benchmark, runtime/SDK invocation, sign-in/inference, registration, provider contact, publication or agent delegation occurred. Ordinary source/Git/document reads are not passed tests. User-reported results: **none**.

Runtime framing/streaming/cancel/error behavior, native process handling, account funding/privacy and product switching remain unobserved. Current UI cannot exercise the new transport, and no testing-only interface was added. The [manual guide](../manual-testing/improvement-I14.md) covers document review and unchanged local-product continuity only. I14 must be resumed for remaining engineering; no automatic advance to I15. Release remains **NO-GO**.
