# Collie Writer planning workspace implementation plan

October 15, 2026. **PL01–PL06 implementation complete — awaiting user testing.**

This plan adds a separate visual workspace for turning accumulated conversations, research, sources, and loose ideas into a book or article. It also connects that structure to the existing writing experience. The full journey remains the intended design; PL01–PL06 are implemented. This document does not establish runtime acceptance.

## 1. The experience to build

Open a project in **Write**, as today. Switch to **Plan** when you want to collect material, understand what you have, develop ideas, and arrange the work. Switch back to Write at any time. Both views belong to the same project and use the same chapters and material.

The central promise is: **put your material in one place, work through it with ChatGPT, and turn it into a structure you can write from.** You should not have to know your chapters before importing research, or manually summarize years of conversations before asking for help.

The complete journey is:

1. Import chats, documents, and research; add notes and source records. Existing project material is already visible in Plan.
2. Browse cards, collect related ideas, keep useful passages, and set aside irrelevant material. Organization is optional; dumping material is a valid starting point.
3. Talk to ChatGPT about all available material, a few selected cards, a topic group, or a chapter. Develop an idea or explicitly search for additional research.
4. Ask for an outline. ChatGPT suggests an order, chapter purposes, and material associated with each chapter. It can explain gaps and suggest what to set aside.
5. Refine the proposal in conversation or edit its cards, then choose **Use outline**. The accepted chapters and links become the project's actual structure.
6. Return to Write. The left outline contains those chapters. Selecting one shows its manuscript and makes its associated notes, research, and conversations available alongside it.
7. Ask for help continuing at the cursor, using the chapter purpose and material. Preview the proposed text, then explicitly insert it; ordinary Undo reverses the insertion.

Planning and writing remain iterative. A project can be partly drafted and partly unstructured. There is no required graduation from planning, and no separate synchronization or publishing step between Plan and Write.

## 2. Recommended UI and defaults

These are implementation defaults proposed by this plan, not choices already approved through user testing.

### Two working modes

Use the labels **Write** and **Plan** in a compact switch visible in both views. “Constructor” describes the idea, but “Plan” is shorter and includes gathering and developing ideas before there is a structure.

Keep Research as the existing detailed destination for sources, notes, annotations, questions, and claims. Plan brings those records together visually and opens their existing detail surfaces. It does not replace Research with a second content library.

Keep the shared project title, Save controls, and local protection notices. Opening a project still lands in Write. Entering Plan never sends an AI request.

Use **Chapters** for books and **Sections** for articles/reports where appropriate, backed by the existing document hierarchy. “Chapter” below is shorthand for the structural unit being planned. AI should suggest a suitable length and order from the project's purpose and material; a dozen chapters is an example, not a preset or required count.

### A card board with an optional AI companion

Start with an automatically arranged board, with movable cards and groups. An infinite canvas with arbitrary coordinates, connectors, zoom, and a minimap would add substantial interaction and storage work. Defer that until the card board has been used and free placement solves an observed problem.

Desktop concept, with example content only:

```text
 My project                  [ Write | Plan ]                     Save

 Material                    Structure                         ChatGPT
 [Import] [+ Note]            [+ Topic] [+ Chapter]              Using: Project material
 Find material…                                                [Change]
 Unplaced | All | Set aside   Topics
                             ┌────────────────────────────┐    “Help me find the main
 [Chat] Early arguments      │ Technology and trust       │     argument in this.”
 [Note] Working thesis       │ 5 items · 2 need development│
 [Source] Study on trust     └────────────────────────────┘    Response and questions…
 [Passage] Useful exchange
                             Chapters                         [Message…             ]
                             ┌────────────┐ ┌────────────┐    Search the web [ ]
                             │ 1. Opening │ │ 2. Context │    [Send]
                             │ Purpose…   │ │ Purpose…   │
                             │ 4 items    │ │ 7 items    │
                             └────────────┘ └────────────┘
```

The center gets the most space. Chapter cards follow manuscript order, wrap into a readable grid, and expose their associated material when selected. A dozen chapters should not require a dozen horizontal columns. Topic groups occupy a separate, collapsible area above chapters. Parts and nested sections remain visible through breadcrumbs and focused expansion.

The AI companion can close to give the board more room. Material detail temporarily uses the companion area with a clear return action; the selected chat and its unsent message remain retained. At narrow widths or 200% zoom, show one of Material, Structure, or Chat at a time with a clear switch and retained selection. Do not require three simultaneous columns or raise the native minimum window size.

The wireframe's unchecked search box illustrates the planning-chat default: **project analysis does not search the web unless requested**. This is a scoped default for new planning chats, not a global reversal of the current writing-chat behavior. Explicit web-search choices persist for that chat session.

### Material cards

Each card shows its type, title, a short preview, and only relevant state. Opening it reveals the actual note, conversation, source, or excerpt. A chat card represents a conversation; useful passages can also become individual cards with a link back to the exact original exchange.

Use existing note and source titles. A chat passage can take a short editable title from its text; creating a card does not need AI. Display AI-authored summaries distinctly from original text, and do not turn a generated summary into a purported quotation.

Useful actions are contextual: **Add to chapter**, **Add to topic**, **Discuss**, **Needs development**, **Set aside**, and **Open original**. Multi-select supports the same actions on a group. Avoid permanent button bars on every card.

The default Material filter is **Unplaced**, meaning material with no active chapter assignment, even if it belongs to a topic. **All** includes assigned material; **Set aside** makes excluded material easy to recover. Search and type/status filters operate on project material, not just the cards currently mounted on screen.

### Keep, develop, or set aside

Support three editorial dispositions, separate from source verification and manuscript status:

