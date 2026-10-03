# OpenAI approval steps for Collie Writer

October 2, 2026. **Draft for Josh; nothing submitted or approved.** I10's local engineering can proceed under the revised plan; commercial activation and eligible inference remain pending. Josh confirmed that approval has not been obtained and asked what is needed. This guide provides the current application route and prepared wording; it cannot promise admission or a response date.

## Scope: commercial activation only

The [Codex development plan](../../codex-implementation-plan.md) and [CD01 decision](../decisions/codex-CD01.md) define Josh’s distinct owner-only unpackaged managed-Codex route. It follows his accepted normal subscription/account credit settings, without API-key fallback or app-initiated billing changes. No domain, company email, merchant setup, hosted callback or interest-form submission is a technical prerequisite to that local engineering. Provider classification of this new private POC remains unresolved; CD01 grants no approval and enables no login/inference. The steps and included-only requirement in this guide concern commercial activation, whose approval is still absent.

## Commercial application steps

1. Open the official [Sign in with ChatGPT interest form](https://openai.com/form/sign-in-with-chatgpt-interest/), which OpenAI's [Request a client ID](https://developers.openai.com/siwc/request-client-id) page identifies as the commercial waitlist.
2. Select **Sign in and ChatGPT plan use for AI requests**. Collie needs permission to perform inference against the user's plan; identity-only sign-in is insufficient.
3. Supply your real contact name, work email, company/business name and website. The form currently requires those fields; job title is optional. Use the product description below. If you do not yet have a suitable business name or website, leave the draft pending until you can supply accurate details; this repository does not establish a legal seller identity or a public website. No account creation, external registration submission or website publication is authorized by a stage request; I10 owns the code/configuration consuming authentic registration inputs when supplied.
4. Ask for the desktop integration and funding details below, either in the description field if space permits or in follow-up with the program contact. Keep a private copy of any submission and reply. Joining the waitlist is not approval.
5. Bring back a non-secret approval reference and the technical documentation OpenAI supplies. We can then reconcile its access/activation conditions and finish route-dependent configuration/code within I10. Independent supported engineering can be requested before this evidence arrives; I01–I09 do not need to be repeated. Do not paste access/refresh tokens, authorization codes, client secrets or private account files into the repository or chat.

The field names and choices above come from the [current form](https://openai.com/form/sign-in-with-chatgpt-interest/). The public [quickstart](https://developers.openai.com/siwc/quickstart) describes limited commercial availability; neither the form nor the client-ID page promises acceptance or a timetable.

## Product description to adapt for the form

> Collie Writer is an in-development commercial desktop application for nonfiction writing and research on macOS and Windows, built with Electron, React and TypeScript. It has local writing, research, citations, project files and export functionality. We would like to add optional AI conversations and human-reviewed proofreading through each writer's own eligible ChatGPT subscription, with browser sign-in and no copied API key.
>
> Our preferred execution integration is the Codex TypeScript SDK, or the documented local Codex app-server adapter where that is the supported commercial route. The planned integration would send only user-selected writing or research context directly to OpenAI. We would not host manuscripts or provide a shared inference account. AI suggestions would require an explicit user action before changing writing.
>
> A core product requirement is subscription-included usage only: when that allowance is unavailable, AI must stop without spending purchased credits, using automatic top-ups or falling back to API-key billing. Please advise whether this desktop use case qualifies, which registration/runtime route we should use, and which provider-enforced control can guarantee that funding behavior. The local provider boundary is partially implemented; live AI is not enabled.

This is a description of Collie's existing local work and proposed AI behavior, not a claim that the integration, security boundaries or funding enforcement have shipped. Add only accurate owner-supplied business, website and launch information; no audience size, adoption figures or release date are assumed.

## Questions for OpenAI

These are Collie's engineering questions, not an assertion that the program requires this exact questionnaire.

1. **Commercial scope and registration:** Can paid Collie Writer use Sign in with ChatGPT with ChatGPT plan inference in a local Electron app? What approval, client registration, redirect/callback contract, scopes, eligible plans/regions and branding apply? Please distinguish development/beta permission from production distribution. Identity-only approval would not cover the requested AI use.
2. **Included-only funding:** Can our client be restricted, by OpenAI, to included subscription allowance with no purchased-credit or top-up use? What exact supported request field, grant or client/account policy enforces it? How does the client establish that policy, and what happens if the user enables credits or other apps consume the allowance while a request runs? Does the restriction cover every request/continuation within a Codex turn, and what errors indicate that the allowance is unavailable? If an account setting supplies the guarantee, please document its enforcement and change semantics.
3. **SDK/runtime route and distribution:** Which supported SDK/runtime release works with the approved credentials? May we bundle the runtime for macOS arm64/x64 and Windows x64? What redistribution notices, update requirements and channel restrictions apply? Please identify the supported isolation controls for disabling filesystem, shell, web, plugins, MCP and subagents for text-only writing requests.
4. **Session and content contract:** What desktop credential protection, refresh/revocation, account switching, cancellation and terminal-event requirements apply? What retention, training, telemetry and regional policies apply to the selected writing context? Collie needs accurate disclosures and must not claim that remote AI runs locally.

## Why sign-in alone does not settle the billing requirement

OpenAI's [user controls](https://learn.chatgpt.com/docs/sign-in-with-chatgpt) include a setting allowing other apps to consume credits after usage limits. Its [errors guide](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery) says plan-usage errors stop inference without silently switching billing paths. That is useful failure behavior, but does not establish a client-enforced prohibition on credits already allowed by the user's plan settings. This remaining distinction is the reason for question 2; it is not a claim that an included-only policy is impossible.

Collie's commercial plan requires this guarantee; the narrow CD owner-development policy above differs. A successful sign-in, zero current credit balance, disabled toggle observed once, or account model list does not satisfy it. An applicable, documented provider policy may satisfy it without a special request field; we should use the actual supported mechanism rather than invent one.

## Evidence for live access and commercial activation

These inputs enable dependent real actions; they are not a universal prerequisite to request I10 engineering. Access is evaluated under the actual route's permission/configuration rules. Registered commercial inference needs binding included-only funding; owner-only unpackaged CD work follows its separately recorded normal-account spending policy. This guide does not establish a publicly available provider OAuth sandbox.

| Item | Current state | Useful evidence to return |
| --- | --- | --- |
| Application/submission | Not reported; nothing submitted by the assistant | Non-secret submission reference/date if you apply; this tracks progress but does not grant permission |
| Commercial plan-use approval (A-OPENAI) | **Not obtained**, confirmed by Josh October 2 | Approval scope/reference and supported desktop auth/execution documentation; production vs development/channel conditions |
| Included-only funding (F-OPENAI) | **Not established** by reviewed public material | Exact provider-enforced control, its scope and failure/change semantics, covering the complete operation |
| Runtime engineering (R-PROVIDER) | Independent foundation delivered; complete isolation and packaged distribution pending; see [runbook](provider-runtime.md) | Documented methods/version/license/isolation/lifecycle, delivered component map and exact remaining gaps; later configuration/activation remains within I10 |
| User observations (U-PROVIDER) | Pending implementation and I11/I12 UI | Later user-reported native sign-in, disconnect, cancellation and refusal outcomes; no charge-incurring experiments |

If OpenAI cannot admit Collie or cannot provide the funding guarantee, record the exact denied/unavailable route and keep its commercial activation or inference unavailable as applicable. Preserve independent engineering and local work, with unresolved methods explicitly marked incomplete; do not report usable AI as delivered. Do not silently switch to API keys, a hosted proxy or another provider. Later-provider work remains a separately requested I14 increment.
