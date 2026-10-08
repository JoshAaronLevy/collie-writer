# AC05 implementation record

October 8, 2026. Scope: project manuscript/research/prior-chat selection, optional pins/exclusions, source recognition and Research entry point. **Implementation complete — awaiting user testing.** Proceeding to AC05 does not establish acceptance of earlier unconfirmed provider/native behavior.

See the [plan](../../ai-conversations-implementation-plan.md), [contract](../formats/conversation-knowledge-v1.md) and [manual guide](../manual-testing/ai-conversations-AC05.md).

## Implemented

- A bounded worker builder reads active manuscript bodies/passages, saved source metadata, notes, current-version inspection excerpts/available local page text and completed exchanges from other active chats. Pins/requested identities take priority; coverage describes actual selection and omissions. No search indexing, embedding infrastructure, original-file fetch or extra provider tool is added.
- Large-project overview preparation reuses AC04's two-request ceiling, exact coverage and protected lifecycle. Small projects use original text. Current writing is protected first; source identity, sharing scope, selection revision, account/model and changed-intent checks remain.
- Context → Project material contains optional persisted pin/exclude/refresh controls and last sent coverage. Research → Discuss in chat creates a local draft/source pin without sending or replacing an existing draft. Scoped links reuse existing navigation/draft guards.
- Completed answer matching considers the whole source inventory, normalized exact identifiers and reviewable title suggestions. Merged/removed records are handled without resurrection. Web search and new-source saving/citation actions remain AC06–AC07.
- SQL/minimum reader 19, capture 4 and project-knowledge/selection 1 preserve schema 16–18 and capture v1–v3 readers. Retained-copy migration, manifest admission, rekeying, graph/pin/excerpt validation, retention, exports and exact repeated mutations cover the new portable state. Direct v5 and credentials are unchanged.

## Evidence and limits

Source review covers scope, active ancestors, current inspection versions, exact snapshots, bounded candidate/input reads, excluded/archived state, changed intent, retained pending mutations and portable consumers. React review covers contextual disclosure, async generations, composition and retained navigation. Source inspection is not runtime testing.

`npm run format`, `npm run lint` and `npm run typecheck` (node and web) passed cleanly on the final code using the pinned Node 24.21.0 toolchain. Initial type narrowing and regex lint findings were fixed without suppressions. No tests, fixtures, app launches, builds, browser automation or runtime verification were added or run.

Recall is lexical and bounded, not exhaustive. Candidate windows, partial passages, bounded inspection-page/excerpt material and preparation limits are documented in the contract. Generated answer accuracy, actual request latency, native migration/Save/copy/reopen, Stop timing and accessibility await Josh's observations. Earlier unconfirmed completion behavior remains pending; release remains NO-GO. AC06–AC08 are not implemented by this stage.