| Disposition       | Meaning                                                                  | Presentation                                               |
| ----------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Keep              | Available to organize and use; the default                               | No repeated Keep badge                                     |
| Needs development | Promising but incomplete, unclear, or insufficiently supported           | A small label and optional short reason                    |
| Set aside         | Excluded from ordinary planning suggestions and chapter drafting context | Hidden from the normal pool; recoverable through Set aside |

Do not require people to classify every item, impose the example 70/10/20 proportions, or present AI judgments as objective quality scores. “Needs development” can still be assigned to a chapter. A chapter can have useful material and unresolved gaps at the same time.

Set aside is reversible and does not trash an original, remove existing chapter links, alter citations, or overwrite Research's kept/rejected decisions. Existing chapter links to set-aside material remain visible in a small expandable group. Restoring the item restores its availability. Deleting content remains the existing, separate action.

### Topics before chapters

Allow optional named topic groups such as “Technology and trust” before the user knows the chapter structure. These are one-level collections of references, not manuscript documents or a second outline.

An item can belong to several topics or chapters. A topic can become a chapter through one explicit **Make chapter** action, creating a real empty chapter and carrying its references across. Remove the superseded topic group in that operation; preserve the materials and other memberships. Do not automatically add prose to the new chapter.

### Moving and sharing

- Dragging from Material onto a topic or chapter adds a reference; it does not move or copy the original content.
- Dragging an assignment between chapter cards moves that assignment while leaving its other chapter links intact.
- **Also use in…** adds another chapter reference. **Remove from chapter** removes only that reference.
- Provide labeled Add to, Move to, Move earlier/later, and Remove actions for keyboard and non-drag use. Announce the resulting destination and retain focus on the affected item.
- Dragging chapter cards changes the actual outline order. Manual renames and reordering in Write appear in Plan as well.

### AI proposals

“Suggest an outline” is a useful starter prompt, not a mandatory wizard. The user can instead ask ordinary questions, such as “What am I really arguing?”, “Which ideas overlap?”, or “What is missing here?”

An outline proposal uses the same chapter-card language as the board. Each proposed chapter has a title, a short purpose, associated material, and any specific development gaps. Suggested exclusions appear together as an optional group, with short reasons; they are off by default. Nothing is discarded just because the model dislikes it.

One **Use outline** action applies the displayed structure and selected assignments. **Keep discussing** and **Dismiss** leave the existing structure alone. The user can edit a proposal or remove a proposed change without accepting every card individually. For revisions to an existing outline, label the action **Apply changes** and show the affected chapters and links, not a second full setup workflow.

Ordinary manual edits take effect directly. The proposal boundary exists because an AI suggestion is not yet a user decision.

### Writing from the plan

Keep the existing chapter outline on the left and manuscript in the center. Add one **Chapter material** companion mode that lists Notes, Sources/excerpts, and Chats for the selected chapter. Reuse it from a chapter card in Plan. Selecting a chapter updates the material scope; it does not force the companion open if the user closed it.

For nested sections, show direct section material first and parent chapter material second, deduplicated. Show applicable part-level material separately when present. Cross-chapter associations remain possible. Do not silently include every sibling section in a section-specific AI request.

The AI composer has a concise scope label such as **Using: This chapter**, **This topic**, or **3 selected items**, with a contextual Change action. Writing help can use the chapter purpose, chosen material, the current passage, and nearby writing. Examples include “Help me start,” “Continue here,” and “Connect these two points.”

Generated prose appears as a preview with **Insert here**. Replacing selected prose is a separately labeled **Replace selection** action. A normal chat response does not enter the manuscript automatically, and moving the cursor while a response is running does not redirect an old insertion silently.

## 3. What exists and what must change

Inspected in the working checkout on October 14, 2026. These are source findings, not observed runtime behavior. Some older documents reference files that are absent in this checkout; implementation must follow live owners and available contracts rather than assume those historical records exist.

Read alongside [repository guidance](AGENTS.md), the [experience specification](docs/design/app-experience.md), [Import recovery contract](docs/formats/import-recovery-v1.md), [project knowledge contract](docs/formats/conversation-knowledge-v1.md), and [current conversation presentation plan](uat-round-3-implementation-plan.md). Their earlier implementation records retain their existing acceptance status.

| Area                          | Existing foundation                                                                                                                               | Required change                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Retained project session      | `WorkspaceSession.tsx`, `useWorkspaceController.ts`, `useWorkspaceNavigation.ts`, `RetainedRegion.tsx`                                            | Add Plan within the same session; preserve manuscript, source/note, and conversation draft owners                                |
| Navigation and writing layout | `src/renderer/src/app/navigation.ts`, `WorkspaceViews.tsx`, `WorkspaceNavigation.tsx`, `WritingWorkspace.tsx`                                     | Add the mode switch, Plan region, and chapter material presentation                                                              |
| Outline                       | `src/shared/outline.ts`, `src/worker/projects/outline.ts`, `manuscript.ts`, `document-commit.ts`                                                  | Reuse document IDs, hierarchy, title, synopsis, order, history, and guarded mutations; add a bounded atomic proposal application |
| Notes and sources             | `src/shared/notes.ts`, `sources.ts`, worker `notes.ts`/`sources.ts`                                                                               | Existing `documentIds`, `note_links`, and `source_links` already represent chapter/section associations; reuse them              |
| Conversations                 | Shared/worker `conversations.ts`, renderer `ConversationProvider.tsx` and `conversationState.ts`                                                  | Add many-to-many chapter associations; `originDocumentId` records where a chat began and cannot represent later organization     |
| Imported history              | `conversation-transcript.ts`, `external-conversations.ts`, `imported-context.ts`, `imported-provenance.ts`                                        | Preserve exact conversation/message identity and original ancestry; add a distinct passage contract where needed                 |
| Import                        | `ImportProvider`, `useImportSelection`, `useImportFlow`, worker import owners                                                                     | Reuse files/categories/instructions/model → Submit → summary → Accept; accepted content appears in Plan without a second import  |
| Research and AI context       | `conversation-knowledge.ts`, `conversation-memory.ts`, `conversation-research.ts`, `conversation-sources.ts` and corresponding worker/main owners | Add explicit board/chapter scope and corpus coverage; reuse source saving and evidence navigation                                |
| AI execution                  | `src/main/conversations/service.ts`, `src/main/ai/content-service.ts`, `direct-conversation.ts`, `direct-research.ts`                             | Extend existing request/capture/output contracts; keep the selected own-account route and existing durable operation owner       |
| Editor insertion              | `src/renderer/src/editor/selection.ts`, `adapter.ts`, `RichDraft.tsx`, `useManuscriptProtection.ts`                                               | Add a normal reversible editor insertion with exact target checks; retain manuscript protection and history                      |
| Portable storage              | `src/worker/storage/schema.ts`, `migrations.ts`, project `portable-db.ts`, `incoming.ts`, `snapshot.ts`, retained-version owners                  | Add validated portable records and complete copy/migration handling; current SQL schema is 40 after PL02                         |

