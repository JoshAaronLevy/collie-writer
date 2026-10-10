# Project import implementation plan

> **October 10, 2026 — UX direction superseded.** Josh's first reported walkthrough found the implemented import flow confusing and too complex to complete confidently. Use [Import UX revision implementation plan](import-ux-implementation-plan.md) for future import work: compact setup with model choice, one Submit, automatic preparation, a short summary and one Accept. Its product decisions replace the manual review/acknowledgment and multi-step presentation requirements below. IM01–IM12 remain historical implementation/storage records; their code-check results do not establish UX acceptance. IU01–IU05 are implementation complete — awaiting user testing. The [final guide](docs/manual-testing/import-IU05.md) and [acceptance record](docs/validation/import-IU05.md) cover the complete revised flow, older-import recovery and completed cleanup. Visual/runtime acceptance remains pending.

## Status and purpose

October 9, 2026 — Josh explicitly requested IM12 after IM11. **IM01–IM12 implementation complete — awaiting user testing.** The integrated import workflow includes protected intake, finite own-account analysis, reviewed explicit atomic confirmation, saved reports and continued imported chats/Research/Notes. IM12 keeps recovery presentation reachable, completes guarded dialog focus/navigation and report/narrow-layout polish, and consolidates the [final manual walkthrough](docs/manual-testing/import-IM12.md) and [acceptance record](docs/validation/import-IM12.md). SQL/minimum reader **30**, conversation capture **6**, direct execution/binding **9**, framing **6**, and conversation handoff **4** are unchanged. Earlier runtime acceptance is not inferred; the full sample import, native/provider/accessibility observations and commercial release gates remain pending. No clarifying questions remain.

The user first creates or opens a writable Collie Writer project. Inside that project, **Import → choose files and content types → Analyze with ChatGPT → review → Confirm import** adds the approved material. Import does not create a project, import another application's project container, replace the manuscript, or silently integrate an AI proposal.

The motivating use is moving existing cultural-analysis conversations and research into a project Josh creates in Collie Writer so he can continue his book there. The importer must be reusable for other books, research topics and exporters. The Cultural Analysis App supplies user-selected input examples only; its application, API, converters and repository conventions are not dependencies.

This plan supersedes the project-creation destination and historical Codex-only route requirements in [ai-import-design.md](ai-import-design.md) for this feature. It preserves that design's original retention, review, provenance and recovery principles. The user's current request calls for Collie's existing **ChatGPT integration**. Do not revive a refused Codex filesystem/tool route or replace authentication to implement import. Existing `.collie` Open/Restore and deterministic bibliography/writing imports keep their own contracts.

The [AI conversation plan](ai-conversations-implementation-plan.md) records AC01–AC08 as implemented with runtime acceptance still pending. A successful import must not be inferred from those code checks, prior streaming observations, or this planning inspection. Installed/commercial provider and broader release gates remain unresolved; this feature alone cannot change release NO-GO.

IM01's review resolved the document-shaped operation receipt constraint, paired native-chat/history assumptions, exact import packet/proposal, bounded lifecycle and copy/retention rules in the v1 contract. Later stages must use those explicit new versions rather than fabricate manuscript documents or AI attempts. The reconciled older design now points to this approved flow. Remaining account/runtime/release gates are recorded in the decision and do not imply that local foundations are blocked.

## Approved product decisions

Josh approved these decisions on October 9, 2026. They are requirements for the stages below and do not need renewed approval during implementation.

| Decision                    | Required behavior                                                                                                                                                                                                                                                                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial file formats        | Support JSON, UTF-8 text/Markdown, CSL-JSON, BibTeX and RIS. Defer PDF, DOCX, HTML, ZIP, scans/OCR and media to separately scoped readers. The first version covers every file in the supplied conversation collection.                                                                                                                                         |
| Continue imported chats     | Show imported conversations in the ordinary AI conversation list with preserved, labeled history and support new follow-up messages through the existing ChatGPT integration. Include eligible imported material in bounded project context while respecting archive/exclusion choices.                                                                         |
| Retain original files       | Keep exact selected originals inside the project, including records omitted from the visible import, with a size/privacy disclosure before analysis and confirmation. Exclude reasoning/internal records from ordinary transcripts and AI analysis payloads; their bytes remain in retained originals. Selected-content-only retention is outside this version. |
| Conversation branches       | Use the export's selected path for the main transcript; retain other branches for explicit inspection/selection. Never concatenate all branches. An isolated message array without branch evidence requires a reviewed interpretation of order and identity.                                                                                                    |
| Rejected sources and grades | Keep rejected-only links outside active Research while preserving inspectable message-level decisions, categories/tags and letter grades as imported metadata. A grade does not establish verification, and rejection in one message does not override a kept occurrence elsewhere.                                                                             |
| Finite analysis batches     | One explicit **Analyze with ChatGPT** action may authorize a disclosed, finite series of requests with Stop and a request ceiling. Pause at the ceiling or an error; continuing after a pause is explicit, and retries that can consume account allowance are never automatic. This import-specific permission is separate from automatic-summary permission.   |
| Import categories           | Offer **AI chats**, **Sources & research**, and **Notes**. Keep the existing text/Markdown writing importer separate. Do not infer manuscript chapters or replace writing from conversations; a Writing category requires additional explicitly requested work.                                                                                                 |

## What was inspected

Read-only inspection was confined to Collie Writer source/plans and the selected data directory in the reference workspace:

`/Users/joshlevy/Desktop/Cultural Analysis App/api/data/conversations`

No reference application code was needed. No source files were changed, no input was imported or sent to ChatGPT, and no application, tests, builds or runtime verification were run. Counts below describe the files observed on October 9, 2026; they are planning evidence, not hard-coded production expectations or an acceptance result.

### The entire supplied collection

| Folder                            | Files present                                                                    | Import significance                                                                              |
| --------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `cultural-analysis`               | `cultural-analysis.conversation.json`; `cultural-analysis.conversation.raw.json` | Curated aggregate plus an array of 33 raw conversations. The aggregate is not one original chat. |
| `harlows-monkey-attachment-study` | `.conversation.raw.json`, `.selected-path.raw.json`, `.all-branches.raw.json`    | An additional conversation not in that 33-chat aggregate.                                        |
| `marxist-revolutions-overview`    | The same three raw representations                                               | Conversation identity overlaps a chat in the aggregate.                                          |
| `sexism-studies-over-time`        | The same three raw representations                                               | Conversation identity overlaps a chat in the aggregate.                                          |
| `surprising-gen-z-stats`          | The same three raw representations                                               | Conversation identity overlaps a chat in the aggregate.                                          |
| `susan-b-anthony-racism`          | The same three raw representations                                               | Conversation identity overlaps a chat in the aggregate.                                          |

There are **17 JSON files**, totaling **12,521,137 bytes** (about 11.94 MiB), across **six folders**. Complete raw-conversation files contain 38 conversation occurrences with **34 distinct external conversation identities**. Four of the five standalone conversations overlap the aggregate; Harlow's adds the thirty-fourth. Selecting all files must not produce 38 chats plus extra copies of each selected-path/all-branches file.

The largest file is the aggregate raw JSON at **9,003,498 bytes**. The curated aggregate is **1,826,756 bytes**. These sizes are small enough for local bounded intake but much larger than a single current Collie AI context. File admission, local extraction, provider request limits and output limits are separate concerns.

### Shapes and relationships to preserve

| Shape observed                                     | Relevant fields                                                                                                                                               | Required interpretation                                                                                                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complete raw chat object, or array of chat objects | `id`, `conversation_id`, `title`, `create_time`, `update_time`, `current_node`, `mapping`, exported flags                                                     | Each original chat keeps a distinct identity. Follow `current_node` through node `parent` links and reverse the path; mapping-object iteration is not transcript order.                         |
| Raw mapping node/message                           | Node `id`/`parent`; message `id`, `author`, `content`, timestamps, `metadata`                                                                                 | Preserve node ID separately from message ID, actual roles, content type and source location. Structural cycles, missing parents and identity conflicts need explicit handling.                  |
| Selected-path/all-branches arrays                  | Arrays of raw message objects, without the full chat envelope or parent graph                                                                                 | Match by identities/content against other explicitly selected files when possible. The filename is a hint, never sufficient evidence of path, identity or completeness.                         |
| Curated aggregate                                  | Root array with one object; `conversation_id`, `threads`, `conversation`, `message_counts`, dates, tags/categories                                            | Split by thread identity. The observed aggregate has **33 threads, 265 displayed messages, 95 user messages and 170 assistant messages**. Multiple assistant messages per prompt are real data. |
| Curated message                                    | `id`, `role: You/LLM`, `message`, `date`, `turn_index`, optional `conversation_id`, `conversation_title`, `conversation_turn_index`, category/tags, `sources` | Map roles explicitly. A global prompt/turn index is not a thread ID or a promise of one assistant reply. Preserve exact source text alongside any display conversion.                           |
| Curated message sources                            | `sources.kept[]`, `sources.rejected[]`; title, URL, attribution, `letter_grade`                                                                               | Preserve each message–source occurrence and its decision independently of source deduplication. Attribution is not automatically an author.                                                     |
| Raw references                                     | `metadata.content_references`, grouped webpage items, source footnotes, `search_result_groups`, URL/image/widget records                                      | Distinguish cited references from search candidates, snippets, images and decorative metadata. A search result is not automatically a cited or inspected source.                                |

