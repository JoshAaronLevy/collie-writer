# Automatic conversation context and direct execution

AC02 · October 8, 2026. Implementation contract; native/provider acceptance is pending.

## Portable format

SQL and minimum reader advance from 16 to **17**. DDL is identical to 16. The existing retained-copy migration validates schema-16 content and changes only the candidate's format row/user version. Original captures, messages, attempts, request digests and migration originals are retained. Conversation records remain v2, messages v1, and direct-provider attempts v2. Archive/editor, manuscript/history, compilation, and proofreading contracts are unchanged.

New `review` requests explicitly carry `version: 2`, `contextPolicy: project | chat | message`, and empty `historyIds`. The worker derives history; renderer pagination cannot select it. Omitted-version reviews keep their original fields, digest and manual-context reader. The existing review command now runs internally as preparation for Send; it is not a user-facing approval screen.

Capture v2 retains the original identity, prompt, head, source, context, digest and history-ID fields, changes the template to `conversation-v2`, and adds the selected `contextPolicy`:

- **project:** all eligible completed exchanges in this chat, the exact active Chapter/Section's full plain text, and a compact structural overview.
- **chat:** the same eligible exchanges, without writing/overview.
- **message:** the new message only. This explicit narrowing never deletes earlier transcript content.

Eligible exchanges have a completed provider attempt with a user/assistant pair. Local-only, failed, stopped, unknown and running attempts are excluded. No other chats or projects are read for history. Opening the pane or changing the manuscript selection does not capture or send anything. The active writing item is selected at Send; immutable conversation-origin metadata stays descriptive.

There are at most three context chunks: `section`, `note` (overview), and `history`. History uses a single strict JSON envelope `{version: 1, messages: [{id, revision, role, text}]}` with complete alternating user/assistant pairs, unique IDs, and an ordered matching `historyIds` array. The chunk's identity is the conversation; its revision is the reviewed conversation revision. The overview uses the capture ID and captured head, avoiding embedded project ownership that would need rewriting during an independent copy.

History is capped at 256 messages/128 exchanges and shares the existing 64,000 UTF-16-unit context limit with writing and overview. This is an application bound, not a claim about a provider token window. Full history must fit; it is never silently reduced to visible/recent messages. The final direct frame plus instructions must fit the existing 80,000-unit ceiling. Prompt/output limits remain 16,000/128,000 units. Limits are enforced before dispatch; the UI preserves the draft and offers explicit scope narrowing or New chat. Automatic summarization is approved but belongs to AC04.

The overview reads title, subtitle, project kind/description and active ordered outline metadata, including existing synopses. Selection stops around a 12,000-unit overview budget, reads at most 201 ordered rows, and records total/included outline counts. Description is bounded to 2,000 characters, outline titles to 160 and synopses to 400; abbreviation is disclosed in the snapshot. The overview explicitly says it is structure/synopses, not the other manuscript bodies, research or prior discussions. Whole-project body retrieval remains AC05.

The retained editor is protected through its existing flush owner before capture. Send freezes prompt, policy, active item and account/model. A changed editor identity/body/selection target, project head, chat revision or account review stamp refuses that submission and keeps the draft. Append regenerates the same capture under the worker transaction and compares its digest before recording the portable intent. One exact pending submission survives uncertain local replies; reconciliation cannot dispatch it again. Accepted submissions clear only matching draft content/policy; typing a new draft while an answer streams is allowed and never queues it.

## Local execution and portability

Direct operation/binding **v5** uses framing version 2, `conversation-v2`, and its own frozen instructions/digest function in `direct-conversation.ts`. It sends eligible history as actual user/assistant input messages and the new prompt plus explicitly labeled project reference material as the final user input. Main validates the history envelope before building the frame. Account/session/catalog identity, immutable capture digest and exact framed input participate in the operation digest.

Direct v4 retains its original reader, instructions, framing and digest. Codex v1–v3 and mechanics readers remain separate. Worker binding requires capture v2 with binding v5; receipt readers accept v5 only for conversations. There is no provider conversation store: HTTP still uses `store:false`, `stream:true`; no effort, web tool or API-key route is introduced.

Portable validation checks v2 only in schema 17+, capture digests, exact earlier-message text/revisions/roles/order, complete attempt pairing and completed-provider eligibility. Existing Save/Backup snapshots copy the full database; Open/Restore validate via the updated portable reader. Independent copies rekey only the outer `project_id`, preserve captured IDs/text/hashes, and acquire no original execution authority. Existing retention hashes compare complete rows. AI-linked working-copy removal remains refused. Export includes readable prior exchanges and exact retained context when requested. No cleanup is added.

## Presentation-only data and actions

`collie.chat-sharing.v1` stores only the string `acknowledged` after an explicit Send from the first-use disclosure. It suppresses repeated explanatory copy; it is not account authorization or a provider grant. If local preferences cannot be written, the explanation remains visible. Draft text/policy remain session-owned until AC03 adds durable recovery. Existing selected-chat hints remain unchanged.

The compact model picker calls the existing account model owner with connection ID, catalog revision and model ID. Its existing guards/persistence remain authoritative; it cannot alter an in-flight operation. Effort is hidden because this route exposes no established effort choices.

Markdown is a small React-rendered subset: paragraphs, headings, lists, quotes, emphasis and fenced/inline code. Raw HTML stays escaped text; images are never embedded. Explicit HTTP(S) Markdown links use a trusted-sender main IPC handler, existing URL validation and native Open website confirmation. Copy uses a bounded trusted-sender clipboard action. Neither action starts inference or mutates project data.