Current AI recall is not a whole-project planning engine. The inspected knowledge collector limits its selected result to 24 items, ordinarily uses a 16,000-character serialization budget, and bounds several candidate scans to 200 items. Imported recall also has explicit message windows and skips oversized messages. Reusing that collector unchanged would miss older material in precisely the use case this feature must serve.

Also, the current imported context reference validator requires whole canonical messages with `start === 0`. Do not repurpose it to claim arbitrary highlighted passages are already supported. Introduce an additive, versioned passage reference and keep old readers exact.

There is a pre-existing local edit to `ConversationPanel.tsx` removing routine disclosure copy. This plan does not change it. Future stages must preserve unrelated working-tree edits and fit necessary scope information into concise contextual UI.

## 4. Data and behavior contracts

### One content library and one manuscript outline

The board is a projection of the project's existing records. It must not own copied note bodies, a second source library, duplicate conversations, or a second persistent chapter tree.

| Concept                         | Owner and persistence                                                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Accepted chapter/section        | Existing outline document; reuse `title`, `synopsis`, parent, position, and revision                                               |
| Note/source chapter assignment  | Existing canonical link tables; changes from either view use the same mutation authority                                           |
| Chat/excerpt chapter assignment | Small project-scoped link records for associations not currently represented; stable target identities and uniqueness              |
| Material disposition            | Sparse project-scoped metadata keyed by material identity; missing row means Keep; optional development reason                     |
| Topic group                     | Small portable group record and membership references; no nested general graph or independent content body                         |
| Captured chat passage           | Ordinary note content plus a versioned origin reference to retained native/imported messages, revisions, and exact text ranges     |
| Outline proposal                | Versioned retained suggestion tied to its producing AI attempt, input revisions, and proposed changes; not live outline state      |
| Analysis summaries              | Retained AI output with exact covered identities/ranges and revisions; reusable when inputs are unchanged; never original evidence |
| Layout preferences              | Device-local mode/pane/filter/scroll preferences; the meaningful chapter/topic order remains project data                          |

Use a small typed material reference shared by read projections and commands. Extend existing target contracts only where their semantics fit; avoid a generic graph framework or universal workflow engine. Persist only missing relationships and meaningful user decisions. Do not duplicate note/source links into a new board store that must then be synchronized.

For existing chats with a valid origin document, a retained migration may seed one initial chapter/section association, preserving the historical origin separately. Thereafter explicit associations control organization. New chats started from a chapter receive that link; chats started in Plan have project/topic scope and must not inherit whichever hidden manuscript section happens to be selected.

Passages from long or mixed-topic chats must remain usable independently of the entire chat. Retain the selected quotation and exact origin without changing the original message. If its target becomes unavailable, keep the captured text and show the limitation. A source excerpt keeps its existing source version/page and quotation anchors. Ordinary annotation or evidence details continue to open through their current owners; an annotation can be surfaced through its existing attached material without inventing a second annotation system.

### Chapter edits and proposal application

Manual structural changes use existing outline operations. A proposed outline needs one new bounded worker operation that applies the chapter edits and associated links in a single transaction. Issuing a series of independent create/move/link calls is insufficient: a partial outline must not be mistaken for an accepted proposal.

Use a stable operation ID, exact project/workspace scope, expected structural and material revisions, and a retained result. Repeated acknowledgment/retry returns the same outcome. Flush relevant local drafts before applying. If relevant inputs changed, retain the proposal, explain the specific conflict, and let the user update it; do not overwrite newer work or automatically issue another AI request.

The first version can propose creation, rename, synopsis, ordering, association changes, and optional editorial dispositions. Do not let AI apply manuscript-body edits, destructive chapter merges/splits, or chapter deletion through the outline proposal. Existing manual outline actions stay available.

An existing manuscript is preserved by default. The proposal retains stable IDs for existing chapters, highlights added/changed chapters, and leaves unspecified chapters and all prose intact. Empty starter chapters are not silently thrown away. The user can remove them through existing outline controls.

Provide a reversible **Undo outline change** using retained before/after data for the exact structural, association, and disposition changes. Existing manuscript checkpoints alone do not cover new link or board metadata. After intervening edits, refuse unsafe wholesale rollback and identify the affected changes; preserve newer prose. Do not restore the entire manuscript merely to undo a research assignment.