The first **62 curated messages lack a per-message `conversation_id`**. In this collection, the aggregate's original conversation ID, its thread entry and selected raw message identities provide the evidence for assignment. Do not assign every missing identity to the first chat as a generic rule. With only a curated file selected, use its explicit envelope where unambiguous and show the inferred membership for review; unresolved records remain unresolved.

The curated file contains **477 kept and 3 rejected source occurrences**, representing **463 distinct literal URL strings across both groups**. These are occurrence/string counts, not a promised count of unique Research records. URL normalization, repeated sources, raw references and review choices change the final total. Preserve the rejected occurrences even if the same reference is kept elsewhere.

Across one complete raw representation of each of the 34 unique chats, inspection found **96 user text messages and 171 assistant text messages**: 267 potential ordinary transcript messages. It also found 306 `thoughts` and 77 `reasoning_recap` records. Keep those latter records out of normal transcript, automatic context and AI import payloads. They remain within the retained original under the approved retention policy. The longest observed raw text message has **54,686 characters**, requiring fragment-aware analysis rather than dropping or truncating it.

The sample has structured source metadata but not the referenced articles' full bytes. A citation URL, search snippet or source grade cannot become an inspected excerpt or an attached original article. Image/widget records likewise do not prove reference provenance. Never fetch URLs or files named inside these JSON documents during import.

### Independence from the reference workspace

- Users select files through Collie's native picker. An **Add files** action can be repeated for different folders; the selection accumulates. No folder traversal, automatic sibling loading or dependence on a repository root is required.
- Production code recognizes data structures and exporter evidence, not `cultural-analysis`, a known project marker, particular chat IDs, dates, topics or Josh's absolute paths.
- `source_file`, attachment paths, URLs and other embedded references are inert metadata. A file absent from the selected set remains unavailable even if a similarly named file exists nearby.
- Do not copy this private collection into Collie's repository, fixtures, shipped examples, logs or diagnostics. Manual acceptance uses Josh-selected disposable copies. The importer must work when equivalent input files are outside any checkout.
- Do not use remembered export cutoffs or prior project-membership filters. This task includes all six folders regardless of age or topic.

## Product experience

### 1. Open Import inside a project

Provide a discoverable **Import** action in the project actions/details surface and a contextual route from Research. Avoid another permanent control in the manuscript formatting bar. Both routes open the same retained import owner, scoped to the exact project and working copy. Existing app navigation and access rules determine availability; no import entry on project creation and no new setup wizard.

Show a compact **Import into “Project title”** dialog containing:

- An **Add files** button, multi-selection, removable file rows, names/sizes and local readability feedback. Same basenames from different selections remain distinguishable without publishing absolute paths.
- Three independent checkboxes: **AI chats**, **Sources & research**, **Notes**. At least one is required. Detected types may be suggested, but never silently change the user's choices. Mixed content in one file is supported.
- Optional short instructions, such as “Keep each chat separate and preserve my source decisions.” These supplement the checked scope; they cannot override safety or preservation rules.
- The existing account/model choice and a concise disclosure of what will be sent. Account management uses the shared Manage ChatGPT dialog. Do not require a new provider setup.
- **Analyze with ChatGPT**, plus Cancel/Keep for later as appropriate. This explicitly sends the disclosed content; choosing files alone does not.

Content-type checkboxes describe what to extract, not guaranteed redaction of everything else in a mixed record. Explain when conversation text is needed to interpret source links. Prepare a bounded transmission manifest first; exclude internal reasoning, unrelated files, credentials and other projects. Default project context is title/type/description plus locally computed destination/duplicate information. Additional writing or existing chat bodies require an explicit scope expansion, not the ordinary chat auto-context policy.

### 2. Show progress in a separate dialog

After the intake dialog exits, open the progress dialog for the same import session; do not stack modals or re-create the session. Use honest phases: **Reading files → Analyzing with ChatGPT → Preparing review**. Show completed files/parts where measured; do not manufacture percentage/time estimates during an indeterminate request.

Keep **Stop analysis** distinct from **Close / Keep for later**. Dismissing the dialog can leave a currently authorized batch running while the app remains open, with a compact project-level progress/reopen action. Stop prevents further requests, cancels the current request through its owner and retains finished work. Closing the app cannot silently resume inference next launch.

Show errors and affected files/parts alongside preserved successful work. Account, request, unsupported-content, invalid-proposal and local-storage errors need different recovery actions. No modal surprise on background completion: if dismissed, show **Ready to review** rather than forcing focus back.

### 3. Review before anything is added

The progress dialog transitions to a review state, or opens review after its exit. Show a readable summary with tabs/sections for Chats, Sources, Notes and Issues:

- Counts of identified items, proposed new items, existing links, duplicates, rejected/excluded material, unresolved items and unanalyzed parts.
- Original chat titles/dates/message counts and the selected reading path; source rows with origin-message links and available metadata; note previews and proposed labels/links.
- A compact difference view for ambiguous variants. Let the user rename, exclude, change a proposed category, choose a supported path, correct metadata and decide between new/existing source records.
- Original values versus AI suggestions. Do not label an AI interpretation as a fact recovered from the export.
- Retained-original size/privacy disclosure and a complete file/record coverage report, including whole-original bytes that remain despite record exclusions.

Routine items can be confirmed together. Require decisions only for ambiguity that changes accepted identities/content or leaves a dangling relationship. If analysis is incomplete, block normal confirmation; offer a separately reviewed **Import selected completed items** only after explicitly excluding outstanding dependency groups and showing what remains unprocessed. A warning never quietly becomes consent to lose material.

The final button is **Import N selected items** (or **Confirm import** with adjacent counts), naming the destination. Analysis completion, Enter during review editing, opening review, reopening the project and dismissing errors never trigger it.

### 4. Finish in the existing workspace

After the local commit is acknowledged, show the counts actually added/reused/excluded with links to **Open chats**, **Open Research**, **Open Notes** and **View import report**. Preserve the current editor, caret, undo history and unsaved forms. Imported text never replaces the manuscript.

Local import completion and selected-file Save are separate. An unsaved project still chooses its first `.collie` destination on explicit Save. Import is recoverable locally; it does not silently write an existing selected file. Review/report history remains available under the project Import action without filling the writing surface with technical status cards.

Use Mantine, existing semantic icon controls, scoped semantic CSS, retained presentation boundaries, keyboard labels and dialog exit/focus guards. Narrow windows and zoom must preserve access to selection, issues and final confirmation. Technical IDs, digests, chunk limits and provider diagnostics belong in details, not the primary flow.

## Initial supported scope

| Input family                                                              | Planned behavior                                                                                                                                                                  | Boundaries                                                                                                                                                                    |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JSON                                                                      | Recognize complete ChatGPT conversation objects/arrays, selected message arrays, curated thread/message/source collections; allow bounded AI interpretation of other JSON layouts | Recognize shapes, not exporter filenames. Preserve unknown fields and report ambiguous mappings. No generated parser code or arbitrary JSONPath execution.                    |
| Text and Markdown                                                         | Import existing notes and readable transcript/research material; AI proposes category, boundaries and relationships                                                               | Preserve wording and order. Report unsupported note formatting; safe display only. A conversation discussing an idea does not automatically become a new human-authored note. |
| CSL-JSON, BibTeX and RIS                                                  | Reuse existing bibliography parsing/normalization; feed bounded records to the same analysis/review workflow                                                                      | Keep original identifiers/raw records, unknown fields and conversion losses. Existing direct bibliography import continues separately.                                        |
| PDF, DOCX, HTML, ZIP, images/audio/video, encrypted/scanned/damaged files | Visible unsupported status in this first version                                                                                                                                  | No implicit unpacking, OCR, external conversion, macro/script execution, embedded-file resolution or provider-file upload. Add future readers through explicit stages.        |

Choosing **Sources & research** includes bibliographic records and reference relationships, not automatic truth checking or article downloads. Choosing **Notes** imports actual note content identified in the input, rather than asking ChatGPT to generate additional notes by summarizing every message. Any later generation workflow requires a distinct choice.

## Current Collie boundaries and implementation owners

These are observed source constraints, not proposed new features already present.

