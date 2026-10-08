# AI conversations implementation plan

October 8, 2026 — revised after Josh's chat-panel feedback and supplied screenshots. **AC02 acceptance remains incomplete.** After the first live-message refusal and follow-up corrections, Josh confirmed Save/close work and observed a streamed answer on `gpt-5.6-terra`. That answer was incorrectly marked failed at completion (`collie_empty_response`). The completion correction retains validated streamed text when the explicit completed event does not repeat the answer; successful finalization and follow-up context still require user retesting. AC01's provider implementation and earlier code-check results remain recorded. AC03–AC08 remain not started.

The product requirement is straightforward: **AI → New chat → type → Send → streaming answer → keep chatting.** Users should understand what to do immediately. The app should bring relevant knowledge of the current book/report, research and previous project discussions into that conversation automatically. Research discovered in chat must still be saveable to the project's Research library and usable as real citations.

The same-session follow-up also reported failed Save and a permanently blocked close. The correction replaces an iterator-incompatible schema read in conversation portability validation and adds an explicit native recovery-close choice after workspace failure, without claiming window-only drafts were saved. Josh subsequently confirmed Save and close are working. Broader migration/reopen and recovery edge cases remain unconfirmed; see the AC02 guide. No project content is rewritten and no later stage is started.

## Approved context decisions

Josh approved both recommendations on October 8, 2026. No clarifying questions remain. The requested chat layout, one-Send interaction, inline model picker and broader project context are settled requirements.

1. **Automatic summaries are approved.** After one concise first-use explanation that context preparation can use additional AI requests, Collie may prepare bounded older-chat/project summaries as needed for a user-initiated Send. Show brief progress, preserve originals and provide inspection/editing under Context. Normal chatting does not require summary review/acceptance. AC04 implements this behavior; AC02 does not add summary requests.
2. **Archived chats are excluded from automatic recall.** Relevant completed exchanges from active chats in the same project are eligible; archived chats require deliberate inclusion from Context. Saved research remains available independently of its originating chat. Unsent drafts, unresolved attempts and other projects never contribute automatically. AC05 implements broader prior-chat recall.

## Decisions and scope changes

This revision supersedes earlier future-UX instructions in this plan and the AC01 extension decision wherever they require manual history checkboxes, separate request review for ordinary sends, manually attaching all project context, or excluding every other chat. Preserve historical records and frozen persisted contracts; change behavior through the next versioned implementation.

| Decision                  | Required behavior                                                                                                                                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Simple chat first         | New chat opens the conversation view immediately in the existing side pane. The transcript and composer are the primary interface.                                                                                                                        |
| One Send                  | First messages and follow-ups use the same Send action. Local capture, validation and protection happen internally. No Review request → Send reviewed request workflow.                                                                                   |
| Compact navigation        | Back to conversations and New chat are adjacent icon-only buttons in one header row, with accessible names and tooltips.                                                                                                                                  |
| Model in the composer     | Select a model without leaving chat or opening account settings. Show effort only if supported for the actual route and selected model.                                                                                                                   |
| Automatic project context | Use this chat, current writing, the whole project's structure/purpose, relevant manuscript passages, saved research and relevant prior project discussions within a real budget. New chat retains project awareness while starting a separate transcript. |
| Explicit web search       | Keep the previously approved Search the web choice, as a compact composer control. Local project context works with web search off. Do not add an automatic web-search policy in this revision.                                                           |
| Long-chat continuity      | Preserve complete transcripts and use bounded memory when needed. Automatic preparation is approved; inspection/editing remains optional.                                                                                                                 |
| Research and citation     | Identify existing sources, save new references through a compact review form, and use Collie's existing citation pipeline.                                                                                                                                |

Own-account authorization, local/project ownership, no API-key fallback and user-owned runtime testing remain. ChatGPT sign-in does not import external ChatGPT conversations; that remains the separate [AI import design](ai-import-design.md).

## The chat pane to build