Manual chapter merge/split/archive/restore and existing History restoration also need defined association behavior when these links are introduced: a merge unions references without duplicates; a split keeps existing assignments on the original document unless explicitly reassigned; archive preserves links; restoration reconciles references by stable document identity. Retain removed targets and origins instead of cascading away working material. Handle the corresponding inverse changes in retained history where an operation changes links.

### Useful AI context for years of material

Support four visible scopes: **Project material**, **This topic**, **This chapter**, and **Selected items**. Resolve them through authoritative project reads. A UI card selection or visible page is not the complete AI corpus.

1. Enumerate eligible records through bounded pagination across the whole selected scope. Distinguish total material, readable text, excluded material, and material without usable text. Never use “latest 200” as an undisclosed definition of the project.
2. For ordinary topic questions, retrieve relevant passages and disclose the selected scope. For “organize everything” or “suggest an outline from my material,” cover the eligible corpus with staged summaries when it exceeds one request.
3. Read long notes, chats, and extracted source text in bounded chunks with exact origin/range references. Build item/topic summaries, then synthesize the outline from those summaries and relevant original passages. A summary records its coverage and uncertainty; it does not certify every fact or quote.
4. Reuse summaries only when their source revisions and analysis contract match. New or changed material invalidates the affected summaries. Summaries and the retained coverage record travel with the project; local retrieval projections can be rebuilt.
5. Run this as bounded work inside the existing explicit AI operation lifecycle. Freeze the approved scope and request budget for the run; bound calls, input, output, and retries. Start with sequential batches, not a new parallel-agent system or separate job service.
6. One disclosed Send/Organize action may authorize those bounded preparation requests. Give a concise notice when a large collection needs several requests, a progress count, and Stop. Never dispatch on opening Plan, importing successfully, moving a card, reopening, Save, or restoring a project.
7. If the budget, account access, cancellation, or unreadable material prevents full coverage, retain the useful result and report a concrete limitation, such as “Based on 68 of 120 items.” Offer explicit Continue for another bounded run. Do not silently call a sample the complete project or imply unfinished summaries are complete.
8. Resume only on an explicit user action and reuse exact protected results. Preserve original-project identity and do not redispatch completed requests after reopening or copying a project.

Set-aside, archived/trashed, excluded, and do-not-recall content stays out according to existing rules. Selecting something in the board must not silently override a privacy exclusion. Keep the current choice of account/model, no API-key fallback, and main-owned feature availability; direct access intentionally has `status.execution: null`.

Project text and imported conversations are untrusted reference content, not instructions to execute. Generated associations must reference actual eligible IDs supplied by the app. Validate titles, limits, depth, cycles, duplicate references, and scope at the shared/main/worker boundaries. Malformed suggestions remain retained readable output with a clear issue, never partial structural writes or repeated automatic repair requests.

### Research and developing weak material

From a selected card/topic/chapter, **Discuss** opens or continues an ordinary retained conversation with the chosen context. The AI can help distinguish an undeveloped argument, unsupported claim, duplication, and irrelevant material. Preserve that distinction rather than collapsing everything into a quality score.

The user can explicitly search the web through the existing research-capable route when available. Search results remain candidates. Reuse the existing Add to Research action, source identity/deduplication, original response provenance, and citation workflow. Saving a candidate from a chapter-scoped discussion can also link it to that chapter through the same disclosed action. A returned URL is not proof that the complete source was read or verified.

Save useful ideas as ordinary notes and unresolved factual questions through the existing questions/claims owners. Editing a note or deciding a claim stays an explicit user action; the chatbot should not revise human notes in the background. If web search is unavailable, show its actual remedy and keep local discussion available where supported.

### Writing assistance and insertion

Capture the current chapter/section, its purpose, chosen linked material, relevant surrounding prose, and the exact insertion or replacement target when the user sends a writing request. Include a compact structural overview to explain the chapter's role, without silently sharing the whole manuscript.

Keep outline organization, source association, and manuscript writing separate operations. A drafting response is protected in its conversation before the user applies it. Its insertion must be a normal editor transaction with schema validation and one Undo boundary, participating in existing local protection and selected-file Save.

If the target document, passage, or captured selection changed, keep the generated text and ask the user to choose a new insertion point. Do not guess a target, overwrite a newer draft, or repeat a provider request just because insertion failed. After restart, a session-only selection bookmark is not valid authority to insert automatically.

Map citations only to retained project sources and exact supported anchors through the existing citation machinery. Never fabricate a bibliography entry, DOI, page, quotation, or source verification state. Unsupported factual assertions remain suggestions requiring research; generated citations must not be treated as verified evidence.

### Persistence, compatibility, and offline behavior

All new content-bearing records are project-scoped and included in `.collie` Save, independent copy, Backup/Restore, retained migration, and relevant portable readers. Update incoming-copy table/remapping lists and exact validators alongside schema changes. Credentials, local paths, live bindings, and UI preferences remain device-local.

Current schema/minimum reader is 44 after PL06. Allocate additive versions from the live baseline when each stage is implemented; do not preassign competing migration numbers here. Preserve earlier readers and retained originals, and let older apps refuse new formats through established compatibility behavior instead of silently losing planning records.

Offline users can collect locally supported material, create/edit notes and chapters, organize, read retained chats and suggestions, and write. AI unavailability disables only dependent requests. Imported content becomes usable only after the existing Accept transaction; canceled/unaccepted imports remain in their current recovery flow. Supported local extraction remains local, with actual unavailable-AI constraints disclosed.

Retain existing access policy. Read-only projects still expose saved planning content and the existing export/backup/recovery routes; planning must not create a new editing-entitlement bypass. Local protection, selected-file Save, and normal close keep their existing distinct meanings.

## 5. Implementation sequence