| Existing owner/contract                                                                                                                                                                                                       | Reuse and necessary extension                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Project renderer](src/renderer/src/features/projects/Projects.tsx), [workspace controller](src/renderer/src/features/workspace/useWorkspaceController.ts), [draft owner](src/renderer/src/features/workspace/DraftOwner.tsx) | Keep editor/save/flush/close/replacement/access ownership. Add one retained import controller and presentation routes; dialog lifetimes must not own recoverable work.                                                                                                                                                                                                                                                                                       |
| [Main project IPC](src/main/projects-ipc.ts), [preload](src/preload/index.ts)                                                                                                                                                 | Native file selection currently has scoped grants. Add a narrow multi-file import API and durable staged handles, not a generic renderer filesystem API.                                                                                                                                                                                                                                                                                                     |
| [Interchange contracts](src/shared/interchange.ts), [worker interchange](src/worker/projects/interchange.ts)                                                                                                                  | Existing text/Markdown import creates a new writing section. Its conversion helpers may be reused where semantics match; it is not a chat/note importer. Main currently checks an expiring picker grant before dispatch, so new import reconciliation must not depend on that path.                                                                                                                                                                          |
| [Source contracts](src/shared/sources.ts), [worker sources](src/worker/projects/sources.ts)                                                                                                                                   | Existing CSL-JSON/BibTeX/RIS support, normalization, candidate matching and explicit create/link/merge choices are foundations. Reuse normalized row writers inside the import transaction; do not replay public mutators as an unsafe multi-commit loop.                                                                                                                                                                                                    |
| [Notes](src/shared/notes.ts), [worker notes](src/worker/projects/notes.ts)                                                                                                                                                    | Current notes require `origin: 'human'`; note AST excludes citations, footnotes, images, tables and page breaks. Add truthful import provenance/versioning; never silently label AI-authored/imported content as human-origin or discard unsupported structure.                                                                                                                                                                                              |
| [Conversation contracts](src/shared/conversations.ts), [worker conversations](src/worker/projects/conversations.ts), [conversation provider](src/renderer/src/features/ai/conversations/ConversationProvider.tsx)             | Current messages require an attempt, and turns assume a user/assistant pair. Imported messages need an external origin and ordered groups that support multiple consecutive same-role messages without fake attempts.                                                                                                                                                                                                                                        |
| [Source receipts](src/worker/projects/conversation-sources.ts), [AC07 contract](docs/formats/conversation-sources-v1.md)                                                                                                      | Current receipts require a completed Collie assistant attempt/revision. Add imported-message reference provenance separately; do not forge an AC07 receipt. Use ordinary source/citation interfaces after a source exists.                                                                                                                                                                                                                                   |
| [AI service](src/main/ai/content-service.ts), [direct session](src/main/ai/direct-session.ts), [direct HTTP](src/main/ai/direct-http.ts)                                                                                      | Existing service dispatches conversation/proofreading content; direct contracts cover text and explicit web research. Import needs a distinct versioned purpose, request/output contract and settlement route using the same account, protection, Stop and recovery owners.                                                                                                                                                                                  |
| [Schema](src/worker/storage/schema.ts), [migrations](src/worker/storage/migrations.ts), [portable DB](src/worker/projects/portable-db.ts), [snapshot](src/worker/projects/snapshot.ts)                                        | Current SQL/minimum reader is **26** after IM07 (planning baseline 21). Conversation records are 2, live messages 1 and native capture 5; import packet/capture/run/proposal are 1 with direct execution/binding 7, framing 4 and import handoff 2. Earlier direct versions remain frozen. Preserve old readers/digests and complete every portability consumer when adding a format. Allocate new versions from the actual checkout at implementation time. |
| [Conversation knowledge](src/worker/projects/conversation-knowledge.ts), [memory](src/worker/projects/conversation-memory.ts), [local search](src/worker/projects/search.ts)                                                  | Imported eligible text must become usable by context, summaries, Find and source-origin navigation. Do not equate visibility in a transcript with eligibility in an attempt-based context builder.                                                                                                                                                                                                                                                           |

The current AI limits include 16,000 prompt units, 64,000 context units, 32 context chunks, 128,000 output units and 64 retained operation slots. Conversation builders impose additional framing/sub-budgets. Those are application limits, not provider token guarantees, and are not a batch scheduler. Never increase them globally just to fit a whole export.

## Architecture and IM01 contract

The [project import v1 specification](docs/formats/project-import-v1.md) freezes the detailed identities, field shapes, state transitions, packet/proposal, operation results, limits and consumer matrix. This section summarizes the original IM01 design requirements. The stage records and final IM12 record identify the implemented versions, bounds and remaining acceptance gates; historical stage-local availability statements below describe their original checkpoints.

### Files become immutable local input, not provider access to the filesystem

Main grants access only to explicitly picked files, bound to the trusted sender and exact project/workspace. Read regular files through bounded handles; reject directories, unsafe special files and unexpected replacement. Protect an immutable staged copy and digest before analysis. If the source changes during intake, discard the incomplete staged version and request reselection; do not claim the new bytes were the reviewed file.

The renderer receives opaque IDs and paged safe previews. It does not receive arbitrary paths or raw file authority. A selected source path is needed only for intake; all later analysis, review, commit and reconciliation use protected bytes. Renaming, deleting or moving an original after successful staging must not destroy the review or require another AI request.

Core v1 limits frozen in IM01, to enforce in both main and worker alongside the specification's additional parser, artifact, revision and packet limits:

| Limit                         | V1 value                                                                                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Files in one batch            | 100                                                                                                                                                        |
| Original file bytes           | 25 MiB per file; 100 MiB combined                                                                                                                          |
| Extracted text/metadata       | 20 million UTF-16 units per batch; no silent truncation                                                                                                    |
| Logical records/relationships | 50,000 records and 100,000 relationships per batch, plus all existing destination limits                                                                   |
| JSON nesting                  | 64 levels, with bounded parser nodes/string lengths and refusal before uncontrolled allocation                                                             |
| Review pagination             | 50 rows per page; bounded mounted previews independent of full accepted data                                                                               |
| Provider concurrency          | One request at a time through the existing owner                                                                                                           |
| Analysis allowance            | Initially at most 64 requests per explicit authorization, including retries/reconciliation requests; show the prepared count and pause before exceeding it |

These are local application bounds, not a claim of performance or account capacity. Reject or split before exceeding the smallest relevant bound. Account for original bytes, extraction/proposals, protected outputs, SQLite growth, retained migration/snapshot copies and expanded archive validation space before admission. Preserve completed work when capacity is unavailable. Do not make “clear cache” delete an import's originals, review edits or unresolved result. Changes to these bounds require a documented contract revision rather than an unrecorded implementation choice.

### One durable import session with distinct authorities

Define versioned contracts in proposed `src/shared/imports.ts`, domain conversion helpers, a main import service, worker import storage and `features/import/` UI. Split further by responsibility when useful; these filenames are proposed, not existing modules.

The portable project holds:

- Batch identity, selected content types, user instructions, creation time and project-local current revision.
- File manifests with immutable blob identity/hash, original name/size/media type and reader version; no executable path grants.
- Extracted record graph, exact locators and coverage ledger; distinguish raw chat/node/message IDs from new Collie IDs.
- Analysis captures/results and bounded coverage per part, proposal revisions, user decisions and import reports. Provider/account execution authority stays device-local.
- Accepted identity mappings and an immutable commit receipt linking the exact reviewed proposal/choices to the created/reused project entities.

An unfinished batch is recoverable project work. Saving a project can carry an inert batch, selected originals and protected review state even before acceptance; **this is not permission to add its candidate chats/sources/notes to ordinary project content or AI context**. Explain that pending imports are retained with the project. Copies and restores can inspect them, but cannot replay provider operations or previously confirmed writes.

Main retains encrypted account-bound execution records, current dispatch authorization, cancellation state and protection/settlement retries. Generalize the existing content lifecycle narrowly with an import discriminant; do not build a competing auth service, unbounded background queue or independent retry framework. Portable records are evidence, never tokens, account fingerprints, workspace grants or instructions to resume.

Protect edits before reporting “Kept for later.” Maintain monotonic session/proposal revisions, one active selector and exact same-operation acknowledgments. Generation guards reject late picker, analysis, review and navigation replies from old projects or sessions. Stage persistence may advance project bookkeeping/head; it never changes the editor payload. Head changes caused by saving staged work must not invalidate their own review without an explicit revision rule.

The following states summarize IM01's detailed contract. A dialog being open or closed is presentation state, not an import state.

| Durable state                | Entry and permitted next action                                                                                                       | Authority it does not confer                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Preparing                    | Pick/stage files, extract locally, revise choices; protect before leaving                                                             | No provider dispatch or accepted domain writes               |
| Ready to analyze             | Complete local admission and the transmission manifest; explicit Analyze authorizes the displayed finite batch                        | No authorization for a changed account, input set or scope   |
| Analyzing                    | Dispatch only the current authorized plan; protect/settle each completed part                                                         | No import confirmation and no retry of uncertain dispatch    |
| Paused / needs attention     | Stop, restart, failure, limit or changed account; inspect results, repair local protection or explicitly authorize remaining analysis | Reopening or dismissing an error cannot resume inference     |
| Ready for review             | Coverage accounted for; edit/exclude candidates and resolve issues                                                                    | A complete analysis is not an accepted import                |
| Ready to confirm             | Exact reviewed graph and destination checks are valid; explicit confirmation freezes the operation                                    | No background or stale-revision commit                       |
| Committing / outcome unknown | Admit the frozen operation, or reconcile its receipt; refuse a second operation until resolved                                        | Stop cannot promise to undo an already committed transaction |
| Completed                    | Receipt identifies accepted entities; open destinations, inspect report, explicitly Save                                              | No provider resend or repeated domain application            |
| Discarded                    | Explicitly retire uncommitted work after settling active/unknown operations                                                           | No claim that older saved/retained copies have been erased   |

Local protection failures are tracked independently of these phases: preserve the last durable state and the exact pending write, show the unresolved protection route, and refuse transitions that would abandon the only copy. A partially selected import becomes a new reviewed revision with explicit coverage exclusions, then follows the same confirmation path.

### Local extraction plus ChatGPT interpretation

Use deterministic local readers for identities, ordering, original text, declared source collections and recognizable structures. Ask ChatGPT to interpret ambiguous layouts, classify selected material, suggest bounded labels/metadata and connect records using supplied evidence. Every nonempty batch submitted through this workflow receives real ChatGPT analysis; a parser-only shortcut must not be presented as AI analysis.

