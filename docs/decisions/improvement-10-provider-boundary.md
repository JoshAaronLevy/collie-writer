# I10 — Provider boundary blocked at entry

October 2, 2026. **Blocked — production provider boundary not implemented.** Documentation and owner preparation are delivered; they are not completion of I10.

## Decision and evidence

The [I10 entry gate](../../app-improvement-plan.md#stage-i10--implement-the-first-eligible-provider-boundary) requires applicable commercial/runtime permission and authoritative included-only funding enforcement before implementation. It explicitly says to report the stage blocked when either is missing. Josh confirmed during this request that commercial approval has not been obtained and asked for help with the process.

The selected conditional route remains approved Sign in with ChatGPT plus isolated Codex app-server; the Codex SDK preference is preserved if its exact approved auth bridge is supported. The October 2 refresh in the [provider record](../ai/provider-eligibility.md#i10-openai-refresh--october-2-2026) keeps A-OPENAI and F-OPENAI unresolved. The [owner guide](../ai/openai-approval-guide.md) supplies the official application link, accurate draft product description and concrete provider questions. No application, message, registration, login or inference was sent.

Reading the public adapter is useful engineering evidence, but it does not provide Collie's approval or establish included-only funding. Adding nominal interfaces, an unavailable adapter or a hidden login path would not deliver this stage. No production SDK, provider service, credential store, IPC or packaging changes are made in this handoff.

## Source integration map for resuming the same stage

These are existing owners read during the I10 review and the work required after its gates resolve. The right column describes pending work, not implemented methods or provider API names.

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

## Remaining I10 deliverables, in dependency order

1. Record A-OPENAI approval and F-OPENAI enforcement evidence, including exact route, scope, effective date and unresolved conditions. Reconcile public documentation with the actual supplied contract; do not treat a client ID or waitlist receipt as inference permission.
2. Select the allowed runtime/SDK release. Read its official README/types without executing it, establish supported tool/config isolation, and record binaries/licenses/platforms/channel limits. No release is pinned speculatively in this handoff.
3. Implement protected, Collie-scoped auth/session ownership and a domain contract for status, connect/cancel, refresh, disconnect, per-operation eligibility, bounded start/stream/cancel and normalized errors. Map it to actual supported methods; stable attempt/connection/operation IDs must reject late results from cancelled or replaced sessions.
4. Implement main authorization for project scope, selected account/workspace/model/capability and the binding funding restriction across every internal request. Unknown funding or unavailable secure storage must make inference unavailable. Exclude ambient keys/endpoints/config, project filesystem access, tools, plugins/MCP and subagents.
5. Integrate exact IPC and lifecycle events; distinguish success, failure, partial, interrupted and unknown outcomes. Retain submitted context and partial output for the later transcript owner; never infer rollback or automatically replay an uncertain request.
6. Update privacy, packaging/notices, decisions and I10 evidence. Native acceptance remains pending the real I11/I12 flows; do not add scripts or special UI to observe an internal service.

SQL/minimum reader **10**, AST/archive **1**, compilation **3** remain unchanged. No migration or device-local preference was added. I11–I15 remain unimplemented; I14 is deferred. Existing commerce, signing, store, output-fidelity and release NO-GO gates remain independent.