The six stages below are separate implementation requests. They are ordered for useful, reviewable increments. PL01–PL06 were explicitly requested and are implemented; user acceptance remains pending. Migration, accessibility, recovery, and removal of superseded code belong in each affected stage, not in an unspecified cleanup phase.

| Stage | Result                                                                   | Dependencies                                  | Status                                          |
| ----- | ------------------------------------------------------------------------ | --------------------------------------------- | ----------------------------------------------- |
| PL01  | Shared chapter material associations and a usable chapter material panel | Existing outline/research/conversation owners | Implementation complete — awaiting user testing |
| PL02  | Manual visual Plan workspace, topics, and editorial dispositions         | PL01                                          | Implementation complete — awaiting user testing |
| PL03  | Integrated collection and precise passage cards                          | PL02 and existing Import                      | Implementation complete — awaiting user testing |
| PL04  | Scoped planning chat, corpus coverage, and research/development          | PL03                                          | Implementation complete — awaiting user testing |
| PL05  | Editable outline proposals and atomic reversible application             | PL04                                          | Implementation complete — awaiting user testing |
| PL06  | Chapter-aware drafting and safe insertion into Write                     | PL05                                          | Implementation complete — awaiting user testing |

### PL01 — Connect material to chapters

**Status:** Implementation complete — awaiting user testing. See the [PL01 record](docs/validation/planning-PL01.md) and [manual guide](docs/manual-testing/planning-PL01.md).

**Outcome:** A selected chapter has one place to find its associated notes, sources, excerpts, and chats. The same item can support several chapters.

Implement the unified material read projection and missing chat/excerpt associations; retain existing canonical note/source links. Add **Chapter material** to the writing companion, with Add to chapter, Remove from chapter, and Open original actions using existing content surfaces. Show nested section and parent chapter scope explicitly. Keep the general Research destination available.

Seed valid legacy chat origins into associations without rewriting historical origins. Update current-chapter chat grouping to use explicit associations, preserving archive access and provenance. Route association edits through the existing worker authority and draft/access guards. Cover outline merge/split/archive/restore and history behavior for the new links in this stage.

**Primary paths:** shared notes/sources/conversations/outline contracts; worker notes/sources/conversations/outline and storage owners; `WritingSidePanel.tsx`, `useWritingPreferences.ts`, `ConversationPanel.tsx`, and retained workspace owners. A small chapter-material component/read module is appropriate because Plan will reuse it. Remove replaced chapter-selection plumbing where it becomes redundant.

**Migration:** Missing relation records and any required retained-history extension; complete portable admission, copy, and restoration support in the same change.

**User-owned manual acceptance after implementation:**

1. Launch with `npm run dev` and open a disposable copy of an existing project. Existing chapters, writing, note/source associations, and conversations remain available.
2. Link one note, one source, and one chat to two chapters. Each chapter's material panel shows them; editing the note changes the same original record.
3. Remove one chapter association. The other chapter association and original content remain.
4. Navigate into a nested section, then archive/restore a chapter on the disposable copy. Direct and inherited material remain identifiable, and restored material links return with the same content.
5. Save and reopen the disposable `.collie` file. Associations remain, and historical chat origins are still distinct from current organization.

### PL02 — Build the manual Plan workspace

**Status:** Implementation complete — awaiting user testing. See the [PL02 record](docs/validation/planning-PL02.md) and [manual guide](docs/manual-testing/planning-PL02.md).

**Outcome:** The user can visually organize an existing project before using AI.

Add the retained Plan region and Write/Plan switch. Build the Material rail, automatic chapter grid, optional topic groups, card details, search/filtering, and responsive single-pane alternative. Existing project material appears without reimport or enrollment. New projects show a short empty state with **Import material** and **Add note**, not a tutorial dashboard.

Add Keep/Needs development/Set aside metadata and topic membership. Support multi-selection, sharing across chapters, movement/reordering, and full keyboard alternatives. Reuse existing chapter title/synopsis/order mutations and draft protection. Make chapter from topic creates an actual empty document and transfers references atomically. Add bounded paging/windowing for the material pool and long chapter contents; do not mount every transcript or source file on the board.

**Primary paths:** `src/renderer/src/app/navigation.ts`, workspace views/navigation/session, a scoped `features/planning/` UI, existing outline/research readers, and minimal shared/worker planning metadata. Use Mantine, Tabler, semantic CSS Modules, and existing tokens.

**Migration:** Sparse disposition records, topic groups, and their memberships. Store view preferences locally, meaningful organization in the project.

**User-owned manual acceptance after implementation:**

1. Type an unsaved manuscript paragraph, enter Plan, and return to Write. The paragraph, selection, and ordinary Undo behavior are retained.
2. Arrange material in a topic, convert it to a chapter, rename it, and reorder it. Write shows that chapter and order immediately; the original material still exists once.
3. Mark an item Needs development, assign it to a chapter, then Set aside and restore it. The states and visibility change without deleting the item or its references.
4. Repeat assignment and chapter ordering using only the keyboard, then use a narrow window and 200% zoom. Controls, focus, and the resulting order remain understandable and reachable.
5. Save, close, and reopen a disposable project. Topics, order, and dispositions persist; entering Plan does not contact AI.

### PL03 — Make collection and passage capture direct

**Outcome:** The user can dump material into Plan and pull useful ideas out of long, mixed-topic conversations.

Connect Import and file drop to the existing retained import flow. Drop selects files for that flow; it does not bypass Submit/Accept. After Accept, newly committed content appears in the material pool, with a concise imported-result summary. Do not automatically assign it to the currently selected chapter.

Provide Add note, Paste as note, and Add source through existing content owners. Plain pasted text creates a note; a URL opens source capture through the established path and does not imply the page has been fetched. Accepting a file into the library should not also insert its text into the manuscript.