For the initial text formats, **send file-derived content and structured records in bounded text payloads**. This fulfills analysis of selected files without assuming the current subscription route supports uploading file objects. Retain exact originals locally; supply original name, content digest, record IDs/locators, selected types and relevant project context with each part. The UI should say what content is sent, not claim a binary attachment upload that did not happen.

Use a new import-specific prompt and output schema. File content, old system/user messages, URLs and metadata are quoted data, never new system instructions. No filesystem tools, shell, browser, web search, MCP, external URL fetch or arbitrary model-generated transformation code is needed. Do not inherit the web-research template or feed exported prompts into the live conversation as current commands.

The model proposes **references to local records/ranges**, not regenerated chat transcripts or rewritten notes. A bounded proposal should contain:

- Version, batch/part/input digest and coverage references.
- Proposed entity kinds, source-record IDs/ranges, titles/labels and explicit suggested-field provenance.
- Thread/path suggestions and relationships between exact input identities.
- Potential duplicates/conflicts and unresolved questions with evidence.
- Warnings and exclusions; never a database mutation, local path, runnable expression or permission grant.

Validate shape, sizes, enumerations, referential integrity, coverage, exact text spans and scope locally. Resolve accepted text from immutable staged input. Reject invented IDs, wrong hashes, references to another batch/project, out-of-range spans, unsupported types and an attempted overwrite. Missing bibliographic facts stay empty; infer a source type only as a reviewable suggestion. IM01 selects bounded JSON returned as text with strict local validation for v1. Provider schema-enforcement options require a separately established, versioned request contract. Invalid output is a visible failure, not permission for a silent repair request.

### Bounded analysis and complete coverage

First construct a local inventory, cross-file identity map and task partition. Keep conversation boundaries, source occurrence locators and note ranges stable across parts. Split a long record at deterministic text boundaries while retaining its logical message ID, fragment order, exact offsets and reconstruction coverage. Overlap for model context is marked and never duplicated in the accepted transcript.

Build requests under the actual serialized framing and output budgets, reserving space for instructions, record references and JSON escaping. Estimate provider token demand conservatively where supported; characters are not tokens. Output requests are bounded too: a thousand references cannot be requested in one unbounded response. Deterministic consolidation handles cross-part identities. Additional AI reconciliation changes the plan digest and requires explicit continuation for its new bounded part; unused request allowance does not authorize an adaptive new request.

The batch's coverage ledger accounts for each selected file and logical record as accepted for analysis, completed, excluded, unsupported, conflicted, failed or not yet analyzed. Reasoning/internal records are explicitly excluded from analysis. A model's claim that it finished never overrides this ledger. Selecting only Sources does not report chat import coverage as complete.

Before Analyze, show the expected part/request count or a conservative bound and the ceiling. Accepted batch authorization may advance only to never-dispatched planned parts while the same app session, account/model and scope remain valid. Stop, disconnection, changed account/model, restart, uncertain transport, invalid output, capacity refusal or the request ceiling pauses further dispatch. Completed/protected parts are reused. **Resume remaining analysis** confirms a new finite authorization; **Analyze this part again** creates a new attempt and discloses additional usage. Do not automatically retry HTTP 503/429, timeout or truncated output.

Each completed part must be locally protected and settled before progressing. Do not allocate all parts as active AI operations up front or exceed retained operation capacity. Settlement acknowledgment must release only the appropriate device-local slot while preserving portable results/coverage; unresolved slots remain recoverable. Imports cannot starve ordinary chats, proofreading or recovery. A Stop/close race cannot attach a late result to a different batch.

### Imported conversation representation

Add a versioned external conversation origin and an imported-message store/read projection. Prefer separate imported transcript rows and provenance to weakening frozen live `conversation_messages`/attempt constraints. The existing conversation list can reference one conversation with a typed imported prefix and later real Collie exchanges. Imported data never gets a synthetic completed request, capture, provider binding, token usage or resend authority.

Preserve exact external IDs, title, participant/role information, timestamps and their precision/unknown state, selected-path order, available branch relationships and archive/exclusion flags. Keep imported historical time separate from Collie's import time. Do not invent a timestamp to fill missing metadata or sort equal/missing timestamps over a known parent-chain/sequence order. Unknown roles stay labeled and require a safe inclusion decision; exported system/tool records are not promoted to current instructions.

Support consecutive assistant or user messages. A visible exchange group may contain multiple messages; it is not a fabricated provider attempt. Timeline pagination/find/export need stable cursors across imported and native segments, exact message navigation, bounded rendering and unchanged draft/focus behavior. Retain original and curated message text as distinct variants with a documented display choice, because curated text may remove provider markers. Canonical source offsets belong to their exact text variant, never a cleaned string with assumed identical offsets.

For matching raw/curated views, raw identity/path evidence and curated human source decisions complement each other. Do not overwrite kept/rejected decisions using raw search metadata. Never silently prefer a changed body merely because a filename ends in `.raw.json`. Show substantive content conflicts; preserve all chosen-file provenance. An aggregate wrapper is not a conversation and does not merge thread histories.

### Sources, notes and relationships

Represent a bibliographic entity separately from each source occurrence. The same Research source can be linked from many messages, each with its own external decision, grade, original URL, locator and exact message revision. Retain raw cited references separately from search candidates and other metadata. Safe URL normalization may suggest a shared source, but original URL bytes and fields remain in provenance.

Use the existing normalized DOI/ISBN/URL candidates and title/author suggestions. Exact identifier agreement can preselect a reuse proposal; only final confirmation authorizes it. Title similarity alone never silently merges sources. Reuse of an existing source leaves its metadata and verification state intact. Follow legitimate merge chains, label removed sources honestly and never restore a trashed source as an import side effect. Conflicting metadata is presented for review without requiring destructive merge support in v1.

Rejected-only occurrences remain outside active Research by default, stored in inspectable import provenance with an explicit later review route. A kept occurrence may still create/reuse the corresponding source; the rejected occurrence remains attached to its original context. Existing `research_decisions` require a research-question identity, so do not invent a question or assign a global source rejection to fit that table.

Map categories/tags into supported labels with stable origin references. Preserve grades/unknown fields as imported metadata; do not turn them into Collie verification, evidence strength or a fabricated author. Chat reference metadata is sufficient to propose a source record, but not to claim the source was read. Exact quotations become inspected excerpts only through the existing inspection/provenance requirements; this import does not bypass them.

Import notes as supported note documents with external/imported origin and exact original text. Keep recorded author/assistant/unknown authorship distinct from the person confirming import. Plain text/Markdown conversion uses supported note nodes and a visible loss report. Unrepresentable material stays available in its original; the user can exclude or accept disclosed conversion losses. Source-note/chat-note links use project-owned, versioned relations rather than stuffing external IDs into document associations.

Chats-only imports retain available reference annotations/provenance without populating Research. Sources-only imports retain exact file/message origin locators without creating visible chats. Notes-only imports do not create chats or source records as hidden prerequisites. Reference relationships must support an input-origin locator when the originating entity was intentionally not imported, and must never contain a dangling foreign key.

### Duplicates and repeat imports

Use separate identities for file bytes, external entities, content variants and accepted Collie records. Namespace external IDs by exporter/origin, entity kind and external chat where applicable. A bare message ID, title, filename or content hash alone is not universal identity. Missing IDs use a conservative record locator plus file hash; near-duplicates require review.

Duplicate selected files are identified locally. Equivalent representations consolidate identities while retaining their distinct provenance and curated metadata. Re-importing the same accepted material defaults to **Already imported / Skip**, with no duplicate messages, links or notes. An existing import receipt can support a local no-op result without claiming a new AI analysis occurred.

Changed content under an existing external ID is a conflict, not an overwrite. V1 preserves existing project content and offers skip or an explicitly separate variant/conversation. Automatic historical-tail append and ongoing synchronization are deferred; never splice old messages around subsequent live Collie replies.

### Final confirmation and transaction boundary

Persist a review revision and freeze a commit manifest containing the exact batch/proposal/decision digest, target project/workspace, expected head/relevant destination revisions, planned new IDs, existing-source choices and counts. Flush/protect active writing and dirty retained owners through existing lifecycle rules before capturing the final destination state. Do not erase review edits if that flush fails.

Within the serial worker owner, first reconcile a matching prior operation receipt, before needing the original picker grant or source file. A completed same-operation request returns its original result even if the project head has since advanced. A reused operation ID with different bytes is a conflict. Unknown outcomes disable a second confirmation until receipt lookup resolves them.

For a new commit, recheck target access, batch/proposal revision, relevant project/source revisions, all input references, constraints and managed-asset availability. Relevant destination changes require refreshed local duplicate review and another confirmation; they do not automatically resend files to ChatGPT. Distinguish harmless bookkeeping changes from semantic changes using the frozen contract.

Prepare protected content-addressed blobs before a single bounded SQLite transaction. The transaction installs the accepted entity graph, provenance, labels/links, project head and exact import receipt atomically. Do not implement confirmation as a sequence of public “create source/create chat/create note” calls with independent commits. Enforce batch bounds before transaction admission. Prepared-but-uncommitted bytes remain attached to the recoverable batch; they are not automatically deleted as cache.

