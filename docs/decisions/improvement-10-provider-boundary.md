# I10 — Provider engineering and separate activation gates

October 2, 2026. **Revised plan: ready for local engineering; provider implementation not yet delivered.** This record supersedes the initial all-code entry veto at Josh's request. Planning/documentation delivery is not provider implementation or user acceptance.

## Current decision

The [revised I10 brief](../../app-improvement-plan.md#stage-i10--develop-the-first-provider-boundary-and-retain-activation-gates) separates three parts within the same stage: supported local engineering, live development access and commercial activation. Commercial approval and included-only funding evidence are not prerequisites for writing supported code. Missing provider inputs block only their dependent actions or exact unresolved methods. A future I10 request must implement independent real components and document remaining gaps, rather than return only another approval guide.

I10 owns later provider configuration, route-dependent changes and activation without requiring Josh to rerun I01–I09. I11–I13 remain separate requests; actual delivered contracts let their local UI/persistence/review work proceed while live access is pending. Existing ownership, formats, manual acceptance and release gates remain intact.

A Collie development profile separates identity/data; it is not evidence of a publicly available provider OAuth sandbox or a permission exemption. Real browser login requires a supported route permitted for the current channel and valid registration/configuration. Authentication may be available while inference is blocked if that route permits it. Every inference, including development, still needs binding included-only funding, session/model eligibility and trusted Collie editing scope. Unknown funding refuses dispatch. No API-key, paid-credit/top-up fallback or commercial built-in-login workaround.

The conditional technical route remains Sign in with ChatGPT plus isolated Codex app-server, with SDK preference only where its exact authentication bridge is documented. Read actual pinned README/types/license without invoking the SDK. Implement real supported methods, not invented login calls, canned successes or an empty registry reported as completed integration. Track each component as implemented, technically blocked with its exact missing contract, awaiting configuration/access, or awaiting user observation. Route-specific funding enforcement that cannot yet be coded remains an explicit code gap, alongside the real refusal behavior.

## Initial disposition — historical and superseded

The initial October 2 entry review interpreted commercial permission and authoritative funding evidence as prerequisites for all I10 implementation. Josh confirmed no commercial approval, and the review delivered the [owner guide](../ai/openai-approval-guide.md) and source map below instead of production code. This blanket engineering restriction is superseded by the current decision; its provider findings remain dated evidence. A-OPENAI and F-OPENAI remain unresolved in the [provider record](../ai/provider-eligibility.md#i10-openai-refresh--october-2-2026). No application, registration, login, inference or provider contact was performed. No SDK, service, credential store, IPC or packaging change has been delivered yet.

## Source integration map for resuming the same stage

These are existing owners read during the I10 review and the engineering work to implement when I10 is requested. Dependent live/activation steps stay gated individually. The right column describes pending work, not implemented methods or provider API names.

| Existing owner / contract | I10 integration responsibility |
| --- | --- |
| `src/main/security.ts`, `windows.ts`, `ipc.ts` | Preserve renderer network/navigation restrictions, sandbox/context isolation and exact main-frame sender checks. Approved browser launch and provider networking belong to main, without a generic renderer URL/HTTP/command API. |
| `src/main/projects-ipc.ts`, `src/shared/schemas.ts`, `src/preload/index.ts` | Follow exact bounded envelopes, request correlation and response/event validators for named AI operations. Do not send credentials, runtime handles, arbitrary provider options or unfiltered error bodies to the renderer. |
| `src/main/entitlements/service.ts`, `src/domain/capabilities.ts` | Add explicit main-side authorization for new inference with current trusted project/workspace editing scope. Existing `authorize(ProjectCommand)` protects worker commands; an inference service must not bypass access checks simply because it does not call the worker. Existing buffer-drain permissions do not authorize new AI requests. |
| `src/main/lifecycle.ts`, `index.ts` and `src/renderer/src/features/workspace/` | Integrate running-operation settlement into persistent draft/close ownership and `prepareUpdateRestart`. Preserve partial/unknown outcomes and user cancellation; no automatic inference replay or forced shutdown that loses drafts. I12 owns portable transcript persistence. |
| `package.json`, `electron-builder.yml`, `electron-builder.direct.cjs` | Pin a permitted runtime/SDK and licenses only after route selection. Specify macOS arm64/x64 and Windows x64 resource/signing strategy without PATH discovery, silent runtime downloads or ambient developer credentials. No AI runtime is currently declared in the package manifest. |
| `docs/privacy/stage-19-file-and-network-inventory.md` | Record actual approved endpoints, bounded context, protected device-local credentials/runtime records, retention and diagnostics exclusions when implemented. Current renderer restrictions and local content boundaries remain. |
| `src/renderer/src/features/settings/ConnectionSettings.tsx` | Existing UI truthfully says AI connections are unavailable. I11 later owns real connect/status/disconnect controls; I10 must not install a testing UI or advertise an eligible connection in advance. |

The I03 decision remains authoritative for persistent draft ownership, exact retries and close/access transitions. I09's local journey is implemented but has no supplied user acceptance. No selected project file or private provider profile was inspected.

## Remaining I10 deliverables and activation responsibilities

1. Select the documented SDK/runtime release and permitted local-development dependency. Read README/types/license without execution; record actual methods, platform resources/notices and precise technical gaps. Pending commercial approval alone does not prevent this engineering.
2. Implement protected, Collie-scoped auth/session ownership and real status/connect/cancel/refresh/disconnect, bounded start/stream/cancel and normalized errors. Keep missing registration inputs unset. Use stable attempt/connection/operation IDs and supported methods; no simulated responses.
3. Implement separate implementation/configuration, channel permission, session/capability and funding states. Add main authorization for project editing scope and selected account/workspace/model. Implement supported enforcement where documented; funding unknown refuses dispatch and unresolved provider-specific enforcement remains explicitly pending. Exclude ambient keys/endpoints/config, filesystem access, shell/web tools, plugins/MCP and subagents.
4. Integrate narrow IPC and persistent close/update ownership, including partial/interrupted/unknown outcomes, cancellation and sanitized events. Never automatically replay inference. I12 later owns portable transcripts.
5. Update actual privacy flows, runtime packaging/notices, non-secret configuration/runbook, component checklist and user-owned guide. Shipping unresolved runtime resources remains separately gated. No test-only UI, mocks or assistant execution is authorized.
6. When supported development access/configuration arrives, resume I10's actual route integration. Login depends on its applicable permission; inference additionally needs binding included-only funding. Incorporate actual A-OPENAI/F-OPENAI evidence for commercial activation later in this same stage; a waitlist receipt or client ID is not sufficient permission. Do not require earlier stages to be repeated.
7. Record engineering delivery separately from access, commercial activation and user observations. Missing code means engineering partial; delivered independent engineering does not mean usable AI. Real native observations use the later I11/I12 production flows, not probes or special testing screens.

SQL/minimum reader **10**, AST/archive **1**, compilation **3** remain unchanged. No migration or device-local preference was added. I11–I15 remain unimplemented; I14 is deferred. Existing commerce, signing, store, output-fidelity and release NO-GO gates remain independent.
