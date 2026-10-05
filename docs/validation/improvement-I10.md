# I10 status and evidence

October 2, 2026. **Independent local implementation delivered — awaiting user testing; I10 overall remains partial.** Funding enforcement, complete runtime isolation, authentic route configuration and packaged distribution remain incomplete/unavailable. No working-provider, runtime or user acceptance is claimed.

## Engineering implementation — October 2, 2026

The latest request explicitly authorized I10 implementation under the revised development-first brief. The working tree began clean. Shared plan contracts, I10, prerequisite I03/I09 records, applicable repository guidance and main/preload/storage/access/security boundaries were read. Josh's I07/I08 notes and all model/effort recommendations remain intact. I01–I09 were not reimplemented.

| Delivered code/documentation                                                                                                              | Responsibility                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/ai.ts`, `src/preload/ai.ts`, preload/commands integration, `src/main/ai/ipc.ts`                                               | Exact typed and validated connection, model, captured-operation, recovery/protection and sanitized event contracts; trusted-frame authorization            |
| `src/main/ai/deployment.ts`, `errors.ts`                                                                                                  | Per-channel source-owned registration, explicit funding/isolation refusals and bounded non-secret errors                                                   |
| `src/main/ai/openai-auth.ts`, `openai-http.ts`                                                                                            | Browser/public-client OAuth callback, PKCE/state/nonce, signed identity/access-token checks, bounded provider requests, refresh and revocation             |
| `src/main/ai/storage.ts`                                                                                                                  | Encrypted credential/operation formats, stable host/account mapping, pending rotation/sign-out intent, retained atomic-write candidates                    |
| `src/main/ai/codex-runtime.ts`                                                                                                            | Pinned development binary resolution, isolated process/profile, real JSON-RPC methods and streaming/cancel/terminal-event handling; no inference activated |
| `src/main/ai/service.ts`                                                                                                                  | Main-owned connection/operation lifetime, context digest, exact replay, coalesced local protection, interrupted/unknown recovery and disk-only retry       |
| `src/main/entitlements/service.ts`, `src/main/lifecycle.ts`, `src/main/index.ts`                                                          | Main editing authorization, pending-work access guard, existing close/update/suspend/renderer-loss settlement                                              |
| `package.json`, `package-lock.json`, bundled jose notice/inventory/NOTICE                                                                 | Exact `jose` 6.2.12 production dependency and Codex CLI 0.160.0 development dependency                                                                     |
| [Runtime runbook](../ai/provider-runtime.md), decision, manual guide/index, provider/approval records, privacy inventory, plan and AGENTS | Delivered component map, remaining methods/configuration, downstream ownership and honest partial handoff                                                  |

There is now real provider code; this is not an empty registry or another approval-only handoff. No registration has been populated, no funding policy invented, and no complete text-only runtime guarantee asserted. `requireIncludedFunding` and `requireTextOnlyRuntime` deliberately refuse. Their provider-specific enforcement is still missing engineering and must be completed in I10 using actual documented controls. Native/packaged runtime delivery is also pending. The [runbook component matrix and remaining-work list](../ai/provider-runtime.md) are authoritative for what is implemented versus pending.

I11 can consume the actual status/connect/cancel/refresh/disconnect contract and unavailable reasons without a live account. I12 can use the delivered operation/capture/recovery contract for its local persistence/UI work. Neither stage was implemented here. Existing Settings/onboarding continue to report AI unavailable; no special testing UI was added.

### Sources and execution limits

The OpenAI Docs skill was used to search/open official documentation and read the protocol/sign-in/session/token/configuration pages linked in the runbook. The actual installed CLI package README, launcher and package metadata were read without running it. Official evidence still does not establish Collie's approval, authoritative included-only funding, or complete no-tool/config/diagnostic isolation for this pinned release.

Dependencies were installed with exact versions and lifecycle scripts, audit and funding output disabled. npm reported the already recorded engine mismatch: install shell Node 22.22.3/npm 10.9.8 versus repository Node 24.21.0/npm 11.19.0. This is install output, not runtime/build acceptance. No package script or Codex binary was invoked.

No tests/test code, fixtures, harnesses, checks, typecheck, lint, formatting, audit, build/package validation, app/dev-server/browser launch, screenshot, SDK/runtime execution, sign-in, inference, external submission, outreach or CI was performed. Source and Git reads are not passed tests. No private profile or saved user project was inspected.

### Persistence and pending observations

Portable SQL/minimum reader **10**, editor AST **1**, archive container **1** and compilation **3** remain unchanged. I10 adds device-local encrypted `ai/credentials-v1.json` and per-operation journal envelopes under the verified working root, plus private runtime directories only when a permitted operation actually starts. These never enter project snapshots/exports. No existing data migration or cleanup runs, and no AI files were created in normal app data during implementation.

All native credential/callback, OAuth/refresh/revocation, model/funding, streaming/cancel/recovery, close/update, deployment and content-isolation behavior remains unobserved. The current user guide covers document review and existing local UI continuity; live-path observations must await authentic inputs and the real I11/I12 screens. User results: **none supplied**. Release remains **NO-GO**.

## Earlier plan revision — October 2, 2026 (before implementation)

Josh approved developing the supported integration locally before commercial approval and requested that the correction live in I10 and subsequent stages. The revised plan makes I10 own engineering now and later provider configuration/activation. I01–I09 require no reimplementation; their existing contracts and unreported acceptance remain intact. I11–I13 may develop their local production features against actual delivered code contracts while live access is pending; I14 applies the same distinction only when separately requested. I15 and the ledger distinguish engineering, usable AI, commercial activation and user acceptance.

Commercial permission is not a universal code-writing gate. Actual sign-in still requires a supported permitted route and configuration, and all inference still requires binding included-only funding, including development. An isolated Collie development profile is not a claim of a provider OAuth sandbox. Missing methods remain explicit partial-engineering gaps; mocks/placeholders cannot satisfy delivery.

Changed documentation: `app-improvement-plan.md`, `AGENTS.md`, this record, the I10 decision/manual guide, manual guide index, provider eligibility record and approval guide. The approval guide now supports activation without blocking independent code development. No production source, dependency, format or account change was made. I10 is not implemented by revising its brief; implementation awaits a subsequent explicit request. No tests/checks/builds/launches, SDK invocation, sign-in, inference, submission or outreach were performed. Release remains NO-GO.

## Historical entry review — superseded engineering restriction

The following initial findings and repeated-request notes preserve the earlier disposition. Their statements that approval blocks all implementation are historical, not current instructions. The current authority is the revised I10 brief and decision above.

## Scope and findings

The full improvement plan was read, including confirmed decisions, every stage brief, shared contracts and the completion ledger. I01 provider evidence, I03 session ownership and I09's current local-journey record were read. The source boundaries examined for I10 are mapped in the [decision](../decisions/improvement-10-provider-boundary.md). Git began clean. Josh's I07 sidebar and I08 source-usage notes remain unchanged.

Official OpenAI documentation was refreshed using the OpenAI Docs skill: commercial participation/client-ID process, SDK and app-server authentication, the subscription OAuth adapter, inference, tokens, preview limitations, usage controls and errors. The [provider record](../ai/provider-eligibility.md#i10-openai-refresh--october-2-2026) cites the findings. Other providers' October 1 evidence was retained, not presented as newly researched or used as a workaround.

Josh explicitly confirmed that he has not obtained commercial approval and does not know the approval process. The [owner guide](../ai/openai-approval-guide.md) responds with the current official form, draft description and questions. No application status beyond that statement is assumed. The assistant submitted nothing and contacted nobody.

| I10 requirement                                                           | Status                                                                                                                                                                             |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Applicable commercial permission (A-OPENAI)                               | Not obtained; owner-confirmed. Blocks implementation under I10's entry rule.                                                                                                       |
| Binding included-only funding (F-OPENAI)                                  | Not established by reviewed public material. Error refusal is documented, but client-enforced exclusion of available credits across settings changes/internal calls is unresolved. |
| SDK/runtime, credential service, IPC, execution, close/update integration | Not implemented; dependent on the exact approved route and funding control.                                                                                                        |
| Desktop packaging, licenses and new privacy flows                         | No provider artifact selected or flow added; implementation remains pending.                                                                                                       |
| User/native/funding observations                                          | No results supplied. Later I11/I12 UI is required for production interaction.                                                                                                      |

## Changed documentation

| Path                                                                                                 | Result                                                                                                            |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| [Approval guide](../ai/openai-approval-guide.md)                                                     | Practical owner application steps, accurate prepared wording and evidence needed to resume                        |
| [Provider eligibility](../ai/provider-eligibility.md)                                                | Dated OpenAI refresh, owner-confirmed missing approval and unresolved funding distinction                         |
| [I10 decision](../decisions/improvement-10-provider-boundary.md)                                     | Blocked disposition, existing source owners and remaining implementation sequence                                 |
| [Manual review guide](../manual-testing/improvement-I10.md) and [index](../manual-testing/README.md) | Document-only review; no nonexistent provider UI or probes                                                        |
| [Improvement plan](../../app-improvement-plan.md) and [AGENTS.md](../../AGENTS.md)                   | Requested-but-blocked I10 status, links and current handoff; reconciled stale I08 reference to I09 as not started |
| This record                                                                                          | Scope, evidence, unchanged formats and pending work                                                               |

## Execution and compatibility

No production code, package, lockfile, build configuration, runtime binary, credentials, account setting or saved project was changed. SQL/minimum reader **10**, editor AST **1**, archive container **1**, frozen compilation **3** remain; no migration occurred. The privacy inventory has no new application flow to record.

No tests, test code, fixtures, harnesses, checks, typecheck, lint, formatting, builds, app/server/browser launches, screenshots, probes, SDK invocation, sign-in, inference, external submission, CI or publication were performed. Reading public documentation is not a native/runtime observation.

I10 stays blocked until the required provider evidence exists and its implementation is completed. Approval alone does not resolve funding; neither resolves all engineering or user acceptance work automatically. I01–I09 acceptance remains unreported, I11–I15 were not advanced, and release remains **NO-GO**. The [manual review guide](../manual-testing/improvement-I10.md) is the current handoff.

## Historical repeated I10 request — October 2, 2026 (before the plan revision)

The full plan and existing I10 decision/evidence were reviewed again after Josh repeated the implementation request. The earlier uncommitted I10 documentation was preserved. No new approval or included-only funding evidence was supplied, and the explicit entry rule is unchanged. The Purpose and status summary and I09's forward reference still described I10 as not started; both now agree with its detailed blocked status. This follow-up changes only the plan and this record. It does not repeat the earlier public-document research or claim new provider evidence, production implementation, testing or acceptance. The existing owner guide remains the next actionable handoff.
