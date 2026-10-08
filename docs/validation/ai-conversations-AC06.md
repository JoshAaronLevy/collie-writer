# AC06 implementation record

October 8, 2026. Scope: explicit provider web search and durable, matched conversation references. **Implementation complete — awaiting user testing.** A permitted live research response is required for acceptance; no earlier unconfirmed acceptance is inferred.

See the [plan](../../ai-conversations-implementation-plan.md), [contract](../formats/conversation-research-v1.md) and [manual guide](../manual-testing/ai-conversations-AC06.md).

- Added a compact, initially off Search the web choice and contextual sharing line. Send binds the choice to protected context/account/model. Summary preparation remains text-only. Search-specific refusals offer a draft-only text alternative and do not falsely disconnect the account.
- Capture 5, execution/binding 6 and structured research result 1 preserve the frozen text contracts. The fixed provider web tool is the only tool enabled; no executor, crawler, credentials change, inference probe or hidden fallback is added.
- Stream handling correlates text and annotation identities/ranges, requires terminal completion, handles omitted duplicate terminal text, validates output and bounds public references. Malformed ancillary source details retain the answer with a warning. Failed/incomplete/interrupted outcomes remain honest.
- Encrypted protection, portable settlement and handoff bind references to their exact answer/attempt. SQL/minimum reader 20 adds a retained-copy migration and compatible manifest, rekey, retention and export handling.
- Canonical URL/DOI/title matching precedes initial citation presentation. Sources distinguish exact Research records, possible matches and removed records; extra retrieved pages are collapsed. Safe Markdown associates badges using canonical text and opens links through the existing native route. Source import and manuscript citation remain AC07.

## Evidence and remaining acceptance

Source/documentation review covers the own-account route, tool policy, output limits, identity/offset handling, failure and local protection paths, versioned readers and portable graph. React review covers bounded rendering, stale async results, explicit actions and semantic controls. These are source findings, not runtime results.

`npm run format`, `npm run lint` and `npm run typecheck` (node and web) passed cleanly on the final code using the pinned Node 24.21.0 toolchain. Type-narrowing findings were corrected without suppressions. No automated tests/test code, app launches, builds, browser automation, screenshots or runtime verification were performed.

Actual account/model web access, response completion, reference accuracy, Unicode/Markdown placement, native migration/Save/copy/reopen/export, Stop timing and accessibility remain unobserved. Commercial authorization, spending enforcement and installed-provider gates are unchanged; release remains NO-GO. AC07–AC08 remain unimplemented.