Add **Keep passage** from native/imported chat selection and **Use excerpt** from source inspection. Preserve exact ranges, revisions, authorship, and origin; a captured idea remains a normal editable note with original context available. Passage capture must work beyond the imported AI-recall window by using the authoritative transcript reader. Do not change the whole-message imported context contract to accommodate it.

Reuse source/note forms and retained drafts rather than mounting competing editors for one record. Returning from a detailed source/chat keeps board selection and scroll.

**Primary paths:** planning UI; `ImportButton.tsx` and existing import result notification; note/source forms; imported/native transcript selection and origins; `conversation-transcript.ts`, source excerpts, and a versioned note-origin extension.

**Migration:** Only missing passage-origin records and exact readers; no second import receipt, content library, or attachment store.

**User-owned manual acceptance after implementation:**

1. Drop supported chat/research files onto Plan. The existing import flow appears; items enter the board only after Accept, and unaccepted content stays resumable.
2. Add a note, paste an idea, and add a source. Each appears as one project record and can be opened through Research.
3. Keep two different passages from the same long chat and assign them to different chapters. Each retains its own exact text and opens the correct original exchange.
4. Use an existing source excerpt in a chapter. Opening it retains its source/version/page context; assigning it does not create a citation or verify the source.
5. Save and open an independent disposable copy. New notes, retained origins, excerpts, and assignments remain available offline.

### PL04 — Give Plan a context-aware conversation

**Outcome:** The user can explore a topic, develop weak ideas, ask about the collection, and request additional research from inside Plan.

Reuse `ConversationProvider` and the existing conversation controller. Present one active conversation UI through the workspace's retained companion arrangement; avoid two independent composers or duplicate transcript side effects for Write and Plan. Add explicit project/topic/chapter/selection scope and ensure Plan conversations do not inherit a hidden editor origin.

Implement the bounded corpus enumeration, chunk summaries, coverage tracking, invalidation, and explicit continuation contract described above. This is required for the whole-collection request, not a later performance enhancement. Reuse existing protected attempts, results, recovery, and selected-account dispatch. Saved summaries remain source-grounded derivatives with navigable origins.

Add contextual Discuss and starter prompts such as “Find themes,” “What needs development?”, and “Suggest an outline.” In this stage outlines are retained discussion output; PL05 adds actionable proposal application. Preserve source references in responses so the user can inspect why an idea was recommended.

Connect explicit web research, Add to Research and chapter association, Save as note, and unresolved questions to existing owners. Avoid automatic searches or automatic fact-verification labels. Refreshing source metadata or switching scopes is not permission to send a request.

**Primary paths:** conversation controller/provider and companion presentation; shared conversation/context/knowledge/memory contracts; worker authoritative readers and retained summary records; main conversations/direct text/research paths and operation admission. Add exact versioned request/result validators alongside any new capture fields.

**Migration:** Retained scope/coverage/summary records where existing contracts cannot represent them; preserve historical attempts and exact older readers. No provider migration, hosted storage, paid-key setup, or new job framework.

**User-owned manual acceptance after implementation:**

1. Connect an eligible own-account ChatGPT route and Discuss a selected topic. The response uses that topic's material; the visible scope can be changed before Send.
2. Ask for themes across a disposable project whose collection exceeds ordinary recall limits, including old and long chats. The run accounts for the collection with visible coverage, or accurately identifies the unfinished/omitted portion; it does not silently consider only recent items.
3. Stop a longer analysis, close/reopen, and explicitly continue. Retained progress remains; opening or Save does not restart requests, and completed work is not repeated unnecessarily.
4. Change a previously analyzed note and ask again. Its old summary is not presented as current; source links identify the actual material used.
5. Explicitly search for evidence for a weak idea, save a result to Research, and associate it with the topic/chapter. The source remains a candidate with provenance until the normal verification/citation actions occur.
6. Disconnect AI. Local organization, notes, source reading, retained conversations, and writing remain usable; unavailable requests show the relevant remedy.

### PL05 — Turn AI suggestions into the actual outline

**Status:** Implementation complete — awaiting user testing. See the [PL05 record](docs/validation/planning-PL05.md) and [manual guide](docs/manual-testing/planning-PL05.md).

**Outcome:** ChatGPT proposes chapters and material assignments that the user can refine and apply without rebuilding the outline manually.

Add the versioned proposal output contract and validate it against the exact input material IDs and current outline. Render proposals as editable chapter cards with purposes, linked material, and specific gaps. Allow discussion to refine a retained proposal without replacing the live outline. Keep any user-edited proposal version intact when a newer AI response arrives.

Use one apply operation for the displayed chapter changes, assignments, and explicitly selected disposition changes. Preserve existing documents/prose and unrelated links; no automatic removal or destructive merge/split. If some source material was unavailable, show that coverage limitation before Use outline. Valid scoped proposals can remain useful with disclosed partial coverage; invalid references cannot be silently accepted.

Implement atomic application, exact retry reconciliation, and scoped Undo including association/disposition before-values. Keep acknowledgment uncertainty and stale-input recovery with the existing transaction/operation owners. Switching to Write simply shows the same committed documents.

**Primary paths:** shared proposal contract, worker outline/document-commit/association owners, protected conversation result settlement, planning proposal UI, existing History and recovery presentation. Extract only the transaction logic actually needed to share manual and proposal behavior.

**Migration:** Portable proposal versions, apply receipts, and bounded inverse data as needed. Update history/read/copy validators and retain earlier formats.

**User-owned manual acceptance after implementation:**