The conversation list already provides the right entry points. Keep that view, then replace it with a normal chat when the user opens or creates a conversation. Do not stack the list, setup instructions and a request form above the composer.

```text
[Back icon] [New chat icon]   Chat title             [More]

                 Scrollable conversation
                 You: ...
                 Assistant: streaming response ...

[Project context]                              [Web search]
[Type a message…                                          ]
[Model ▾] [Effort ▾, only when supported]        [Send icon]
```

This is a layout contract, not literal glyphs or final styling. Use existing semantic icon controls, Mantine components and scoped CSS. The composer stays at the bottom of the pane; the transcript fills the remaining height. Compact controls can wrap gracefully in a narrow pane without pushing the composer offscreen.

- **New chat:** create locally, enter the empty transcript and focus the composer after the user action. Use a short placeholder such as “Ask about your project…”; no large instructional card. Preserve another chat's draft. Do not send or generate a title on opening; derive an editable title locally from the first submitted message.
- **Header:** Back and New chat stay on the same row. One contextual menu contains rename, archive/restore and export. Remove duplicate New chat headings/actions and routine navigation/status blocks.
- **Composer:** start compact and grow with text to a bounded height. Send is an icon with an accessible name; show Stop while generation is active. Enter sends, Shift+Enter inserts a newline, and Cmd/Ctrl+Enter also sends. Composition/IME input must never accidentally submit. Keep the next draft editable during a response; do not implicitly queue it.
- **Model/effort:** remember the existing account-scoped model preference. The current model is visible beside the composer. Picking a model/effort authorizes that choice for the next Send; it does not open another review screen. Preserve the draft during changes and respect the current account/operation owner's guards.
- **Context:** a compact “Project context” control opens an optional popover with current coverage, exclusions, pins and exact sent context. Most users never need to open it. Provide a “This chat only” option and deliberate pin/exclude controls there. Do not fill the composer with one chip for every automatically selected item.
- **Streaming:** render ordinary user/assistant messages, with safe formatting and Copy on the answer. Follow new text only while the reader is at the bottom. Scrolling up stays put; a small Jump to latest action returns. Load older messages from the top with preserved position instead of permanent Earlier/Latest requests buttons.
- **Connection and errors:** show a concise Connect ChatGPT action only when needed and an actionable inline error when a send fails. Account management and diagnostics stay in the existing shared dialog. Routine capability, spending, storage and request details do not occupy the normal chat surface. Actual unresolved work remains reachable.
- **Sharing:** one short first-use explanation states that messages and relevant content from this project are sent to the connected account. Send proceeds with the displayed scope. Routine chapter changes, added project research and model selections within that scope do not trigger repeated consent screens. A genuinely broader sharing destination/scope requires an explicit choice.

Remove the screenshots' permanent character/chunk counters, history-selection counts, technical framing limits, large attachment buttons, Clear unsent draft button, review form and local-only submission button from the ordinary flow. Show a limit only when approached/reached. Keep saved local-only historical messages readable; draft protection and actual recovery are still required internally.

## Useful project context without a second AI system

The project database is authoritative. One worker-owned builder prepares a bounded snapshot for each Send; the renderer's visible transcript page never determines the model's memory. Main protects and authorizes that exact request through the existing lifecycle.

### What belongs in a request

| Layer                     | Default behavior                                                                                                                                                                                                                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current conversation      | Include eligible completed exchanges in order, retaining roles and complete exchanges. Use older memory plus recent verbatim turns when necessary. Exclude unsent/local-only requests and failed/cancelled/unknown attempts unless deliberately included as labeled material.                                                                                 |
| Current writing           | Include the active Chapter/Section's current text when it fits, protecting the retained editor's latest changes through its existing owner first. For a large item, use relevant passages and report partial coverage. Use the active item at Send time; conversation creation origin remains descriptive metadata.                                           |
| Whole-project overview    | Include title, description, ordered outline and existing chapter/section synopses so answers understand purpose and structure. Include the complete active manuscript when it fits the allocated budget; otherwise use a bounded overview plus relevant passages from across the manuscript. Empty synopses must not require a setup chore before chat works. |
| Existing research         | Include a compact relevant source inventory with stable IDs/identifiers and supporting notes/excerpts from inspected local material. Distinguish metadata-only records, available extracted text, quotations and user notes. A URL or an attachment's existence is not proof the article was read.                                                            |
| Prior project discussions | Retrieve relevant completed exchanges/accepted memory from other eligible chats in this project. Include origin labels/IDs and treat them as background discussion, not messages in the current transcript or verified factual evidence. Archived chats are excluded unless deliberately included.                                                            |