After acceptance, refresh destination read models without replacing retained editor/form objects. Before acceptance, cancellation means no accepted domain entities. During commit, show **Finishing import**; Stop cannot promise rollback after commit. If the reply is lost, **Check import result / Retry local completion** reconciles the same operation without inference. A partial acceptance finalizes that batch; importing its remaining excluded material requires another explicit batch, with originals and earlier coverage retained. A post-import “undo everything” is not a safe unconditional delete once citations, edits and new replies depend on imported records; use normal archive/trash/recovery actions and retain the import report. A future batch undo needs an explicit dependency-aware design.

### Save, recovery, copies and privacy

Every persistent extension includes its retained-copy migration, minimum-reader admission, immutable old schemas/readers/digests, complete graph validation, full-row snapshot/retention coverage and independent-copy rekey rules **in the stage that adds it**. Do not defer portability until the last stage. Include import tables/blobs in Save/Open, Backup/Restore, lineage/prefix checks, archive manifests and retained versions. Rekey project-owned IDs/references as required; preserve external identities, original bytes and frozen evidence digests under documented rules.

Preserve original source files and existing working data on migration, extraction, analysis or commit failure. Old apps must refuse a newer incompatible reader floor rather than partly open and discard imports. Storage maintenance must distinguish recoverable import work from rebuildable previews. Working-copy removal must refuse while import execution/protection authority or uniquely retained work remains unresolved.

Reopen acquires the project through `openProject` before reading the batch. Saved progress never grants dispatch authority. Lost-owner/restart outcomes become paused/unknown with the correct recovery path. Normal Close/Save/project replacement/access loss follows retained-owner protections; an actual persistence failure remains actionable and cannot be hidden by dismissing a modal. Offline users can inspect protected results, review and confirm locally when project access allows; fresh ChatGPT analysis requires an eligible connection.

Keep credentials and paths out of portable data and content-bearing diagnostics. Imported text, titles and snippets stay in project data/protected content, not telemetry. Whole-original retention means excluded records can remain in a `.collie` file; the UI must disclose this. No background transmission on open, Save, context inspection, source click or project copy.

## Provider and model decisions

The recommended runtime route is a narrowly extended version of the existing app-owned ChatGPT plan session. Official guidance documents account-specific model discovery, OAuth bearer authorization for the public Responses endpoint, `store: false`, `stream: true` and explicit terminal completion. This matches the current source direction; it does not establish every account's import capability or installed-product eligibility. [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference).

IM01 selects locally extracted bounded text with a new import output contract. The plan-use documentation distinguishes model-supported file inputs from its unsupported Files upload API. Collie's current adapter still requires the import-purpose extension; no binary/upload feature is included. Preserve the approved own-account route without API keys, fallback billing or another runtime. [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).

Keep main's capability facts bound to the actual account/model/catalog/session. Successful chat text and model-list visibility do not prove correct import JSON responses. An explicit user's import attempt can establish an observation; do not send hidden probes. Keep AC02's terminal-event safeguards, protected partial results, honest unknown outcomes and diagnostics. HTTP 200, stream EOF or a JSON-looking partial answer is not a completed valid proposal.

The stage recommendations below are **coding-assistant settings**, not hard-coded runtime models. Use **GPT-6 Astra** for the hardest contract/migration/transaction work and **GPT-6.1 Sol** for focused implementation and interface work. **High** means `high`; **Extra High** means `xhigh`. These are task-specific recommendations. Check availability in the user's client when beginning a stage; do not silently substitute. Official model guidance supports Sol for complex coding and Astra for the most demanding work. [Models and effort guidance](https://learn.chatgpt.com/docs/models).

The import dialog uses the user's existing account model catalog. Effort remains hidden unless the actual route/model contract supports it; coding-stage effort recommendations do not authorize adding a runtime effort parameter. [Reasoning documentation](https://developers.openai.com/api/docs/guides/reasoning).

## Stage map

**IM01 is complete as documentation; IM02–IM12 are implemented awaiting user testing.** Dependencies express implementation order, not inferred user acceptance or permission to advance. Request and complete one manageable stage at a time; if a stage proves too large, agree a named subdivision before expanding it. Do not introduce test hooks to make foundation stages independently demonstrable.

| Stage | Deliverable                                                                      | Depends on                       | Recommended coding model | Effort     |
| ----- | -------------------------------------------------------------------------------- | -------------------------------- | ------------------------ | ---------- |
| IM01  | Document approved scope, freeze provider/payload contract and import data design | Approved product decisions above | GPT-6 Astra              | Extra High |
| IM02  | Durable project import sessions, originals and receipt foundations               | IM01                             | GPT-6 Astra              | Extra High |
| IM03  | Project Import entry, multi-file intake and retained selection                   | IM02                             | GPT-6.1 Sol              | High       |
| IM04  | Local readers, identity graph, coverage and import previews                      | IM03                             | GPT-6 Astra              | High       |
| IM05  | External conversation/message storage and read contracts                         | IM02, IM04                       | GPT-6 Astra              | Extra High |
| IM06  | Imported source/note provenance and relation contracts                           | IM04–IM05                        | GPT-6 Astra              | High       |
| IM07  | One bounded ChatGPT import-analysis operation                                    | IM04–IM06                        | GPT-6 Astra              | Extra High |
| IM08  | Finite multi-part analysis, progress, Stop and resumable coverage                | IM07                             | GPT-6 Astra              | High       |
| IM09  | Editable proposal review, duplicates, issues and final-confirmation UI           | IM05–IM08                        | GPT-6.1 Sol              | High       |
| IM10  | Atomic confirmed import and exact local reconciliation                           | IM09                             | GPT-6 Astra              | Extra High |
| IM11  | Continue chats, use research/notes and preserve project context                  | IM10                             | GPT-6 Astra              | High       |
| IM12  | Integrated UX, complete corpus walkthrough and acceptance ledger                 | IM01–IM11                        | GPT-6.1 Sol              | High       |

### IM01 — Freeze the import contracts and scope

**Model: GPT-6 Astra | Effort: Extra High**

**Status:** documentation implementation complete — awaiting user testing (document review). Delivered the [decision](docs/decisions/import-IM01.md), [v1 contract](docs/formats/project-import-v1.md), [record](docs/validation/import-IM01.md) and [guide](docs/manual-testing/import-IM01.md); reconciled the older design and repository checkpoint. No code/active-format changes or runtime acceptance; documentation-only code checks were not required or run.

**Outcome:** implementation has a concrete destination, data model and provider contract instead of a generic “send files to AI” placeholder.

1. Carry the approved product decisions into the detailed contracts and reconcile the older import design with this plan. Preserve the settled format/category/retention/branch/batch policies without requesting approval again.
2. Trace the actual direct-session/content-service boundaries and specify the new import capability, request framing, structured proposal, cancellation, protection and settlement contract. Record unestablished capabilities precisely; no live probes or credential changes.
3. Write `docs/decisions/import-IM01.md` and the first versioned import format specification under `docs/formats/`, including state transitions, portable versus device-local ownership, identity/offset rules, proposed storage limits and a complete migration/consumer matrix.
4. Define which foreign conversation metadata is visible, retained only, excluded from analysis, or reviewable; specify defaults for unknown timestamps/roles and selected arrays without envelopes.
5. Resolve final-commit scope: no visible chats/sources/notes before confirmation, one bounded accepted graph transaction, separate local staging persistence and no project creation.

**Completion bar:** contracts are detailed enough to implement without guessing at authority, provenance, full-corpus coverage or recovery. Any provider blocker names only the dependent work; local foundations can proceed when separately requested.

**User review guide:** read the new detailed decision and format contracts; expect them to implement the approved product decisions and explain the payload, persistence, recovery and confirmation boundaries. Review any newly identified engineering limitations without reopening settled scope choices. This is a documentation stage with no new app behavior and no code-check requirement unless code is explicitly added to its scope.

### IM02 — Durable import sessions and protected originals

**Model: GPT-6 Astra | Effort: Extra High**

**Status:** implementation complete — awaiting user testing. SQL/minimum reader 22, strict batch/revision/file/artifact records, bounded managed originals, exact session receipts, retained main ownership and full preservation consumers are implemented. See the [contract](docs/formats/import-sessions-v1.md), [record](docs/validation/import-IM02.md) and [guide](docs/manual-testing/import-IM02.md). No public import UI or provider dispatch is enabled.

**Outcome:** import preparation can survive dismissal, normal close and project Save without becoming accepted content or replay authority.

1. Add versioned batch/file/proposal-revision/coverage/receipt foundations and narrow worker/main/preload commands. Implement the specified import-session operation-result variant without fabricating a document target; preserve the legacy result reader. Define immutable payloads and same-operation retry behavior before adding UI.
2. Use managed protected blobs for selected originals and derived artifacts; bind handles to exact project/workspace, prevent arbitrary paths and admit storage before promising protection.
3. Implement recoverable staged status, revision selectors, safe discard semantics and receipt-only outcome lookup. Explicit discard retires pending work truthfully; it must not imply removal from prior saved/retained project versions.
4. Add retained-owner/lifecycle registration, protection errors and working-copy removal guards. A renderer or presentation failure must not erase the authoritative batch.
5. Complete copy migration, portable graph/manifest/snapshot/rekey/retention/reader-floor coverage for every new record/blob, including bounded semantic artifact reads where SQLite-only validation is insufficient. Retain the specified conservative refusal of import-bearing working-copy removal. No credentials or live dispatch flags acquire portable authority.

