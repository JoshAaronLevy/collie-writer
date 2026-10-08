# AC04 implementation record

October 8, 2026. Scope: bounded earlier-chat and structural-overview memory. **Implementation complete — awaiting user testing.** Josh explicitly requested AC04 after AC03; this does not establish acceptance of earlier unconfirmed runtime behavior.

See the [plan](../../ai-conversations-implementation-plan.md), [memory contract](../formats/conversation-memory-v1.md) and [manual guide](../manual-testing/ai-conversations-AC04.md).

## Implemented

- Portable versioned checkpoints retain exact source coverage, producing attempts, accepted/edited state, explicit current selection and prior revisions. Summary inputs and outputs use the existing protected AI lifecycle; originals remain in their conversation/captures. Memory revisions have no execution authority.
- User-initiated Send plans at most one chat and one structural-overview summary. It keeps a recent verbatim suffix, checks projected bounds before extra inference, preserves original current writing and revalidates the retained intent after preparation. Stop, failures and changed context preserve the user's draft. Reopening never continues the original Send.
- Context → Memory provides inspection, original preparation snapshots, older revisions and retained edits. Stale overview coverage is excluded/regenerated as needed. Preparation results are collapsed/labeled in the existing transcript; actual failures and protection routes remain available. List previews/Find avoid preparation prose.
- SQL/minimum reader 18, checkpoint 1 and capture 3 include retained-copy migration, old readers, manifest admission, portable validation, independent-copy rekeying, full-row retention and labeled transcript/checkpoint export. Direct v5 framing/instructions, credentials and provider route are unchanged.

## Evidence and limits

Source review covered bounded input/output and lineage, current selection independent of physical row order, exact repeated edits, exclusion of preparation turns from automatic history, context-scope rules, completed-result installation, Stop/changed intent, no restored inference, and Save/copy/export consumers. The React source review covered retained edit ownership, contextual controls, async generations and composition/visibility guards. Source inspection is not runtime verification.

The first lint pass identified an effect-driven state update and a missing return type; both were corrected without suppressions. `npm run format`, `npm run lint` and `npm run typecheck` (node and web) passed cleanly using the pinned Node 24.21.0 toolchain. No tests, fixtures, builds, app launches, browser automation, failure injection or runtime verification were added or run.

Preparation quality, real quota/latency, native migration/Save/copy/close, Stop timing, large-history behavior, accessibility and the prior AC02 finalization correction remain subject to user observation. A large legacy backlog, oversized original item or full checkpoint history can still require explicit narrowing/new chat. The structural overview retains AC02's limited coverage; broad manuscript/research/prior-chat recall, web research and research-to-citation remain AC05–AC07. Release remains NO-GO.