Use a simple deterministic selection policy: current question and recent exchange first, then current writing and project overview, followed by relevant research and other manuscript/chat passages. Keep explicit pins and requested source/document identities ahead of incidental matches. Define sub-budgets so a long chapter or bibliography cannot crowd out the question or recent discussion. Remove repeated copies of the same passage/source.

Start with existing SQLite data, outline synopses and local text search. Reuse search matching/ranking where appropriate; resolve hits back to authoritative current records before capture. Existing search is a rebuildable projection and does not index conversation messages today. Add bounded conversation reads/matching within the existing store, not an embeddings service, vector database, agent fleet or new search backend. A Send can explicitly initiate the needed local context reads; opening the pane, status polling and startup must not start indexing or inference. Respect existing search-job ownership, cancellation and cache lifecycle. Missing/stale indexes must not masquerade as complete coverage; use bounded authoritative fallback reads or a concise partial-context explanation.

Broad awareness must be useful even when chapter synopses are absent. Full text for small projects and query-relevant passages are the baseline. If a larger book needs generated overviews, reuse AC04's bounded summary mechanism with exact document/revision coverage and the approved automatic-summary policy. Invalidate or label stale summaries when the underlying writing changes. Do not continuously re-summarize the book on each keystroke, summarize the entire library on startup, or quietly claim every page was read.

Context updates automatically for each new Send under the chosen policy. A chapter change updates the next request, not old captures or an in-flight request. Deliberately pinned snapshots remain fixed until refreshed/removed. Freeze prompt, current-item identity, model/effort and sharing policy at Send; if preparation loses the required revision/authority, keep the draft and ask for a fresh Send rather than silently targeting another document.

The compact Context view shows the current chapter, manuscript coverage, research/source IDs, prior-chat origins and any summary/omission. Exact per-attempt manifests remain inspectable. “Project context” means access to a bounded relevant selection; it must never falsely promise exhaustive recall of every book page and chat. Unsupported coverage is disclosed only when relevant, without exposing token accounting as the main experience.

### Recognize existing research

Before generation, supply relevant known sources with stable IDs, titles and supported DOI/URL/ISBN identifiers. Tell the assistant to distinguish an existing project source from a newly found reference and to seek additional sources when requested. The prompt improves answer quality; it cannot guarantee novel results by itself.

After generation, match returned references against the **whole project's** canonical source records using existing normalization and duplicate rules, even if only a subset was sent to the model. Exact supported identifier matches display “In Research” with Open source/Cite; uncertain title/author matches offer review. Never label a reference “new” solely because it was absent from the input. Prefer “Not saved in this project” when that is all that is established. Existing but relevant evidence can still be mentioned as existing evidence.

Research text, prior assistant claims and web content are untrusted context. They cannot override instructions, acquire new tools, fetch files, change spending or mutate the manuscript. A discussion summary cannot substitute for a source quotation. Cross-project memory is excluded.

## Provider, model and durable-data boundaries

Use the active direct own-account route and the existing provider/session/content owners. The Codex extension is the interaction reference, not a requirement to replace the transport or reactivate historical Codex/Grok execution. The [AC01 decision](docs/decisions/ai-conversations-AC01.md) retains its provider and distribution findings; its attachment-only and reviewed-history future UX is superseded by this revision.

The source already has account model discovery and selection. Official guidance describes an account-specific model picker; reuse that catalog and its actual choices. [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference).

