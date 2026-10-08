# Conversation drafts and history navigation — AC03

October 8, 2026. Device-local draft format 1; portable SQL/minimum reader remains 17. Conversation/message/capture/direct-operation formats are unchanged. This document describes implementation, not runtime acceptance.

## Protected drafts

`<working folder>/ai/conversation-drafts-v1.json` uses the existing encrypted atomic-write envelope and platform secure storage. Its decrypted value is `{ version: 1, revision: UUID, entries: [...] }`. Each entry has exact project ID, workspace ID, conversation ID, plain-text draft and `project | chat | message` context policy. No account, model, tokens, execution IDs, prepared capture, sharing authorization or pending Send is restored. Drafts are not in a `.collie` archive or transcript export and never enter automatic context.

Limits are 20 draft/context entries per workspace, 128 across the working folder, 16,000 UTF-16 units per draft and 500,000 aggregate text units. The encrypted file is bounded at 8 MiB. Empty text with default project context removes the entry; an explicit nondefault context choice remains. Capacity refuses additions without evicting existing entries. There is no age-based cleanup.

Main serializes at most eight outstanding draft commands under one owner. A write carries a revision and a complete bounded snapshot for one exact workspace; other workspaces remain untouched. An identical snapshot acknowledges a lost reply idempotently. A different stale snapshot cannot overwrite the current revision. The worker validates the active project/workspace and reads trusted chat metadata before main returns drafts or writes; new entries require a known chat. Previously stored missing-chat entries stay recoverable. Archived chats keep their drafts. The Saved drafts disclosure provides Open chat when available, full text, Copy and confirmed Discard without reassigning a missing draft to a replacement chat.

The retained renderer owner debounces protection by 600 ms and protects before Send and through the existing Save/navigation/replacement/access/close flush registry. It keeps one exact uncertain write, protects it before newer edits, and leaves failures visible with Retry and Copy access. Determinate pre-write refusals can be replaced by an edited/discarded snapshot. A read failure disables draft editing without overwriting the unread file; because no new draft was accepted, it does not itself block closing. Normal close awaits outstanding main draft work and the renderer flush; renderer-loss consent still cannot claim window-only text was saved. A forced termination can lose typing since the last confirmed write.

Draft scopes count as linked local work for inactive working-copy removal; unreadable draft evidence refuses removal. Reset/recovery keep their existing retention rules. No new cleanup authority is introduced.

## Bounded presentation reads

Grouped list/title/state filters and their independent 20-row pages remain. Summaries add a plain-text recent message preview of at most 180 UTF-16 units, labeled You/Assistant. First-message titles and manual renames retain their existing worker owner.

Find in this chat is an explicit, literal, case-insensitive substring search over authoritative saved messages, including archived/local-only/failed history. Each call scans at most 200 messages and 1,000,000 text units, returns at most 20 matching messages with 220-unit previews, and supplies an ordinal cursor when more history remains. Continue search advances through history; a batch without matches does not imply the whole chat lacks a match. No search index, AI request or background full-history scan is created. Results are one hit per message; selecting one opens its exchange. Find does not change inference eligibility or context policy.

Transcript reads remain five exchanges at a time. Earlier pages prepend, anchoring the first visible exchange and its viewport offset. At most 20 exchanges are mounted; when loading further back, the newest end is released from the mounted window and Jump to latest returns to the current end. Ordinary refresh merges by attempt ID. Scope/chat/cursor generations and a coalesced read protect navigation during earlier-page loading. Session scroll hints are bounded at 128 chats and carry no draft authority. Export and context capture still use their existing complete-history owners, independently of mounted messages.

Find, draft recovery, exports and message details are contextual controls. Protected drafts do not produce a global work warning; real protection failures and pending operations remain actionable. Explicit chat/list navigation uses guarded focus return; startup restoration does not request composer focus. Keyboard, IME, native close and actual scroll behavior await user observation.