1. Ask for an outline, edit two suggested titles and assignments, and choose Use outline. The displayed chapters, purposes, order, and references appear once in both Plan and Write.
2. Dismiss another proposal or keep discussing. The accepted structure and manuscript do not change.
3. Request a revision in a disposable project that already contains prose. Only the displayed structural/reference changes apply; existing chapter text and unspecified chapters remain.
4. Change a relevant chapter or note after a proposal was produced. Applying it preserves the newer work and reports the actual conflict instead of silently replacing it.
5. Undo an applied outline change, then reopen the saved project. Structure, material assignments, and selected dispositions reflect the reversal without restoring over later manuscript text; unsafe conflicting undo is clearly refused.

### PL06 — Write with the chapter's context

**Status:** Implementation complete — awaiting user testing. See the [PL06 record](docs/validation/planning-PL06.md) and [combined walkthrough](docs/manual-testing/planning-PL06.md).

**Outcome:** Planning flows into actual drafting, with material-aware assistance at the user's writing position.

Use the PL01 chapter-material reader and PL04 context assembly for the writing companion. Add concise help actions for starting, continuing, and connecting passages. Default a new chapter-writing request to its visible chapter scope; keep explicit scope choices visible and avoid silent broadening when navigating elsewhere.

Capture exact source scope and insertion target. Retain generated text in the conversation and show an editable preview with Insert here or Replace selection as appropriate. Apply a validated editor transaction with one Undo boundary, existing draft protection, and no automatic selected-file Save. Retain output on stale-target refusal so the user can choose a new point without rerunning AI.

Preserve supported citation nodes only when their project sources/anchors are valid; otherwise keep references as clearly identified suggestions for the existing citation workflow. Retain current proofreading availability and readers; this feature is not a reactivation of retired authoring or proofreading routes.

Complete the integrated user journey, fixing only issues within these implemented paths. Update the experience/navigation documents and provide one concise combined manual walkthrough. Do not create an additional implementation stage solely for documentation or hypothetical future scaling.

**Primary paths:** writing companion/workspace, conversation context and response presentation, `editor/selection.ts`, `adapter.ts`, manuscript protection, citation commands, and the established AI route/contracts. No second editor, hidden manuscript writer, or background authoring agent.

**Migration:** Add portable proposal/context fields only if required for retained writing output; selection bookmarks and view position remain local and cannot authorize insertion after restart.

**User-owned manual acceptance after implementation:**

1. Launch with `npm run dev`, open a disposable project, and switch from Plan to Write. The accepted chapters appear on the left; selecting one updates its manuscript and chapter-material scope.
2. Put the cursor inside a chapter and ask for a connecting paragraph. The response uses that chapter's purpose and material; prose appears only after Insert here.
3. Undo the insertion. The manuscript returns to its previous text while the AI response remains readable in its conversation.
4. Request another passage, then edit the target before inserting. The app keeps both the new writing and generated response and requires a valid new target instead of guessing.
5. Select prose and request a replacement. Only the explicitly selected passage changes after Replace selection, and Undo restores it.
6. Save, reopen, and open an independent copy. The outline, notes, sources, chats, analysis/proposals, and accepted writing remain project-owned; no operation or insertion restarts automatically. Repeat the basic Plan/Write flow with keyboard navigation, a narrow window, and AI disconnected.

## 6. Stage workflow and completion evidence

Before each implementation, read the current `AGENTS.md`, this stage's dependencies, the live owners, Git state, and available user acceptance records. Prior implementation and format/lint/typecheck success do not imply user acceptance. A reported prerequisite defect blocks or requires fixing the affected path; it does not justify restarting unrelated stages.

After code changes, inspect script/ignore scope and run **`npm run format` → `npm run lint` → `npm run typecheck`**. Fix all reported issues, including warnings and pre-existing issues surfaced by those commands, and finish clean on the final source. Protect vendored/generated artifacts, historical tests, and unrelated local changes. Documentation-only work requires no code checks.

Do not create or run automated tests, harnesses, fixtures, verification scripts, builds, app launches, browser automation, screenshots, benchmarks, or other runtime checks. Launch and interaction steps above belong to the user, on disposable copies where data may change.

For each implemented stage, update its status here, relevant current experience guidance, and `AGENTS.md`'s implementation boundary where applicable. Record changed paths, migrations, decisions, actual code-check outcomes, remaining limitations, and user-supplied results in `docs/validation/planning-PLxx.md`, with its actionable guide in `docs/manual-testing/planning-PLxx.md`. Keep the document concise and stage-specific.

Handoff with **“Stage PLxx complete. As a user:”**, followed by ordered actions and visible outcomes. Separately state **implementation complete — awaiting user testing** and the actual code-check results. Stop for the user's results before proceeding to another stage. Do not label blocked work complete.

The existing provider eligibility, packaged AI, signing, native/runtime acceptance, and release gates remain unresolved. This plan introduces no new account or commercial approval process and makes no claim that code-check success changes those gates.

## 7. Scope limits and decisions to revisit after use

Included: a complete manual collection/organization workflow; optional topics; multi-chapter references; reversible editorial triage; scoped planning conversations and explicit research; honest large-collection coverage; editable/applicable outlines; chapter-aware drafting with reversible insertion; portable persistence and accessible interaction throughout.

Deferred: infinite-canvas coordinates/connectors, collaboration or cloud sync, a separate hosted retrieval service/vector database, automatic permanent deletion, whole-book autonomous writing, multiple alternative live manuscript trees, and AI-driven destructive chapter transformations. None is necessary for the described first version.

The most useful early design feedback is whether the card board gives enough freedom, whether optional topics are useful before chapters, and whether Chapter material provides the right context while writing. Those can be evaluated in PL01–PL03 without waiting for every AI feature. The proposed label and layout can change without changing the shared content and ownership contracts.

## 8. Planning completion record