Effort is optional, not a prerequisite for chat. The current direct adapter publishes empty effort choices and sends no effort setting. General Responses documentation supports model-dependent `reasoning.effort`, but that alone does not establish all values for the current ChatGPT-plan route/account. Check the exact route/model contract when implementing; expose only supported values, bind the selection into the new request digest, and hide the control if support is unestablished. Do not add an SDK, hidden probe or hard-coded universal effort menu merely to expose it. [Reasoning documentation](https://developers.openai.com/api/docs/guides/reasoning).

Keep `store:false`, `stream:true`, client-supplied HTTP history and supported parameters. No provider conversation store, API-key fallback, shared billing or automatic inference retry. Web capability remains separate from text, and search refusal cannot silently become a supposedly researched answer. Commercial permission, included-only enforcement, installed adapter and signed-platform acceptance remain unresolved release gates as recorded in AC01.

Keep the current **capture → portable intent → main prepare → protected binding → dispatch → protected result → portable settlement → handoff** sequence behind the simple Send interaction. A local retry protects/reconciles the same request; only explicit new submission starts another inference. Stop preserves partial output and honest remote uncertainty. Neither opening a chat nor restarting the app sends saved work.

The AC01 baseline was SQL/minimum reader 16, conversation 2, capture/message 1 and direct operation/binding 4. AC02 advances SQL/minimum reader to 17, new captures to 2 and new direct operations/bindings to 5; conversation 2 and message 1 remain. See the [AC02 format contract](docs/formats/ai-conversations-v2.md). Existing limits are 16,000 prompt characters, 64,000 context characters, 32 chunks, 128,000 output characters, 64 hot operations and an 80,000-unit direct framed-request ceiling. These are implementation constraints, not permanent UI copy or provider token limits. Use a conservative model-aware input/output allowance where supported plus application bounds; do not simply enlarge limits or silently drop important history.

Keep direct v4 instructions/framing/digests and all old readers exact. New automatic project-context, effort and source-aware requests need explicit versions. Each stage that changes persisted data also updates validation, migrations, IPC, worker/main handling, budgets, Save/Open/Backup/Restore/Duplicate/rekey, export and retention comparisons. Preserve historical request bytes and outcomes; copying a project never transfers execution authority. Submitted context, messages, summaries, sources and citations are portable. Credentials/bindings and bounded unsent-draft recovery stay device-local. No second job queue or general agent framework.

## Source findings that shape implementation

- `ConversationPanel.tsx` and `conversationState.ts` already own list/chat switching, local New chat, streaming outcomes, session drafts and explicit review. Replace their presentation and normal submission flow; preserve retained ownership and actual recovery.
- Worker `projects/conversations.ts` and `worker/ai/capture.ts` currently capture manually selected history and one writing target. Automatic history and project context require actual capture changes; hiding controls alone does not implement chat memory.
- `shared/outline.ts` exposes hierarchy and synopses; project details include description. Existing `projects/search.ts` covers draft/note/source/question/claim/page material, not chats. Reuse these capabilities with current-record checks and bounded reads.
- `direct-http.ts` already streams text; source annotations/tool output are not yet durable. `sources.ts`, inspection/excerpt records and `ReferenceTools.tsx` supply the existing research/citation foundation.
- Some historical plans/format guides referenced by AGENTS are absent. Use current source and the available [AC01 record](docs/validation/ai-conversations-AC01.md); do not assume absent documentation establishes behavior.

## Stages and recommended coding models

Keep stable AC identifiers; no new stages are added. **Move the basic chat interface and one-Send behavior from AC03 into AC02.** AC03 then owns durable drafts and history navigation; AC05 becomes automatic project-wide recall instead of an attachment-only feature. The full project-aware experience requires AC05; AC02 must describe its initial coverage honestly.

| Stage | Deliverable                                                                                   | Dependencies                                   | Coding model | Effort     |
| ----- | --------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------ | ---------- |
| AC01  | Existing provider/capability foundation                                                       | Implemented; runtime acceptance pending        | GPT-6 Astra  | High       |
| AC02  | Simple streaming chat, inline model choice and automatic conversation/current-writing context | AC01 owners                                    | GPT-6 Astra  | Extra High |
| AC03  | Reliable return to chats, draft recovery and usable long transcripts                          | AC02                                           | GPT-6.1 Sol  | High       |
| AC04  | Bounded long-chat/project memory with minimal interruption                                    | AC02; automatic summary permission approved    | GPT-6 Astra  | High       |
| AC05  | Automatic whole-project research/manuscript/prior-chat recall and known-source recognition    | AC02–AC03; AC04 for generated overviews        | GPT-6 Astra  | High       |
| AC06  | Explicit web research with durable references and existing-source labels                      | AC01, AC02, AC05                               | GPT-6 Astra  | Extra High |
| AC07  | Add to Research and cite in writing                                                           | AC05; AC06 for web-returned sources            | GPT-6 Astra  | High       |
| AC08  | Final integrated UX and user acceptance                                                       | AC02–AC07 plus provider/delivery prerequisites | GPT-6.1 Sol  | High       |

These are coding-assistant recommendations, not the user's chat-model choices or delegation permission. AC05 changes from Sol to Astra because it now crosses context selection, source identity and prior-chat provenance. Extra High is confined to AC02's coordinated submission/versioning changes and AC06's streaming/result compatibility. Do not expand a stage just because a more capable model is assigned.

### AC01 — Provider foundation (existing implementation)

**Status:** implementation complete — awaiting user testing; required code checks passed before this plan revision. The screenshots report an unacceptable conversation UX, not a confirmed inference success. Preserve the [implementation record](docs/validation/ai-conversations-AC01.md) and [historical walkthrough](docs/manual-testing/ai-conversations-AC01.md). AC02 replaces that walkthrough's review/checkbox interaction.

Retain direct own-account sign-in, precise errors/renewal, main-owned text/research capabilities and the documented delivery gates. Do not add capability screens to the chat pane. No further AC01 code is requested by this planning update.

### AC02 — Deliver the everyday chat loop

**Status:** implemented; user acceptance failed on first live sends. Corrective connection-state/notice work and required format/lint/typecheck are complete, awaiting user retesting; the reported admission-parser refusal has a transport correction but still needs a successful live retest. See the [implementation record](docs/validation/ai-conversations-AC02.md), [format contract](docs/formats/ai-conversations-v2.md) and [manual guide](docs/manual-testing/ai-conversations-AC02.md). The compact one-Send chat, model picker, automatic completed-history/current-writing/outline context, explicit context narrowing, safe Markdown and v2/v5 compatibility are implemented. Effort is hidden because the current route has no established effort choices. Runtime and visual acceptance remain pending.

**Outcome:** New chat immediately feels like a usable messaging interface, and follow-ups remember the discussion.

1. Replace the normal request form with the header/transcript/bottom-composer layout above. Put icon-only Back/New chat on one row. Remove routine review, technical counters and availability blocks. Keep one shared account-management route, accessible names/tooltips, a conditional Connect action and precise error/recovery access.
2. Move the existing account model selector into the composer, sharing its main owner and preference. Add effort only if the actual route/model supports it. Unsupported effort must not delay model selection or simple chat. Preserve drafts and do not change the model of an in-flight attempt.
3. Route Send through the existing capture/prepare/protect/dispatch flow internally. The first-use inline disclosure establishes project-context policy without a separate request-review step. Maintain one exact pending submission and clear only its accepted draft revision. Preserve Stop, partial/unknown outcomes and storage retries.
4. Add a versioned worker context builder for all eligible history independent of transcript pagination, the active writing item and a compact project title/description/outline/synopsis overview. Protect current editor text before capture; preserve real message roles and pairings. Supply optional Context inspection and scope restriction without requiring checkbox selection. Broad research/prior-chat retrieval is AC05, not falsely claimed here.
5. Render streaming messages using a small safe Markdown subset; escape raw HTML, omit remote embeds/images, validate explicit links through main, and provide Copy. Use normal bottom-follow behavior, keep the next draft editable, and prevent duplicate Send/IME submission. No implicit send queue.
6. Version automatic-context/effort execution and captures, preserving v4 exact readers/digests. Complete required migration, portable/copy/export/budget/retention consumers in this stage. Until AC04, an over-limit chat offers a concise choice to narrow context or start a new chat; no silent forgetting.

**Owners:** conversation renderer/controller and styles; existing model-selection owner; shared conversations/AI content contracts; worker conversations/capture; main content service and versioned direct execution.

**Done when:** the user can open New chat, pick a model, type, Send, receive streaming text and continue without a request-review screen, history checkboxes or a trip to settings. This remains the user acceptance bar for AC02, not polish deferred to AC08.

**User walkthrough:** start a chat and send a short question; follow up on a named decision without selecting history; inspect Context only if desired; change current chapter and observe the next request's target; select another model, type during streaming, Stop, and use both header icons at a narrow width. Confirm existing saved conversations remain readable.

### AC03 — Make returning to conversations reliable

**Outcome:** previous chats and unsent drafts are easy to find and resume.

1. Retain existing grouped list/title search/rename/archive/restore/export behavior. Retain AC02’s local first-message titles without overwriting custom titles; add useful recent previews and bounded Find in this chat. Do not create another navigation system.
2. Add bounded device-local draft recovery keyed by exact project/workspace/chat under the retained owner. Restore text/context choices only after trusted reads; never restore stale send authorization or queue inference. Await protection on normal close. Capacity, missing/archived chats and failed writes preserve recoverable text with a useful action.
3. Load older transcript pages from the top without losing scroll position or making visible pagination the context policy. Keep a bounded mounted transcript and Jump to latest. Remove obsolete permanent Earlier/Latest controls. Preserve draft/focus while switching between the list and chat.
4. Put transcript export, local-only historical outcomes, details and recovery in contextual places. A plain conversation remains uncluttered, but real unresolved work cannot disappear. Complete draft lifecycle integration with close/access/project replacement.

**Owners:** conversation renderer/controller, retained workspace/draft owners, main protected storage and narrow worker history/search reads.

**Done when / user walkthrough:** leave different drafts in two chats, switch, close/reopen normally and resume each; find an older exchange, copy/export, archive/restore and navigate at keyboard/zoomed/narrow sizes. No request resends and no draft is silently dropped.

### AC04 — Keep long conversations and project overviews useful

**Outcome:** a context limit has a clear continuation path with original material retained.

1. Store versioned memory checkpoints with exact chat-message or document-revision coverage, producing attempt, text and acceptance/edit state. Use one current checkpoint per defined scope; preserve originals and older revisions. Do not introduce a global user profile or a separate memory service.
2. Perform bounded necessary preparation only for a user-initiated Send after the first-use disclosure, show brief progress and proceed only with the same still-valid submission intent. Opening/reopening never resumes inference. Summary inspection/editing is optional and does not introduce a normal review screen.
3. Summaries retain goals, agreed decisions, terminology, unresolved questions and references. Expose view/edit/originals under Context; no persistent memory dashboard. Stale document summaries are regenerated or labeled/excluded, not silently treated as current.
4. Compose older memory plus a recent verbatim suffix and actual evidence passages. Do not duplicate covered turns, invent quotations or silently compress a single oversized explicit attachment. Cancellation/failure preserves the draft, prior checkpoint and transcript; no recursive job loop or automatic retry.
5. Protect summary requests/results with the existing lifecycle and complete persistence/copy/export compatibility here. Establish concrete bounds on extra preparation work; explain partial coverage instead of spawning an unbounded series of summary requests.

**Owners:** AC02 context builder, existing AI lifecycle, worker conversation/document coverage records and optional Context view.

**Done when / user walkthrough:** use naturally long history, observe the chosen summary policy, inspect/edit memory and recover an original detail; change underlying writing and see stale coverage handled; reopen without new AI work. Record acceptance pending if suitable history is unavailable; no bulk fixtures or quota-filling exercises.

### AC05 — Bring the whole project into the conversation

**Outcome:** the assistant understands the book/report beyond the open chapter and recognizes research and previous project discussions.

1. Implement the context layers and deterministic budgets above. Include full active manuscript where it fits, otherwise project structure/synopses, current/relevant passages across documents, relevant research notes/inspected excerpts and prior-chat material. Reuse AC04 for missing large-project overviews under the approved policy; do not require the user to hand-maintain synopses.
2. Retrieve on Send using existing local data/search capabilities and bounded chat reads. Revalidate stale hits, scope and revisions; preserve active editor, search-job and cancellation ownership. No background full-library index or mandatory semantic infrastructure. Apply the approved archived-chat exclusion.
3. Include known-source identifiers, map referenced project sources to real records, and link valid references to the original source/excerpt or chat. Keep generated discussion separate from verified evidence. A metadata-only source is not presented as read; an invented ID is not a link.
4. Add optional pin/exclude/refresh controls under Context and a lightweight Discuss in chat action from Research. Automatic context follows the current project at Send; pins remain explicit snapshots. Use existing chapter/section own-body and inspection/version rules.
5. Match returned references against canonical project sources and display existing-source status. Support exact identifiers and reviewed uncertain matches; handle merged/trashed records without silent resurrection. This local recognition must work even with web search off.
6. Finish new context/provenance migration and portability in this stage. Keep selections bounded, auditable and private to the project; do not send every prior chat and full original on every turn.

**Owners:** worker context/conversations/search/source/notes/inspection modules, shared captures, research navigation and optional Context/source presentation.

**Done when / user walkthrough:** ask about a decision in another active chat, a passage in a different chapter and existing research without attaching each manually. Ask for additional sources and confirm known matches are identified as existing. Inspect actual coverage, opt into This chat only, and confirm another project never contributes. Evaluate relevance/answer quality with real user observation; no claim of perfect or exhaustive recall.

### AC06 — Search the web and retain usable references

**Outcome:** an explicit researched answer streams with traceable, reusable sources.

1. Add the compact Search the web composer toggle on a supported route. Bind it to the submitted context/model/effort. Briefly disclose that shared context can inform provider search queries. No hidden search probe, crawler, shell or general tool executor.
2. Version tool-enabled instructions and structured results separately from frozen text-only v4. Extend request and stream parsing together, retaining final text, bounded citations and retrieved references through encrypted protection, worker settlement, handoff and portable export. Do not retain hidden reasoning.
3. Validate URLs, annotation ranges, counts and message association. Render citations against canonical text despite Markdown. Preserve useful text with an appropriate source warning for malformed ancillary annotations; retain honest failed/incomplete outcomes for invalid result contracts.
4. Match against project research through AC05 before presentation. Show cited references near the answer, existing matches as In Research, and extra retrieved material in a disclosure. Do not call an already saved source a new discovery.
5. Respect route-supported parameters and bounded response size/time. Stop does not prove remote cancellation or a usage refund. Search refusal preserves the prompt and offers an explicit text-only alternative; it never silently answers as if live research occurred.

**Owners:** direct transport, versioned execution/results, existing protected operation/handoff owners and message/source presentation.

**Done when / user walkthrough:** explicitly search a public topic, open references, distinguish existing/new-to-project records, reopen and retain them, then chat with search off. A real permitted research response is required for acceptance; parser/UI implementation alone is insufficient.

### AC07 — Add research and cite it in writing

**Outcome:** chat references become ordinary project research and real manuscript citations.

1. Show Add to Research for unsaved references; known matches show Open source/Cite. Support a Save reference action on selected ordinary response text for books and other supported non-URL bibliographic types. Prose-extracted metadata is an unverified suggestion.
2. Use a compact prefilled review form and existing duplicate logic. Ask only for required missing metadata; never invent author/year/DOI/pages. Keep edits across dismissal/uncertain saves. Offer Use existing for a candidate match without silently merging records.
3. Commit accepted metadata, original chat/reference provenance, canonical source link and an idempotent receipt in one worker transaction. A lost reply or repeat click reconciles that receipt; adding research needs no inference, URL fetch, attachment import or automatic verification.
4. After commit, refresh source/citation views without replacing dirty forms/editor state. Cite opens the existing citation form with the exact source and a valid captured manuscript position; insertion remains explicit. Preserve source/citation independently of later chat archival.
5. Complete source/provenance portability, rekey, retention and export support. Keep “provider reference,” “saved in Research” and “verified by the user” distinct. Missing originals/metadata remain visible; an AI-written quotation is never a verified extracted passage.

**Owners:** worker sources/conversations and transaction boundary, research forms/read models, ReferenceTools and existing citation/compilation pipeline.

**Done when / user walkthrough:** save a web reference and a reviewed book reference, reuse an existing match, cite at the intended writing location and export. Reopen/archive the chat and confirm research/citation persist; a changed insertion target must not misplace a citation.

### AC08 — Finish the integrated experience

**Outcome:** the whole chat → research → writing journey meets the simple product promise.

1. Remove remaining obsolete request-form copy and controls. Check that the ordinary pane shows header, conversation and composer, with advanced options contextual. Keep recovery actions reachable when relevant. Do not defer AC02's basic usability until here.
2. Resolve integration gaps in context, drafts, source matching, citation, Save/copy and recovery through their existing owners. Do not build a parallel storage or account system.
3. Prepare the user walkthrough below and record actual code-check outcomes separately from user observations. Keep provider, commercial, installed-platform and answer-quality gates explicit. No successful local sign-in or polished screen can stand in for the full feature.

**Done when:** implementation/checks finish and the guide covers all must-haves. User runtime/quality acceptance remains pending until results arrive; any blocked mandatory research/delivery capability leaves the overall feature incomplete.

## Acceptance and stage handoff

Implement only a requested stage and necessary dependency fixes. Read the current plan, AGENTS, source and prior user results; do not auto-advance. After code changes run **npm run format → npm run lint → npm run typecheck**, fixing all diagnostics while preserving vendor/generated/historical test files. Add no tests or testing infrastructure; do not run tests, builds, app/browser launches, probes or other runtime verification. Documentation-only edits require no code checks.

Update stage status, implementation record and a concise ordered manual guide. Distinguish implementation complete, actual command results, pending live milestones and user-confirmed acceptance. Stop after the requested stage's guide.

The integrated user walkthrough must establish:

1. **Obvious chat:** New chat opens a focused composer; model choice, one Send, streaming and ordinary follow-ups work without setup/review screens or history checkboxes. Back/New chat occupy one icon row.
2. **Project awareness:** the assistant uses relevant material from other chapters, existing research and previous eligible chats, recognizes existing sources and admits missing coverage. Current-item changes affect the next request; This chat only and exclusions are honored.
3. **Continuity:** drafts in multiple chats survive navigation and normal restart; long discussions retain useful memory under the approved automatic-summary policy; originals remain available and no request resends on reopening.
4. **Research to writing:** explicit search returns real references, existing matches are labeled, new references save to Research, and citations/bibliography/export use the correct source identity.
5. **Reliable ownership:** on disposable projects, Save/reopen, Backup/Restore and independent copy retain data without credentials or execution rights. Naturally encountered failures/Stop/local-protection cases preserve text and exact outcomes.
6. **Everyday usability:** keyboard/IME, narrow/zoomed panes and screen readers remain usable; scrolling does not fight the reader; typing continues during streaming. Judge response relevance, existing-source awareness and uncertainty honestly.

This plan records the approved decisions and AC02 implementation. It does not claim user acceptance or completion of AC03–AC08. Automatic summaries, broad project/research/prior-chat recall, web search and research-to-citation remain later-stage work.
