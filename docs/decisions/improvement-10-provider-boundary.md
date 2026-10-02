# I10 — Provider engineering and separate activation gates

October 2, 2026. **Independent local implementation delivered — awaiting user testing; I10 overall remains partial.** The [runtime runbook](../ai/provider-runtime.md) owns the current component map, source contracts and exact remaining work; the [record](../validation/improvement-I10.md) preserves the earlier entry reviews and plan revision.

## Current decision

Implement supported engineering before commercial approval, while enforcing real access/funding at runtime. I10 owns subsequent configuration and route-specific corrections. I01–I09 require no rerun. I11–I13 remain separate requests and can use delivered contracts without claiming working AI.

The current implementation uses the documented subscription OAuth to Codex app-server route. Codex CLI 0.160.0 is pinned for local development; the TypeScript SDK preference is retained if its exact auth bridge becomes documented. `jose` 6.2.12 verifies signed tokens. Browser credentials remain main-owned, encrypted and isolated from the developer's accounts. All registration entries remain null. No dynamic open-source registration, built-in commercial login workaround, API-key route or provider account action is enabled.

`AiService` owns account attempts, captured requests and jobs above panel visibility. Narrow preload/main contracts expose bounded states and agent text without tokens, provider subjects/client IDs, raw errors, runtime commands or hidden reasoning. Main checks project editing capability without access-drain exceptions. Durable encrypted operation intent precedes dispatch; exact retries observe existing work, uncertain starts never replay, and failed output protection retains memory and blocks close until explicit disk-only retry succeeds. Existing I03 draft/close/update guards remain.

Live authentication needs the actual supported route's registration and channel permission. Authentication does not imply inference eligibility. Every inference still needs included-only funding and selected session/model/capability rights. The current `requireIncludedFunding` refuses because the exact provider control is unresolved. The documented runtime settings and transport are implemented, but `requireTextOnlyRuntime` also refuses until all tool/config/content-diagnostic paths can be constrained. Neither refusal is counted as completed provider-specific enforcement.

Codex's development dependency is excluded from application distribution. The adapter refuses packaged runtime resolution pending a complete allowed resource/notices/signing strategy for macOS arm64/x64 and Windows x64. No ambient PATH lookup, silent download, automatic update or SDK probe is used. Native results remain user-owned; MAS and other release gates are unchanged.

## Downstream and acceptance handoff

I11 now has actual connection/status methods and separate unavailable reasons. Its product UI is not delivered in I10. I12 owns portable conversations, durable context/transcript handoff, runtime-job presentation and registered renderer drafts. I13 owns proposal application. Main retains bounded recovery records without silently deleting them; I12 must own the explicit handoff/retention flow before unrestricted ongoing use.

The [manual guide](../manual-testing/improvement-I10.md) covers today's document review and existing local UI. No tests, checks, runtime/app/browser launch, provider login or inference were performed. All native/security/output behavior is unobserved. The implementation provides useful real code while I10 remains partial; do not report usable AI or release readiness.

## Historical disposition

The initial October 2 review required commercial approval and funding proof before any code and delivered only an approval guide. Josh then explicitly approved local engineering with separate access/commercial activation requirements. That blanket engineering veto is superseded. The earlier dated provider findings remain evidence, not a new instruction to stop independent work. Josh has confirmed no commercial approval; none has been inferred or obtained here.
