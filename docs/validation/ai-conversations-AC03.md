# AC03 implementation record

October 8, 2026. Scope: returning to conversations, bounded draft recovery and history navigation. **Implementation complete — awaiting user testing.** The user explicitly requested AC03 after the AC02 completion correction; that request does not establish successful live response finalization. Josh's earlier Save/close confirmation remains limited to his reported flow.

See the [plan](../../ai-conversations-implementation-plan.md), [local contract](../formats/conversation-drafts-v1.md) and [manual guide](../manual-testing/ai-conversations-AC03.md).

## Delivered

- Existing current-item/other grouped history, title search, local first-message titles, rename, archive/restore, export and actual historical outcomes remain. Recent previews are bounded worker reads. Find in this chat searches bounded authoritative message batches and opens the matched exchange; it does not make an AI request or change context coverage.
- An encrypted device-local draft file stores exact scope/chat text and context choices under one serialized main owner. Retained renderer state debounces protection, restores only after trusted workspace reads, preserves exact uncertain writes and integrates with normal close, Save, project replacement and access changes. Missing/archived drafts stay available for full-text inspection, copying and explicit discard. Capacity never evicts data. Unreadable saved data is kept and does not trap a window that has accepted no new draft.
- Older five-exchange pages prepend under a visible-message scroll anchor. The mounted transcript is bounded to 20 exchanges, with Jump to latest after older-window navigation. Deferred refreshes and scope/chat/cursor guards preserve selection across concurrent reads. Explicit focus intent, dialog/visibility/IME guards and bounded scroll hints retain local navigation behavior.
- Routine protected drafts no longer create a global work banner. Find, recovery and export stay in contextual controls. Pending AI/local protection still remains visible and uses existing owners. No summary, broad project recall, web research or source-saving work was added.

## Evidence and limits

Source review covered exact IPC validation/correlation, per-scope merge and revision behavior, bounded reads, missing/archived drafts, deterministic refusals versus uncertain writes, close/access/replacement integration, inactive-working-copy protection, and absence of inference authority in persisted drafts. The React Best Practices source review covered retained ownership, stable component definitions, bounded rendering, async generation guards and accessible names/focus. Source inspection is not a passed runtime test.

Required checks passed cleanly on the final code, in order with the pinned toolchain: `npm run format`, `npm run lint`, then `npm run typecheck` (node and web). No warnings or errors were reported. No test code, automated tests, fixtures, builds, app launches, browser automation, failure injection or runtime verification were added or run.

Portable SQL/minimum reader remains 17. Existing conversation/capture/message/operation formats and frozen readers are unchanged; only local draft format 1 and transient read results are added. The new main/preload/worker code requires a full user-controlled development restart.

Manual draft persistence, actual encrypted/native I/O, close timing, scroll/focus/IME/accessibility, long-history behavior and provider completion remain pending. Abrupt termination can lose text since the last confirmed protection. AC04–AC08 remain unimplemented and require a further request; release remains NO-GO.