- Created this root-level implementation plan from the user's requested journey, repository guidance, and source inspection.
- Proposed the Write/Plan interaction, material/topic/chapter model, AI proposal boundary, large-collection context behavior, and six implementation stages.
- The initial planning-only change did not change application source, schema, existing plan status, or working-tree edits.
- The initial documentation-only change required no code checks. No tests, builds, launches, AI requests, or runtime acceptance were performed.
- October 14 PL01: chapter-material associations and the writing companion are implemented, awaiting user testing. SQL/minimum reader 39 adds chat/excerpt links and association history; note/source links remain canonical. Format, lint and both typechecks passed. See the [completion evidence](docs/validation/planning-PL01.md).
- October 14 PL02: retained Plan mode, paged material/structure/detail panes, topics, editorial dispositions, batch assignments, drag/keyboard actions and atomic topic conversion are implemented. SQL/minimum reader 40 adds planning metadata; new history captures it alongside links. Format, lint and node/web typechecks passed; runtime acceptance is pending. See the [PL02 record](docs/validation/planning-PL02.md).
- October 15 PL03: Plan file drops reuse retained Import selection and explicit Submit/Accept; paste/source intents reuse existing editors; native/imported selections become editable passage notes with immutable exact origins; Use excerpt opens the existing excerpt in Plan. SQL/minimum reader 41 adds only passage origins and retains schema-40 readers. Format, lint and node/web typechecks passed; runtime acceptance is pending. See the [PL03 record](docs/validation/planning-PL03.md) and [walkthrough](docs/manual-testing/planning-PL03.md).
- October 15 PL04: one retained chat presentation serves Write/Plan; explicit scopes, bounded corpus analysis, retained coverage and Continue, invalidation and source-range navigation are implemented. Research saves can atomically add the source to the discussion’s chapter/topic. SQL/minimum reader 42 adds analysis snapshots; portable capture v7, reference receipt v2 and local draft v2 preserve older readers. Format, lint and node/web typechecks passed; runtime acceptance is pending. See the [PL04 record](docs/validation/planning-PL04.md) and [walkthrough](docs/manual-testing/planning-PL04.md).
- October 15 PL05: editable, immutable proposal versions, atomic structure/link/disposition application, exact receipt reconciliation and scoped Undo are implemented. SQL/minimum reader 43 adds proposal versions and inverse records; analysis/planning payload v2 and local draft-file v3 retain earlier readers. Existing prose and unspecified chapters remain; one response cannot create its outline twice. Format, lint and node/web typechecks passed; runtime acceptance is pending. See the [PL05 record](docs/validation/planning-PL05.md) and [walkthrough](docs/manual-testing/planning-PL05.md).
- October 15 PL06: chapter-scoped writing starters, bounded nearby-writing context, editable protected previews and explicit editor insertion/replacement are implemented. Exact session targets refuse stale work; one Undo reverses insertion. SQL/minimum reader 44 retains writing-context v3 in existing analyses/captures, with unchanged DDL; local draft-file v4 protects edited previews without portable insertion authority. Format, lint and node/web typechecks passed; runtime acceptance remains pending. See the [PL06 record](docs/validation/planning-PL06.md) and [combined walkthrough](docs/manual-testing/planning-PL06.md). Existing Import, conversation, provider, and release acceptance remains at its recorded status.

## Model and Effort

These are recommendations for the Codex session implementing each stage, separate from Collie's in-app AI model. They are engineering judgments based on the stage contracts and [OpenAI's model-selection guidance](https://developers.openai.com/api/docs/guides/model-selection), not measured performance on this repository. The guidance positions 6 Astra for demanding reasoning and 6.1 Sol for complex work where time and cost also matter.

| Stage | Model   | Effort     | Status                                          |
| ----- | ------- | ---------- | ----------------------------------------------- |
| PL01  | 6 Astra | Extra-High | Implementation complete — awaiting user testing |
| PL02  | 6.1 Sol | High       | Implementation complete — awaiting user testing |
| PL03  | 6.1 Sol | High       | Implementation complete — awaiting user testing |
| PL04  | 6 Astra | Extra-High | Implementation complete — awaiting user testing |
| PL05  | 6 Astra | Extra-High | Implementation complete — awaiting user testing |
| PL06  | 6 Astra | High       | Implementation complete — awaiting user testing |

- **PL01:** Establishes canonical relationships across notes, sources, chats, and chapters, including migration, portability, and merge/split/restore history. Extra-High is justified by the ownership decisions that every later stage depends on.
- **PL02:** Primarily UI and interaction work on PL01's established contracts: board layout, retained navigation, topic groups, drag/keyboard actions, and scoped metadata. Sol with High is a proportionate choice for this bounded implementation.
- **PL03:** Reuses Import and content editors while adding precise passage capture and provenance. High gives room to trace native/imported identity and range handling; the existing owners keep this suitable for Sol.
- **PL04:** The broadest reasoning task: whole-corpus coverage, chunk summaries, invalidation, request budgets, cancellation, recovery, and explicit scope across renderer/main/worker boundaries. Use Astra with Extra-High.
- **PL05:** Atomic structural changes, exact retry reconciliation, stale-input refusal, and scoped Undo must agree across the outline, links, dispositions, and retained history. Use Astra with Extra-High for those interdependent correctness requirements.
- **PL06:** Requires careful reasoning about editor selections, concurrent edits, citation anchors, draft protection, and reversible insertion. Astra is appropriate; High should suffice because the material and context contracts are already established.

I would not use **Medium** as the default for any complete stage here: each spans several state or persistence owners. **Ultra** is unnecessary by default; reserve it for a specific unresolved reasoning problem encountered during implementation. Higher effort does not expand stage scope or replace the required format/lint/typecheck checks and user-owned manual acceptance.