**Owners:** new shared/domain/worker import contracts, main lifecycle, managed assets, storage/portable consumers.

**Completion bar:** recoverable staging and exact receipts are production contracts; ordinary domain content is untouched. User-facing intake arrives in IM03.

**Manual guide:** provide the user's normal launch/reopen steps using a disposable project copy; existing writing, chats, Research and Save should behave as before after any format migration. Explain that staged import persistence becomes directly observable in IM03; do not claim this foundation was runtime-tested or add a testing-only UI.

### IM03 — Project Import entry and multi-file selection

**Model: GPT-6.1 Sol | Effort: High**

**Status:** implementation complete — awaiting user testing. Delivered native multi-file staging, exact duplicate/readability/unsupported notices, revision-backed selection, retained categories/instructions, Keep for later, guarded connection-dialog transfer and local recovery. See the [contract](docs/formats/import-intake-v1.md), [record](docs/validation/import-IM03.md) and [guide](docs/manual-testing/import-IM03.md). Dirty choices must be protected/restored before Save/navigation/close; completed originals need no source paths on reopen. Analysis/final import are unavailable. SQL/minimum reader stays 22; no runtime acceptance is inferred.

**Outcome:** a user can gather files from all six folders into one recoverable project-scoped selection.

1. Add the project/Research entry points, intake dialog and retained import controller under existing workspace/draft ownership.
2. Implement native multi-selection plus repeated Add files; stage selected bytes immediately under bounded main authority. Display names, sizes, exact duplicate-file notices and readable/unsupported status. Removing a selection changes the batch revision, not another batch's data.
3. Add content-type checkboxes, optional instructions, destination identity, original-retention disclosure and the shared account/model access route.
4. Protect selection/choices, return focus after dialogs, support Keep for later/reopen and preserve the original project through navigation. A stale picker reply cannot attach files to a newly selected project.
5. Until IM07–IM08 are wired, make analysis unavailability explicit and keep final import unavailable. No fake progress, mock proposal or hidden dispatch.

**Completion bar:** selections survive their documented lifecycle and intake sends no provider request.

**Manual guide:** create a disposable project; select several JSONs; Add files from another folder; remove one file; dismiss/reopen; Save/close/reopen. Expect the exact retained selection and checked types, no new chats/sources/notes and no analysis request. Try an unsupported file and cancel a native picker; expect a useful message or unchanged selection.

### IM04 — Local readers and the input record graph

**Model: GPT-6 Astra | Effort: High**

**Status:** implementation complete — awaiting user testing. SQL/minimum reader 23 adds portable graph/page storage with prepare mutation/revision 2; prior contracts remain frozen. Bounded local readers, identity/variant and occurrence relationships, source pointers, exclusions, file coverage and paged previews are implemented. See the [contract](docs/formats/import-graph-v1.md), [record](docs/validation/import-IM04.md) and [guide](docs/manual-testing/import-IM04.md). Actual collection coverage and native persistence remain pending. No ChatGPT analysis or accepted domain content is enabled.

**Outcome:** selected files become traceable records, with honest coverage before ChatGPT interpretation.

1. Implement bounded JSON, UTF-8 text/Markdown and existing bibliography reader adapters. Preserve raw bytes and unknown fields; distinguish unsupported content from corrupt supported syntax.
2. Recognize raw chat envelopes, aggregate arrays, mapping parent chains, bare message arrays and curated thread/message/source records structurally. Include every selected file; do not filter by sample-specific topic, path, marker or date.
3. Build stable external/record/fragment identities, cross-file candidate matches, thread membership and exact source occurrence locators. Preserve curated decisions, metadata and body variants; resolve only proven equivalence.
4. Separate visible chat text from reasoning/internal content, source citations from search candidates, and imported notes from inferred suggestions. Plan fragments for over-budget records without truncating accepted text.
5. Add a local preview/coverage detail to intake with file/record counts, unsupported items and unresolved relationships. All produced records remain candidates.

**Owners:** worker/domain readers and graph builders, existing bibliography helpers, paged import previews.

**Completion bar:** the supplied collection is representable without conflating 17 files with 17 chats, losing Harlow's chat or duplicating the four overlapping chats. Generic unfamiliar JSON has a safe bounded candidate path or a clear limitation.

**Manual guide:** select disposable copies of all 17 files using repeated Add files. Inspect the local inventory and overlapping identities; compare a known raw/curated message and its kept/rejected links. Expect source pointers and explicit excluded internal records. Select one bare array alone and inspect the missing-envelope warning. No AI or accepted domain records yet.

### IM05 — Imported conversation and message contracts

**Model: GPT-6 Astra | Effort: Extra High**

**Status:** implementation complete — awaiting user testing. SQL/minimum reader 24 adds strict v1 external origin/message storage with exact variant/order evidence, retained-copy migration and full preservation readers. Unified read/Find/text cursors, list metadata, external-prefix export readers and ordered staged previews are implemented. Native paired history remains unchanged; accepted UI/context continuation remains IM11 and accepted writes remain IM10. See the [contract](docs/formats/external-conversations-v1.md), [record](docs/validation/import-IM05.md) and [guide](docs/manual-testing/import-IM05.md). No fake accepted content or live attempts were created.

**Outcome:** imported history has a real data model compatible with Collie's live conversation owners.

1. Add versioned external origin, imported messages, branch/variant provenance and stable ordering. Preserve current live message/attempt readers and constraints; do not fabricate attempts.
2. Define the unified typed transcript projection, imported prefix/native suffix cursor rules and exact message navigation. Handle repeated roles, missing timestamps, unknown roles and large messages explicitly.
3. Prepare list/Find/export consumers to read imported records safely, with archive/exclusion metadata, original versus import dates and raw versus display text mapping.
4. Make the import preview use that same projection so review accurately represents the eventual transcript. Accepted imports are still unavailable until IM10.
5. Complete this stage's migrations and all portable graph, copy/rekey, archive, retention and transcript-export readers. Add no fake data merely to populate the feature.

**Owners:** shared conversations/imports, worker conversations, conversation read projections/export, storage consumers.

**Completion bar:** the schema and readers can represent the observed 95-user/170-assistant aggregate faithfully, and existing native conversations retain their exact contracts.

**Manual guide:** inspect a staged transcript containing consecutive assistant messages, its dates and original references; expect separate ordered messages and no live-request status on them. Open an existing Collie chat and inspect ordinary history/export. Actual imported-list persistence and continuation are exercised after IM10/IM11, not claimed here.

### IM06 — Sources, notes and imported provenance

**Model: GPT-6 Astra | Effort: High**

**Status:** implementation complete — awaiting user testing. SQL/minimum reader 25 adds strict v1 imported-content origins with retained-only or accepted-message references, note origin/initial body evidence, preserved schema 24 and all portability consumers. Local destination groups, canonical source suggestions, category counts, literal notes/labels/loss notices and bounded previews are implemented. Internal writers have no IPC or UI acceptance route; real accepted writes and operation replay remain IM10. See the [contract](docs/formats/imported-content-v1.md), [record](docs/validation/import-IM06.md) and [guide](docs/manual-testing/import-IM06.md).

**Outcome:** sources/notes can be reviewed and committed with truthful authorship and message-level relationships.

1. Add imported reference occurrence/decision provenance that supports retained-only input origins as well as accepted message IDs. Keep AC07 live-attempt receipts unchanged.
2. Reuse canonical source normalization/candidate matching, preserve original fields/grades, represent kept/rejected occurrences independently and handle merged/removed existing sources.
3. Add versioned imported note origin and supported note conversion/labels/links. Keep exact source text and report unsupported note structure; do not mark generated suggestions as original human notes.
4. Define category-combination semantics: chats without Research creation, sources without visible chats, notes without implicit sources. Draft dependency groups for review and final commit.
5. Update source/note/provenance read/export contracts and every persistence/copy/retention consumer for new formats. Prepare internal transactional writers without exposing a bypass around confirmation.

**Completion bar:** review preserves occurrence-level decisions while safely proposing unique destination sources and usable notes. Source metadata is never promoted to verified evidence.

**Manual guide:** inspect a rejected source, a repeated source and incomplete bibliography fields in staged previews. Toggle content categories and expect accurate destination counts with retained origin locators. Use an existing personal note/text file if desired; inspect wording and declared format losses. No accepted source/note creation yet.

### IM07 — One protected ChatGPT import-analysis request

**Checkpoint:** implementation complete — awaiting user testing. The [v1 contract](docs/formats/import-analysis-v1.md) records the exact implemented bounds/versions and the [stage record](docs/validation/import-IM07.md) separates code checks from live acceptance. IM07 sends no project context; only the disclosed eligible selected-file content, metadata and instructions are included. Over-limit selections are refused before sending. No sample collection has been transmitted or imported by the assistant.

**Model: GPT-6 Astra | Effort: Extra High**

**Outcome:** a small explicitly submitted batch receives real, protected ChatGPT analysis and a locally validated proposal.

1. Add an import purpose to the existing AI/content ownership system with new execution/binding/capture/output versions as needed. Preserve all old request framing, readers and digests.
2. Implement import-specific tool-free framing, exact input manifest, account/model/catalog capture and bounded structured proposal validation. Include only disclosed selected-file material and approved project context.
3. Add the intake-to-progress dialog handoff and a genuine single-request Analyze action. Until IM08, disclose and refuse multi-part batches before sending instead of silently analyzing only the first part.
4. Protect the complete result and settlement before displaying it as usable. Preserve invalid/partial/unknown output for recovery while blocking acceptance; no automatic repair or retry.
5. Integrate Stop, account errors, local-protection retry, session diagnostics and capability observations. Keep provider account management shared; final commit remains unavailable until IM10.

