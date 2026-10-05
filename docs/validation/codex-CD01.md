# CD01 implementation record

October 2, 2026. **Implementation complete — awaiting user testing (document review).** User results: none supplied. Working tree began clean. CD02–CD09 remain not started; I10 commercial and I14 remain partial, release **NO-GO**.

## Review basis

Read the entire Codex implementation plan, applicable AGENTS/manual-testing rules, I10/I11 decisions and evidence, provider runbook/approval guide, current AI service/storage/runtime/IPC/preload/renderer consumers and profile/privacy ownership. Read installed pinned package metadata/launcher without invocation, current official OpenAI authentication/app-server documentation, and the public 0.160.0 source/types. The [decision](../decisions/codex-CD01.md) records full-plan findings, narrow provider-scope uncertainty and precise remaining stage ownership.

## Delivered owners

| Paths                                                                                                                                                    | Change                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/main/ai/deployment.ts`                                                                                                                              | Source-owned local spending policy and trusted unpackaged/release-identity selection; explicit packaged development refusal; registered auth cannot fall through from the local route. Registrations and commercial funding/isolation refusals remain. |
| `src/shared/ai-route.ts`, `src/shared/ai.ts`                                                                                                             | Discriminated route, session, funding and feature unavailability; connection-only reasons; exact status and named-channel response validation. No ready branch is permitted yet.                                                                       |
| `src/main/ai/service.ts`, `ipc.ts`, `src/preload/ai.ts`                                                                                                  | Actual local unavailable snapshot, separate commercial snapshot, shared response validation at both boundaries, guarded registered methods and blocked local prepare/dispatch. Local recovery/replay/protection stays available.                       |
| `src/main/ai/operation-identity.ts`, `storage.ts`, `local-session-metadata.ts`                                                                           | Frozen original v1 canonical digest, explicit registered-v1 storage ownership, separate exact managed-session metadata declaration. No new persistence or migration activated.                                                                         |
| `features/ai-connections/connection-copy.ts`, `AiConnectionPanel.tsx` under renderer                                                                     | Existing surfaces explain normal local subscription/credit spending and separate feature readiness; commercial copy retains included-only requirements. Uses existing semantic CSS and Mantine.                                                        |
| Renderer conversation/proofreading providers                                                                                                             | Both existing Send/Run predicates additionally consult their main-supplied feature availability. No feature inference flow or new UI was added.                                                                                                        |
| Decision, [protocol map](../ai/codex-local-contracts.md), [compatibility](../formats/codex-local-v1.md), [manual guide](../manual-testing/codex-CD01.md) | Pin-specific methods/fields/network effects, keyring namespace, unresolved execution isolation, exact version ownership and manual outcomes.                                                                                                           |
| Codex plan/AGENTS, current I10 decision/runbook/approval/provider guide, improvement-plan scope note, privacy/manual index                               | Bounded current cross-references reconcile the accepted local policy without rewriting historical observations or changing commercial gates.                                                                                                           |

## Unchanged contracts and limits

SQL/minimum reader **12**, AST/archive **1**, frozen compilation **3** are unchanged. No portable error vocabulary, operation digest bytes, library dependency, lockfile, license, project storage migration, release/build configuration, profile selector, historical testing hook or global stylesheet changed. Managed metadata has no reader/writer yet. New operation v2 is reserved for CD04 and is refused by the current exact v1 reader. All 64-operation/worker-binding capacity limits remain; CD08/C07 owns handoff.

No copied assistant/user credentials, runtime invocation, account login, inference, registration, outreach, publication or account-spending change occurred. The Codex binary remains a development dependency and packaged resolution still refuses. No model catalog or connected account was fabricated. The local route records provider classification unresolved and cannot enable either feature. Upstream source inspection establishes available contracts, not complete text-only isolation or native behavior.

No tests, test code, fixtures, mocks, harnesses, CI, verification scripts, suites, typecheck, lint, formatting/audit checks, build/package commands, app/dev-server/browser launches, screenshots, benchmarks, protocol generation or probes were added/run. Public source downloads were for reading only; nothing from them was executed. Ordinary source and Git reads are not passed tests.

## Observation ledger

| Area                                                                 | Outcome                         |
| -------------------------------------------------------------------- | ------------------------------- |
| Owner policy/document review                                         | Awaiting Josh                   |
| Settings/status wording and local continuation                       | Implemented; unobserved         |
| Native packaging refusal, IPC, UI/keyboard/CSP                       | Source changes only; unobserved |
| V1 journal replay/recovery and unchanged project portability         | Preserved in source; unobserved |
| Managed browser login/keyring/resume                                 | CD02 not implemented            |
| Complete runtime isolation and model/action readiness                | CD03 not implemented            |
| Route-bound durable dispatch and real conversation/proofread results | CD04–CD06 not implemented       |
| Integrated lifecycle, C07 handoff and owner acceptance               | CD07–CD09 not implemented       |

Stop after the [manual guide](../manual-testing/codex-CD01.md) for Josh's results. Implementation completion is not provider, native or release acceptance.
