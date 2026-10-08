# Conversation memory — AC04

October 8, 2026. SQL/minimum reader **18**, memory checkpoint **1**, new conversation capture **3**. Direct execution/binding remains **5** with its existing `conversation-v2` framing and instructions. Conversation/message formats and old capture/readers/digests remain unchanged. This is implementation documentation, not runtime acceptance.

## Ownership and portability

`conversation_memory` is portable project data. Each immutable checkpoint body records its ID, producing conversation/attempt, prior revision, exact coverage, text, creation time and `accepted | edited` state. A separate `current` column selects one checkpoint per chat-memory scope or project-overview scope; replacement clears only that selector, retaining every old body and original message. Physical SQLite row order is not current-memory authority. Editing appends a new ID and retains the producing attempt and coverage. An exact repeated edit acknowledges the existing revision without creating another commit.

Chat coverage records exact message IDs/revisions/ordinals plus an optional preceding checkpoint, forming a bounded prefix of eligible completed exchanges. Preparation attempts never become ordinary chat history. Project-overview coverage records the digest of its original structured snapshot and the included document IDs/revisions. The snapshot is the existing bounded structure/description/synopsis overview, not full manuscript/research/prior-chat retrieval; AC05 owns that expansion. A changed snapshot excludes stale overview memory; a later Send regenerates it if still needed, otherwise uses the current raw overview. User edits do not make stale coverage current.

The retained-copy 17→18 migration adds the table without rewriting originals. Schema 16/17 DDL stays frozen. Manifest admission, portable graph checks, independent-project rekeying, full database snapshots and exports include the new records. Portable validation checks producing completed attempts, accepted text, edit lineage, one current head per scope, reference/text/digest equality, chat prefix coverage and nonoverlap with recent history. Credentials, local bindings and pending Send authority never enter the checkpoint. AI-linked working-copy removal remains refused.

New capture v3 adds purpose (`chat`, `chat-summary`, `overview-summary`), coverage and checkpoint references. Actual prompts, context and original summary input remain immutable under the capture digest. The existing protected operation, settlement, handoff and retention owners handle each preparation just like a conversation request. A complete result of acceptable size installs its checkpoint in the same worker transaction as the completed attempt. Failed, stopped, unknown, empty or oversized results cannot replace memory. Their actual attempts/output remain available; oversized completed output remains a completed preparation result without an accepted checkpoint.

## Bounded preparation

Only an explicit Send can start preparation. The updated first-use inline disclosure mentions up to two additional account-funded requests; existing disclosure v1 does not hide this new explanation. At most one chat summary and one structural-overview summary run for a Send, using the user's captured account/model. There is no recursive summarization, background index, automatic provider retry or restored send queue.

Limits:

- At most 1,000 checkpoint revisions per project, including edits, each at most 6,000 UTF-16 units. The prompt aims for 2,500–4,000 units. Capacity refuses new preparation/editing without evicting originals.
- Chat planning checks at most 20,000 eligible message references; reads at most 512 uncovered messages and 180,000 uncovered text units. A larger legacy backlog offers explicit narrowing/new chat instead of an unbounded preparation chain.
- One summary adds at most 256 original messages and 36,000 serialized input units, plus an existing checkpoint when valid. It leaves at least two completed exchanges verbatim. The remaining history envelope must fit 26,000 units after compaction and at most 256 messages.
- A missing/stale structural overview above 8,000 units can be summarized. The underlying overview retains AC02's bounded/abbreviated coverage statement; memory must not imply omitted material was read.
- Final context is conservatively checked at 60,000 text units and 74,000 serialized units including prompt/context, before the existing direct framing/admission checks. Original current writing is not silently compressed. If the projected result cannot fit, planning refuses before extra inference.
- Each preparation waits at most ten minutes for provider completion/local acknowledgment. Timeout requests Stop and keeps the original user draft and actual result. Existing provider cancellation/uncertain-outcome semantics remain.

Preparation progress has Stop. The retained Send intent checks the exact project/chat/current writing, composition/lifecycle state and account/model revision around awaits and before the final request. A change, cancellation, failure or uncertain write ends continuation with the draft intact. Only accepted, protected summaries allow the original Send to proceed. New captures recheck the current head/revision after preparation; reopening only reads/reconciles local outcomes.

## Context and presentation

Normal context uses accepted earlier memory plus the uncovered recent verbatim suffix, the original current-writing evidence and either a current structural memory or raw overview. Covered exchanges are not repeated as recent messages. Message only excludes all memory/history/writing; This chat only excludes project overview/writing. Summary text is explicitly labeled as a summary, not a quotation or verified research.

Context → Memory provides current/older revisions, stale labels, original preparation inputs/output and optional Edit/Save/Cancel. Unsaved memory edits remain under the retained draft registry and block unsafe replacement/close until saved or cancelled. Completed preparation turns are collapsed in the transcript; real failures remain inspectable. Recent list previews and Find exclude preparation prose. Export labels preparation turns and retains checkpoint history, with complete sent snapshots available through the existing explicit context-export option. Opening Memory, finding history or exporting never authorizes inference.