**Completion bar:** completed, locally validated analysis is distinguishable from streamed text, provider failure and local persistence failure. No selected content is sent on pick/open/reopen.

**Manual guide:** Josh launches normally, selects a small disposable supported file, reviews the sharing disclosure and clicks Analyze. Expect a real request, honest progress, a retained proposed result and no domain import. Stop another explicit request or use ordinary offline conditions; expect retained completed work and a distinct failure/Stop state without automatic resend. Live success remains pending until Josh reports it.

### IM08 — Multi-part analysis and recoverable progress

**Checkpoint:** implementation complete — awaiting user testing. The [multipart contract](docs/formats/import-analysis-v2.md) specifies stable 12,000-unit fragments, bounded packets/output, at most 64 requests per grant, one protected part at a time, explicit proposal selection and portable recovery. Dismissal retains progress; restart never retains send authority. Local identity/equivalence consolidation generates no extra AI reconciliation requests. See the [record](docs/validation/import-IM08.md) and [guide](docs/manual-testing/import-IM08.md). No live collection analysis or runtime acceptance is claimed.

**Model: GPT-6 Astra | Effort: High**

**Outcome:** the complete collection can be analyzed across finite requests without silent omissions or duplicate work.

1. Implement deterministic partitioning, long-message fragments, complete input/output budgets and stable cross-part identities using IM04's graph.
2. Show part/request estimates and a hard authorization ceiling; execute one planned part at a time through the existing AI owner, respecting retained-operation capacity.
3. Settle and retain each result and consolidate duplicates locally. Additional bounded AI reconciliation requires a disclosed revised plan and explicit continuation; count it against the new finite authorization and batch capacity. Keep one explicit current proposal revision.
4. Add Stop, pause, Resume remaining analysis and explicit reanalysis semantics. Restart, account/model changes, errors, capacity refusal and uncertain dispatch pause; never reset completed parts or automatically resend them.
5. Make coverage and issues inspectable per file/part; a valid partial result cannot claim full completion. Keep progress available after dismissal/navigation without force-opening a modal.

**Completion bar:** all eligible supplied records can be covered over one or more explicit finite authorizations, including the largest file/message. No whole-file truncation or silent allowance overrun.

**Manual guide:** analyze the complete disposable collection; dismiss/reopen progress; Stop mid-batch and resume remaining work explicitly. Expect stable completed counts and reuse of protected parts. Close/reopen normally at a paused boundary; expect no automatic request. Inspect partial coverage before resuming and expect confirmation still unavailable for unreviewed/unfinished material.

### IM09 — Review, corrections and final-confirmation presentation

**Status:** implementation complete — awaiting user testing. SQL/minimum reader 28 adds immutable review/choice revisions, explicit current selectors and paged confirmation manifests. Real protected coverage, original/AI suggestions, exact envelope/message inclusion, source normalization/reuse, duplicate conflicts, literal notes/labels and scoped partial exclusions are implemented. Save/reopen/copy/recovery and accessibility remain pending; final Confirm has no commit handler until IM10. See the [contract](docs/formats/import-review-v1.md), [record](docs/validation/import-IM09.md) and [guide](docs/manual-testing/import-IM09.md).

**Model: GPT-6.1 Sol | Effort: High**

**Outcome:** the user can understand and correct exactly what an import will add.

1. Build the summary and paged Chats/Sources/Notes/Issues review using real protected proposals, not full raw output rendered in a dialog.
2. Support exclusions, title/label/metadata correction, source reuse choices, conservative duplicate handling and evidence-backed thread/path choices. Preserve all manual edits as revisioned review work.
3. Show original/AI-suggested distinctions, incomplete coverage, unknown metadata and conversion losses. Require resolution of blocking conflicts and dependent relationships before eligibility for final confirmation.
4. Implement clearly scoped partial-import review with explicit outstanding exclusions; prevent hidden inclusion of dependencies or unchecked categories.
5. Prepare an immutable confirmation manifest and display exact destination/counts. Until IM10 provides commit, the action remains visibly unavailable; no handler may call ordinary domain writes as a shortcut.

**Completion bar:** the final manifest can be reconstructed entirely from retained input, proposal and user choices; changing any meaningful choice invalidates the old manifest. Dismiss/reopen retains edits.

**Manual guide:** rename one chat, exclude another, correct a source and choose an existing-source link. Dismiss/reopen review; expect every edit preserved and counts updated. Inspect one rejected source and one unresolved item. No automatic import occurs even for an error-free proposal; confirmation is not active until its IM10 handler exists.

### IM10 — Confirm and atomically add the reviewed material

**Status:** implementation complete — awaiting user testing. SQL/minimum reader 29 adds strict atomic acceptance receipts and accepted-original identity tracking, frozen schema 28 and retained-copy migration. Explicit confirmation, retained-owner/access/head guards, accepted chats/messages/sources/notes/labels/provenance, exact read-only reconciliation, completed reports/links, default duplicate skips and conservative changed-identity review are implemented. Import completion is separate from selected-file Save; imported follow-up/context remains IM11. See the [contract](docs/formats/import-commit-v1.md), [record](docs/validation/import-IM10.md) and [guide](docs/manual-testing/import-IM10.md). No native/runtime acceptance is inferred.

**Model: GPT-6 Astra | Effort: Extra High**

**Outcome:** one explicit confirmation adds the reviewed graph exactly once to the current project.

1. Wire confirmation through retained-owner flush/access guards and capture the final project/decision revisions. Preserve active editor and Research/Notes forms on failure or refresh.
2. Implement the bounded worker transaction for accepted chats/messages, sources, notes, labels/relations, immutable provenance and final receipt, including the specified import-commit operation-result variant. Publish managed blob references only when prepared bytes are protected.
3. Implement receipt-first reconciliation without original paths or picker grants, exact uncertain retries, operation conflicts and changed-destination duplicate review. Offline local confirmation remains possible when analysis is already protected and access permits.
4. Enable success links/report and re-import no-op/conflict behavior. Double submission cannot create duplicate items or additional requests. Do not infer project Save from import completion.
5. Complete accepted-graph portability/retention integration and migration documentation; no dangling source/message/label/blob references or partial entity visibility on refused commits.

**Completion bar:** no domain writes before explicit confirmation; afterward, actual counts match the receipt. A failed/unknown response remains recoverable without rerunning analysis or requiring the source files.

**Manual guide:** on a disposable project, confirm a small reviewed batch and open each destination. Import it again; expect already-imported/duplicate handling. Stage another batch, move only the disposable selected originals after staging, then confirm; expect use of retained bytes. Change a relevant existing source before confirmation; expect renewed local review. Save/reopen a disposable `.collie` copy and inspect records/links. Rare lost-reply/storage-failure outcomes remain unverified unless encountered; do not manufacture them with scripts or fault injection.

### IM11 — Make the imported project useful for continued work

**Status:** implementation complete — awaiting user testing. Versioned exact imported references remain separate from native paired history. Existing live Send/Stop/draft/recovery owners support text and explicit web follow-up. Bounded memory and project recall preserve archive/exclusion intent; imported transcript/Find and Research/Notes origin links are exposed in ordinary surfaces. SQL/minimum reader 30 retains schema-29 DDL and old captures. See the [contract](docs/formats/imported-conversation-context-v1.md), [record](docs/validation/import-IM11.md) and [guide](docs/manual-testing/import-IM11.md). Provider, native, relevance, citation and accessibility acceptance remains pending.

**Model: GPT-6 Astra | Effort: High**

**Outcome:** imported history participates in the ordinary writing/research journey with its provenance intact.

1. Finish ordinary conversation list/open/Find/paging/export for imported prefixes and new native exchanges, preserving consecutive roles, timestamps, exact source-origin navigation and existing unsent drafts.
2. Enable explicit follow-up Send in an imported chat using the same live AI owner. Retain the immutable imported prefix; new requests get real captures/attempts and never reauthorize old exported messages.
3. Extend current-chat history, AC04 memory coverage and AC05 project knowledge/pins/exclusions to imported message references with new versioned contracts where required. Avoid synthetic user/assistant pairs. Treat imported prior discussion as untrusted background, not verified research; preserve archived/do-not-recall intent.
4. Expose source origin links and Notes/Research relationships through existing interfaces. Cite accepted sources through the existing selection capture/form/Apply pipeline; importing references does not insert citations into writing.
5. Complete exports and Save/copy behavior for imported provenance plus later native activity. Plain transcript/bibliography formats disclose unsupported provenance; `.collie` retains the full supported graph. Opening any of these surfaces causes no import analysis or replay.

**Completion bar:** “continue my work” includes follow-up conversations, discoverable sources/notes, context coverage and explicit citation use, not just storing JSON in an archive.

**Manual guide:** open an imported chat, find an older message, follow a linked source, then send a new follow-up. Expect labeled preserved imported history and a genuine new reply with inspectable bounded context. Start a new chat and inspect eligible project context; archive/exclude the imported chat and observe its exclusion on later sends. Insert a citation explicitly, export and Save/reopen a disposable project copy. Relevance, citation appearance and live completion remain user-observed outcomes.

