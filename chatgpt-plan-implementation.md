# Direct ChatGPT-plan conversation milestone — DP01

October 3, 2026. **Implementation complete — awaiting Josh’s manual testing. No runtime success is claimed.** This is the active architecture decision for the requested personal, unpackaged proof of concept. It supersedes the Codex dependency for this milestone; the dated CD/I records remain historical. The [diagnostic reassessment](ai-integration-reassessment.md) describes the preceding state.

The acceptance target is one reviewed, synthetic claim-and-evidence conversation that completes through the user’s own ChatGPT plan authorization, remains saved, and can be reopened. This is not the P06 source-faithfulness implementation or a release milestone. The [manual guide](docs/manual-testing/chatgpt-plan-DP01.md) provides the exact request and expected observations.

## Decision and scope

Use app-owned Sign in with ChatGPT and direct HTTPS Responses requests in Electron main. This bounded text operation needs no Codex SDK, app-server, CLI subprocess, MCP, plugin, hosted backend or model tool executor. The existing durable conversation coordinator, IPC validation, content review, access checks, protection, cancellation and recovery remain the integration boundary.

Only the trusted, unpackaged development identity selects `local-chatgpt-plan`. Packaged identities retain their existing restrictions. Managed Codex profiles and credentials stay separate and are not read, copied, refreshed or converted by the new route. Codex-specific tool/logging refusals remain in the Codex owners. Commercial registrations remain null; commercial access, included-only enforcement, packaging and release approval remain unresolved.

The owner’s previously accepted normal subscription/account-spending policy remains limited to local development. The app uses the plan-authorized OAuth credential and never obtains or falls back to an API key. It never buys credits, enables top-ups or changes billing settings. Available account credits may still be used under the account’s settings; this implementation does not assert a provider-enforced included-only guarantee. OpenAI documents those account controls separately from API billing. [Accounts and sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)

## DP01 delivery

| Work | Source owners | Current state |
| --- | --- | --- |
| Initial and returning browser authorization | `main/ai/direct-auth.ts`, `direct-session.ts`, `direct-credentials.ts`, `storage.ts` | Implemented; browser/account outcomes unobserved |
| Explicit current account model discovery | `main/ai/direct-http.ts`, `direct-session.ts`; shared catalog and model selector | Implemented; account eligibility unobserved |
| One bounded streaming text response | `direct-http.ts`, `direct-operation.ts`, `service.ts` | Implemented; completed inference unobserved |
| Reviewed request, output protection, Stop and reopening | Existing `content-service.ts`, conversation worker/provider; new v4 binding and direct provenance | Integrated; runtime/persistence acceptance pending |
| Separate identity, plan, models and inference status | `shared/ai-direct.ts`, `features/ai-connections/DirectConnectionProgress.tsx` | Implemented; visible behavior pending |
| Record compatibility | [Format and consumer record](docs/formats/chatgpt-plan-v1.md) | SQL/minimum reader 13; retained migration; no historical provider conversion |

Paths beginning `main/` are relative to `src/`; renderer feature paths are relative to `src/renderer/src/`. Existing jose **6.2.12** validates tokens; Node HTTPS supplies transport. No dependency or lockfile change is required. Codex **0.160.0** remains installed for the historical route, with no invocation on this path.

The account owner protects a stable host ID before browser launch and the issued client ID before code exchange. Returning authorization reuses that registration and validates the selected identity. Credentials and rotating replacements are encrypted using the existing operating-system protected storage. A failed write retains the exact candidate for a local-only protection retry. Refresh is serialized; a lost rotation response cannot cause reuse of its possibly consumed refresh token. Status reads never refresh, discover models or send content.

The public plan catalog’s displayed entries populate the picker in server order. The request contains only the selected model, fixed text instructions, the exact reviewed prompt/context, `store:false` and `stream:true`. It has no tools, provider-side conversation, previous response ID, background operation or unsupported sampling/output controls. Only a valid `response.completed` event produces a completed attempt. Partial, failed, incomplete and interrupted outcomes remain distinct. Stop closes the local stream and does not claim remote cancellation or refunded usage. No inference retry occurs automatically. [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference), [preview contract](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)

Direct failures show the stage, actual HTTP status when available, safe machine code/field, error-body shape and request reference. Raw provider prose, callback URLs and tokens are excluded. These detailed connection diagnostics are session-local; the saved conversation retains its outcome, reason, model, route provenance and actual output. Capture diagnostics before changing the connection or quitting. [Error and recovery contract](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery)

## External prerequisites and boundaries

The official desktop cookbook explicitly includes personal projects running locally, alongside open-source and selected private apps. Its paid/hosted-app access requirement applies before offering the integration to users. The quickstart continues to restrict commercial/private participation. This provides the documented basis for this owner-operated local milestone; it does not classify every private prototype as approved or authorize distribution of Collie. Local execution itself is not a commercial exemption. [Desktop cookbook and usage terms](https://learn.chatgpt.com/cookbook/articles/sign-in-with-chatgpt), [availability](https://developers.openai.com/siwc/quickstart)

Before the manual request can succeed, Josh needs an eligible account/workspace, successful browser consent for plan usage, available usage and a returned model that accepts the request. Network access to the documented OpenAI origins, a system browser and macOS/Windows protected storage are also necessary. No account eligibility or remaining allowance has been inspected. No actual external refusal has yet been observed. If OpenAI refuses registration or admission, retain the exact stage/status/code; distinguish that result from a local implementation error. Do not turn either into a general requirement to finish a public app or submit a commercial form before this personal test.

Dynamic registration requires no prefilled app registration, client secret or partner API key. The issued ID comes from the validated callback, not an invented configuration value. [Registration contract](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [token reference](https://developers.openai.com/siwc/token-sharing-open-source/token-reference)

DP01 does not activate proofreading, P06, Grok or any later AI stage. Proofreading history and local review remain; its Run capability is unavailable on the direct conversation route. The historical Codex isolation issues still apply to Codex execution if that route is revisited. Release remains **NO-GO**. Next action is Josh’s [manual acceptance](docs/manual-testing/chatgpt-plan-DP01.md), followed only by fixes to reported results or separately requested work.