### IM12 — Finish the integrated experience and acceptance record

**Model: GPT-6.1 Sol | Effort: High**

**Status:** implementation complete — awaiting user testing. Integrated focus/exit, uncertain-outcome recovery access, completed-report presentation and narrow actions are finished. The [record](docs/validation/import-IM12.md) maps requirements, inspected owners, exact limits and unresolved gates; the [guide](docs/manual-testing/import-IM12.md) includes the full selected-input corpus matrix. Required code checks are recorded separately from pending user observations. No new persisted/provider contracts are introduced.

**Outcome:** the entire workflow is coherent, its coverage is documented and Josh has a practical final walkthrough.

1. Finish copy, keyboard/focus behavior, dialog exit sequencing, narrow/zoom presentation, bounded lists and progress/report discoverability. Keep actual errors actionable and routine protection quiet.
2. Inspect source integration for lifecycle, archive/copy, retained drafts, storage maintenance and permission boundaries; correct gaps within the requested stage. This is source work, not permission for runtime checks.
3. Produce `docs/manual-testing/import-IM12.md` and `docs/validation/import-IM12.md`, including the full corpus matrix below, exact implemented limits, known format losses and unresolved gates.
4. Reconcile this plan's requirement/stage coverage and the old design's active direction. Record actual code-check results and user-supplied observations separately. Do not claim the sample was imported successfully until Josh does it.
5. Finish with the concise ordered guide and stop. No additional formats, synchronization, project-import wizard, auto-cleanup or provider rollout are silently included.

**Completion bar:** all selected-scope features are implemented with clean required code checks; product/native/provider acceptance is explicitly pending or backed by Josh's reported observations. Commercial readiness is separate.

## Final user-owned acceptance matrix

Use a new disposable Collie project and disposable input/project copies. Josh runs the repository's documented normal launch steps; the assistant does not launch the app, automate a browser, run test suites, generate fixtures or inject failures. If an existing environment issue prevents a scenario, record it as unverified rather than manufacturing evidence.

| Action by the user                                                                          | Observable expected result                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create a project, open Import, select files from all six folders through repeated Add files | One accumulated 17-file selection; no dependency on which folder was chosen first, no project-creation/import wizard.                                                                                                                                                                     |
| Inspect local inventory before Analyze                                                      | 34 distinct complete raw conversation identities are recognized in this snapshot, with four overlapping standalone chats and Harlow's additional chat; bare arrays are correlated by evidence.                                                                                            |
| Choose Chats and Sources, leave Notes unchecked, then Analyze                               | Only disclosed file-derived content/project context is submitted; honest bounded progress; no fabricated notes and no accepted domain records.                                                                                                                                            |
| Inspect the complete proposal                                                               | The 33-chat curated aggregate is split by identity; its 265 messages remain distinct, and the extra Harlow's text messages account for the raw collection's 267 potential visible messages, subject to explicit variant/path decisions. No reasoning records appear as ordinary messages. |
| Inspect source coverage                                                                     | 477 kept and 3 rejected curated occurrences remain accounted for; source totals explain deduplication/raw additions. Rejected occurrences, grades and original URLs are inspectable without claiming source verification.                                                                 |
| Open a long message and its links in review                                                 | Full retained text remains available, fragments do not duplicate or truncate the message, and links point to exact source message/variant provenance.                                                                                                                                     |
| Finish error-free analysis, then close the review                                           | Nothing has been added to Chats/Research/Notes. Reopening retains the review and still requires explicit confirmation.                                                                                                                                                                    |
| Correct a title/source, exclude items and confirm                                           | Only the selected validated graph is added; existing writing/forms remain intact and the report matches actual results.                                                                                                                                                                   |
| Repeat the same import or select raw/curated/array variants together                        | No duplicate conversations/messages from equivalent identities; conflicts are visible and no existing content is overwritten.                                                                                                                                                             |
| Perform chats-only, sources-only and notes-only imports on disposable projects              | The unchecked destination types remain unchanged; provenance still resolves to retained input where a visible origin entity was excluded.                                                                                                                                                 |
| Stop an analysis, dismiss progress, reopen and explicitly resume                            | Completed work is preserved; remaining requests require appropriate authorization; no restart/open action silently sends.                                                                                                                                                                 |
| Disconnect normally or encounter an actual provider/local error                             | The error names the affected work and the correct recovery action; partial/unknown output is not accepted as a completed proposal.                                                                                                                                                        |
| Stage disposable files, then move the originals                                             | Review/confirmation uses protected staged content; no original path requirement for an already completed receipt.                                                                                                                                                                         |
| Switch projects or attempt confirmation after relevant destination changes                  | Work remains bound to its original project; stale choices require renewed local review and do not silently retarget.                                                                                                                                                                      |
| Continue an imported chat and find its earlier source                                       | Imported history remains intact, new activity is native Collie activity, and context/source navigation respects the original identities.                                                                                                                                                  |
| Explicitly cite an imported Research source                                                 | The ordinary citation form and Apply action insert the citation into the captured manuscript selection; import itself inserted none.                                                                                                                                                      |
| Save, close, reopen, Backup/Restore and make an independent project copy                    | Supported content, pending reviews, original files and provenance remain accessible without the reference repo; no copied/reopened batch executes automatically.                                                                                                                          |
| Export chats/bibliography/writing                                                           | Original message order and supported source metadata survive; each non-project export explains any omitted provenance rather than implying full-fidelity project export.                                                                                                                  |
| Use keyboard navigation, a narrow window and zoom                                           | File selection, Stop, issues, review and confirmation remain reachable; dialog focus returns predictably and typing/IME does not accidentally confirm.                                                                                                                                    |

Counts are comparison aids for this observed snapshot. Refresh them from user-selected files if the collection changes; do not turn them into product constants or assistant-run test scripts. Broad malformed-export, filesystem-failure, disconnect-during-commit and platform-specific cases remain explicit manual/release gates until user observations establish them.

## Stage workflow and completion ledger

Every code stage must inspect script/ignore scope, then run **`npm run format` → `npm run lint` → `npm run typecheck`**. Fix all reported errors and warnings, including surfaced pre-existing findings, without weakening diagnostics or broadly ignoring authored code. Preserve vendored/generated files and historical tests. Documentation-only stages do not require these checks.

Do not add or run automated tests, test harnesses, fixture generators, mocks, verification/audit scripts, browser automation, builds, launches, benchmarks, dependency audits or testing-only hooks. Ordinary source/data inspection and Git reads are allowed. The proposed production parsers, validators, hashes, input limits and migration safety checks are product behavior, not test code.

For each requested stage, update this index and create `docs/validation/import-IMxx.md` and `docs/manual-testing/import-IMxx.md`; add/update versioned format/decision documents when that stage changes a contract. Record changed owners, actual versions/limits, real format/lint/typecheck outcomes, unresolved dependencies and user-reported results. Keep historical evidence intact.

Finish an implemented stage with **“Stage IMxx complete. As a user:”**, followed by ordered manual actions paired with visible outcomes and user-only setup/launch steps. State **implementation complete — awaiting user testing** separately from code-check results. For foundations with no new public action, say so and limit the guide to existing observable behavior and document review. If code/checks are blocked, report the partial state instead of claiming completion. Stop after the guide and await Josh's results; do not advance an unrequested stage.

| Stage | Implementation                                  | Required code checks                       | User acceptance                                                                              |
| ----- | ----------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| IM01  | Documentation implementation complete           | Not required or run; documentation only    | Product scope approved; detailed contract review pending                                     |
| IM02  | Implementation complete                         | Format, lint and node/web typechecks clean | Pending migration/existing-flow walkthrough; direct staging observation begins IM03          |
| IM03  | Implementation complete                         | Format, lint and node/web typechecks clean | Pending native intake/retention/reopen/accessibility walkthrough                             |
| IM04  | Implementation complete                         | Format, lint and node/web typechecks clean | Pending collection coverage, variants/provenance, native persistence and accessibility       |
| IM05  | Implementation complete                         | Format, lint and node/web typechecks clean | Pending staged ordering/variants/Find, native migration/history/export and accessibility     |
| IM06  | Implementation complete                         | Format, lint and node/web typechecks clean | Pending local source/note previews, category semantics, native persistence and accessibility |
| IM07  | Implementation complete                         | Format, lint and node/web typechecks clean | Pending live proposal, Stop/recovery, native persistence and accessibility                   |
| IM08  | Implementation complete                         | Format, lint and node/web typechecks clean | Pending live multipart coverage, Stop/reanalysis, native persistence and accessibility       |
| IM09  | Implemented — awaiting user testing             | Format, lint, node/web typechecks clean    | Pending native review/recovery/persistence and accessibility                                 |
| IM10  | Implementation complete — awaiting user testing | Format, lint, node/web typechecks clean    | Pending native commit/persistence                                                            |
| IM11  | Implementation complete — awaiting user testing | Format, lint, node/web typechecks clean    | Pending continuation/context/citations                                                       |
| IM12  | Implementation complete — awaiting user testing | Format, lint, node/web typechecks clean    | Pending full corpus, integrated/native/provider/accessibility acceptance                     |

The end state is a user-confirmed, portable addition of selected chats, sources and notes to an already-created project, followed by ordinary continued work in Collie. Planning completion, implementation completion, required code checks, live user acceptance and commercial release approval remain separate facts.
