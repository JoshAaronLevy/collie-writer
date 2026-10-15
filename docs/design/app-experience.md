# Collie Writer experience specification — I01

October 1, 2026. **Specification implementation complete — awaiting user review.** This document specifies future screens; none of the wireframes is a running interface or an observed result. Read it with the [improvement plan](../../app-improvement-plan.md), [architecture decision](../decisions/improvement-01-experience.md), and [provider evidence](../ai/provider-eligibility.md). I02–I15 own the application changes.

**Current UI01–UI06 guidance, October 5:** the [UI plan](../../ui-improvements-plan.md) and [combined walkthrough](../manual-testing/ui-improvements-UI06.md) supersede the original I05/I11 setup and account presentation below. Creation has two steps; an app-wide ChatGPT dialog owns connection setup. Implementation awaits user testing; original dated evidence remains historical. The changed screen/journey descriptions below reflect that implementation.

## Product baseline

The opening experience should communicate care through typography, space, and a clear next action. Writing gets the largest, quietest surface. Research remains deep but appears in focused views. Each screen has one primary task; routine success stays quiet, while failures that threaten work remain visible.

| Settled choice                                  | Design consequence                                                                                                                                                                                                                           |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nonfiction edition; fiction is separate         | Five primary categories and two secondary choices below; no novel/story option.                                                                                                                                                              |
| Mantine and semantic scoped CSS                 | Use one themed component system. Classes describe product roles; feature styles live with their owner.                                                                                                                                       |
| Warm editorial identity                         | Warm neutral surround, paper surfaces, graphite text, deep green accents, system sans controls, bundled Source Serif prose.                                                                                                                  |
| Light, dark, system; accessibility retained     | Each surface/state has theme tokens; high contrast, 100–200% interface zoom, reduced motion, and keyboard paths remain available.                                                                                                            |
| Title and byline required; description optional | No account identity becomes the author. Remember the author only through an unchecked opt-in preference.                                                                                                                                     |
| Short empty starter outlines                    | No instructional/example prose inside a personal manuscript. Existing projects retain their outlines.                                                                                                                                        |
| Local writing works without accounts            | Startup connection prompting is dismissible; local project creation never waits for sign-in. No shared AI account, API-key form, or paid-token fallback.                                                                                     |
| Conversations and proofreading                  | Conversations are optional beside writing. Proofreading produces reviewable, reversible suggestions after an explicitly selected scope.                                                                                                      |
| Portable ownership                              | Writing, research, conversations, and proposals travel with projects when implemented; credentials, live sessions, and view preferences do not.                                                                                              |
| Free/paid access                                | One free editable project, designated as part of confirmed creation; paid unrestricted editing. Reading/export/backup/recovery remain available across projects. Eligible AI follows editable scope without an additional Collie AI paywall. |
| Tutorial and help                               | Optional separate synthetic nonfiction sample; dismissible three-point orientation; no blocking tour.                                                                                                                                        |
| Permanent ad-free product                       | No promotions, upsell cards, sponsor slots, analytics, or remote decorative assets. Factual access controls belong in Settings.                                                                                                              |

## Navigation and visual hierarchy

Application destinations are **Setup**, **Projects**, **Workspace**, **Settings**, and **Help**. Workspace has **Write** and **Research**. Research has **Sources**, **Notes**, and **Questions & claims**. Search, Export, Project details, and History are focused destinations with a remembered return target. Their presentation can be a view or dialog as specified below; they do not create another project session.

The workspace secondary panel has exactly one mode: Closed, Chapter material, or AI. Expanding AI temporarily gives the conversation the primary reading area and supplies Return to writing. Keep the current editor/draft alive. Changing panels never creates a second note/source draft or silently broadens AI context.

Global Projects, Settings, and Help remain reachable. The workspace header adds project title/menu, save status, Search, Save, and Export. At narrow widths, secondary commands move to a labeled Project menu; urgent status never moves out of sight. Native app menus continue to call the same session actions.

## Responsive and visual specifications

Dimensions below are starting implementation values, not measured accessibility claims. Use available CSS viewport width after interface zoom, not physical screen pixels. Allow content to reflow when labels, system fonts, or user preferences need more room.

| Surface              | Wide arrangement                                                                                                  | Narrow arrangement                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Setup                | Centered content up to 960px; cards in three columns when each can remain about 260px wide; last two left aligned | Two columns when they fit, then one; details form one column at every size                                  |
| Details / connection | Form/content measure up to 560px                                                                                  | Full available width with 16px gutters; actions wrap without clipping                                       |
| Projects             | Readable list up to 1120px; title/type/date/status columns                                                        | Stacked rows; title and availability first, metadata below                                                  |
| Write                | Around 1200px and above: outline about 240px, editor at least 480px, optional panel about 320px                   | Below about 1200px: secondary panel becomes a drawer/view; below about 900px: outline also becomes a drawer |
| Research             | List about 280px plus detail; source reading gets remaining space                                                 | One list or detail at a time with explicit Back; inspector can take the full content region                 |
| Export / Settings    | Section navigation plus a constrained content column                                                              | Section selector/back navigation and one content column                                                     |

Keep the existing 420×400 native minimum; do not raise it to hide layout problems. At very small effective widths or 200% zoom, labels wrap, all content scrolls vertically, and actions remain reachable. Do not impose a minimum editor width that forces page-wide horizontal scrolling. Tables/PDFs may have their own labeled scroll region. Sticky headers/footers must not cover focused controls or consume most of a short window.

Proposed token roles for I02:

| Role                    | Light                           | Dark                                  | High-contrast treatment                                                        |
| ----------------------- | ------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------ |
| App surround            | `#F5F4F0`                       | `#171D1A`                             | White/near-black according to effective theme                                  |
| Paper / primary surface | `#FFFFFF`                       | `#202925`                             | Clear surface boundaries without opacity                                       |
| Primary text            | `#252D2B`                       | `#EEF3EF`                             | Black/white; no low-opacity text                                               |
| Secondary text          | `#5D6964`                       | `#BBC8C0`                             | Bring closer to primary text                                                   |
| Primary action          | `#2F6757` with white label      | `#A7D7BD` with dark label             | Explicit strong border and contrasting label                                   |
| Selected surface        | `#E8F0EA`                       | `#2C4438`                             | Check/selected label and border, independent of fill                           |
| Separator               | `#D8DFD9`                       | `#4A5A51`                             | Stronger visible boundary                                                      |
| Error                   | `#A63131`                       | `#FFB6AF`                             | Error icon, message, and action; never color alone                             |
| Warning                 | `#77551A`                       | `#EBCB85`                             | Warning label and persistent message                                           |
| Focus                   | Accent ring with visible offset | Light accent ring with visible offset | Respect forced colors; never remove native focus without a visible replacement |

Use a 4/8/12/16/24/32/48px spacing scale, about 8px control radii and 12px card radii. Start controls/body copy near 16px, supporting text near 14px, prose near 19px with 1.6 line height and a 65–75 character measure. Keep controls comfortably targetable, aiming for 40px height and more generous primary actions. Avoid all-uppercase paragraphs, oversized welcome illustrations, continuous gradients, and a box around every subsection. Shadows identify overlays, not every panel. Transitions should be short and optional; reduced motion removes nonessential movement.

Colors and dimensions remain subject to user-observed contrast, readability, keyboard, and zoom outcomes. No contrast calculation, visual inspection, or runtime acceptance occurred in I01.

## Shared interaction and state rules

- A skip link targets the active main heading/content. On destination change, focus its heading, not the first arbitrary button. On returning, restore the prior control/valid editor selection where possible; otherwise focus the nearest meaningful heading.
- A dialog has a title, description when needed, one sensible initial focus, keyboard containment, and focus return. Escape closes the topmost dismissible overlay. It never silently discards a dirty form or cancels a durable operation. A blocked transition offers Return to draft; explicit discard is separate and labeled.
- Card selection uses a labeled radio group with one value. Tab enters/leaves the group; arrows change selection; Space selects. Pointer selection and keyboard selection never advance the step. Continue is disabled until a choice exists, with a visible explanation.
- Labels remain visible; placeholders do not replace them. Field errors appear beside fields and are announced. Submission with invalid fields focuses the first invalid field. Do not announce every keystroke, word-count change, or streamed token.
- Skeletons/loading labels reserve useful space without fake project content. Empty states have a short sentence and a relevant action. Pending actions keep readable labels and disable duplicate submission only, not unrelated reading/navigation.
- Read-only surfaces remain readable, selectable, searchable, and exportable. Explain why writing is unavailable and offer the applicable free-designation action; never cover content with a purchase wall.
- Serious local/save/conflict/access errors use a persistent session banner plus the affected surface. Routine success uses quiet status. Toast dismissal is never the only path to recover an operation.
- Keep required citeproc initial-session attribution in an uncollapsed, ordinary-body-text region on the initial destination of every window. It contains the existing attribution text and a Help → Third-party licenses entry. Retain equivalent prominence to [D4](../decisions/D4-citations-and-licenses.md); do not reduce it to a logo tooltip or hidden About link. In short windows it participates in layout/scrolling without covering controls.

## Project categories and initial content

All descriptions below are production copy specifications, not generated research fixtures. I04 owns the persistent mapping; I05 presents it.

| Placement            | Card / stable kind                            | Card description                                                    | New template / empty text sections                               |
| -------------------- | --------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Primary              | Nonfiction book / `nonfiction-book`           | Develop a substantial idea across chapters.                         | `book`: Introduction; Chapter 1                                  |
| Primary              | Academic essay / `academic-essay`             | Make a focused argument supported by sources.                       | `essay`: Introduction; Argument; Conclusion                      |
| Primary              | Article / `article`                           | Write a focused piece for readers or publication.                   | `article`: Draft                                                 |
| Primary              | Report / `report`                             | Present findings and practical recommendations.                     | `report`: Summary; Findings; Recommendations                     |
| Primary              | Study critique / `study-critique`             | Build a research-supported argument against a study or publication. | `critique`: Study overview; Argument; Supporting research        |
| More starting points | Research paper / `research-paper`             | Present research through methods, results, and discussion.          | `research`: Abstract; Introduction; Methods; Results; Discussion |
| More starting points | Blank nonfiction project / `blank-nonfiction` | Start with an empty draft and shape your own outline.               | `blank`: Draft                                                   |

Use small bundled Tabler icons decoratively with visible titles (RF14 consolidates the earlier icon families). The optional choices use the same selection semantics, without overwhelming the five primary cards. Expanding More starting points retains selection and focus. A selected secondary option stays visible when returning to this step.

Study critique's eventual central material may be a local PDF or a publication/research link. **This increment adds no special upload/link wizard, central-study field, automatic fetching, argument analysis, or refutation action.** Its later workspace may suggest “Add the publication in Research → Sources,” using existing manual source tools. Entering a URL records a link; attaching a PDF uses existing managed-original behavior. Other nonfiction capabilities remain the same.

Legacy template IDs map as recorded in I04. New outlines are empty text sections, even when a section is called Chapter 1; that label does not make it an outline chapter container. I13 must offer current-section proofreading when no chapter container exists. Changing a project's category never rebuilds an existing outline or forces citation style. Generate references from citations; preserve any legacy/manual References sections.

## Annotated screen specifications

`[Action]` is a button, `( )` is a selection, and `[field]` is an input. Wide/narrow drawings show hierarchy, not exact screenshots. Shared state/focus rules above apply to each screen. S01–S03 reflect UI01–UI06. Provider eligibility and each tool’s availability remain separate from the shared connection state.

### S01 — First run / choose a project type

```text
WIDE
Collie Writer                                      Settings  Help
                 What are you working on?
                 Choose a starting point for your writing.
  ( ) Nonfiction book    ( ) Academic essay    ( ) Article
      short description     short description     short description
  ( ) Report             ( ) Study critique
      short description     short description
  [More starting points ▾]
  Open existing project   Explore an example           [Continue]
  Readable citation attribution / Third-party licenses

NARROW
Collie Writer                         [App menu]
What are you working on?
( ) Nonfiction book — description
( ) Academic essay — description
( ) Article — description
( ) Report — description
( ) Study critique — description
[More starting points ▾]
Open existing project / Explore an example
[Continue]
Readable citation attribution
```

Primary action: Continue. Step indicator: “1 of 3 · Project type.” Focus after the heading follows the category group, More starting points, secondary choices if expanded, Open existing, Explore example, then Continue; responsive CSS preserves this DOM order even when the button is visually aligned right. No category is preselected on a new wizard. A returning draft restores its selection.

Empty/default: seven known choices need no network. Loading: storage starts without replacing the cards; creation-dependent actions wait if needed. Error: a safe working-folder interruption uses S09; a cancelled Open picker returns here. Read-only access does not prevent entering setup or creating another local project; creation confirms editing access through the trusted access service. Cancelling New project returns to its origin; first-run users may remain here or open an existing file.

### S02 — Project details

```text
WIDE
[Back]  2 of 2 · Project details
                 Give your project a name
                 Academic essay · [Change type]
                 Title (required)       [                    ]
                 Author / byline (required) [                ]
                 [ ] Remember this author on this computer
                 Description (optional) [                    ]
                                        [ multiline          ]
                 Kept with your project; not sent to AI automatically.
                 [Cancel]                      [Create project]

NARROW
[Back] Project details
Academic essay · Change type
Title (required)
[                                     ]
Author / byline (required)
[                                     ]
[ ] Remember this author
Description (optional)
[                                     ]
[                                     ]
[Cancel]
[Create project]
```

Primary action: Create project, or Create and write here when switching the free writing project. In the latter case, explain before confirmation that other projects remain readable/exportable. Focus order: Back/change type, Title, Byline, remember checkbox, Description, Cancel, Create. Initial focus is the heading; a failed submission focuses the first invalid input. Enter submits from single-line fields; Enter inserts a newline in Description. Back retains values.

New title/byline: trim, require 1–500 UTF-16 code units consistently with current JavaScript text validators. Description: optional up to 10,000 code units, preserving Unicode and line breaks; reject forbidden controls per I04. Explain limits near an invalid field and never truncate legacy values. Pen names and collective bylines are ordinary text. Remember-author preference starts off, is device-local, and is independently editable in Settings; it never reads purchase/provider identity.

Loading: “Creating project…” freezes the dispatched payload and exact operation identity. Error/unknown outcome: retain fields and reconcile/retry that operation before allowing changed input. Empty required fields never dispatch. After a durable receipt, confirm editing access and open writing directly. Failed access/opening retains that project for recovery; it never starts another identity. Leaving after creation retains the project. Storage failure keeps the draft and offers the applicable recovery action. Existing projects may retain an empty legacy author without being sent through setup.

### S03 — Shared ChatGPT dialog (outside project creation)

The global header shows **ChatGPT** and one red/yellow/green dot with an accessible status explanation. Red means disconnected or a hard connection error, yellow means checking/setup/attention, green means configured connection readiness for reviewed conversation requests. Feature availability, project edit rights, capacity, and request outcomes remain separate.

On launch, restore the normal project/library/setup destination independently of account preparation. Main schedules the saved account's bounded metadata preparation once per app launch. Healthy users receive no prompt. Otherwise, offer one dismissible dialog at a safe point, unless **Don't show this automatically again** is checked. The checkbox saves immediately and is reversible from the manually opened dialog; a failed write explains that only the current launch is covered. Main-owned markers survive renderer recovery. Defer behind recovery, other dialogs, close/navigation, IME and background focus.

RF11 shows account controls and the actual model picker directly, with ordinary dismissal and contextual recovery actions. Change account contains saved-account choices; actual failures alone expose support details. The registration/runtime/workspace dashboard is removed. Model discovery and restoration are automatic on successful connection/selection/renewal and returning startup; unavailable remembered choices require an explicit replacement. No setup action sends writing or probes inference. Build blockers and own-account usage/spending policy stay explicit. A completed request is not required for a green connection and green does not guarantee all feature requests will succeed.

Header, Settings → ChatGPT, tutorial, and each tool's Manage ChatGPT action open this same dialog over the current destination. Write → AI instead toggles the retained companion; Conversations and Proofreading remain distinct tools with their own reviewed-request controls and availability. RF11 removes the capacity disclosure. AI work offers View response, Open import, named affected-project links and contextual Finish saving response. Dismiss notice explicitly acknowledges the retained outcome while keeping history. Eligible protected results use the existing local receipt/handoff owner; Import also reconciles analysis when a project opens. None of these actions sends a new request or Accepts import content.

Dismissal never cancels sign-in, disconnects, changes editing rights, navigates, or discards writing. During browser sign-in the notice offers Manage ChatGPT and a separate Cancel sign-in. Focus returns to a visible opener or current destination heading/region; late callbacks and retained navigation do not pull focus from writing or another modal. Disconnect still requires its own confirmation. The direct route remains owner/unpackaged; no provider or commercial restriction is relaxed.

### S04 — Returning Projects library

```text
WIDE
Collie Writer                             Settings  Help
Projects                        [Open project…] [New project]
Recent / All active / Archived              [Filter projects]
Title                 Type             Last edited     State / actions
Project title         Academic essay   Today           Protected locally  [⋯]
Another title         Report           Yesterday       File needs attention [⋯]
Recovery needs attention → [Review recovery]     (only when applicable)

NARROW
Projects                             [New project]
[Open project…] [Recent / All active / Archived ▾]
[Filter projects]
Project title                             [⋯]
Academic essay · Today · Protected locally
Another title                             [⋯]
Report · Yesterday · File needs attention
```

Normal returning launch skips this screen when the last trusted project can safely reopen. It opens the last active text section; a missing/inactive section falls back to a valid one. Never silently open an archived project on launch; show the library with its archived location available. No safe last project means library. No projects on a new installation means S01.

Primary action: resume a chosen row; New project is the main creation action. Rows have a distinct labeled actions button, not nested buttons. Focus: heading/actions → view filter → text filter → project links/actions → recovery. Readable dates and type replace UUIDs. Empty view offers New/Open or Clear filters, according to the cause. Loading preserves list structure. Missing/locked/corrupt items retain a visible issue and recovery entry, not automatic deletion. A selected-file catalog entry is never proof that its file is reachable. Read-only projects still open, export, and back up; editing uses explicit designation. Archive is local organization, not deletion.

### S05 — Write / returning workspace

```text
WIDE
Projects / Project title [Project ▾]     Save status [▾]   Search Save Export
Write  Research                                [Chapter material] [AI]
Outline                 Section title                         Optional panel
Introduction            Style ▾  B I  Lists  Insert ▾  More ▾   Notes OR Source
Chapter 1               ┌────────────────────────────┐         OR conversation
[Outline actions]       │                            │         [Expand] [Close]
                        │      Your manuscript       │
                        │                            │
                        └────────────────────────────┘
Word count · Section status                         Operation status if active

NARROW
Projects / Project title                     [Project ▾]
Save status [Details]                         [Save]
Write  Research           [Outline] [Companion ▾]
Section title
Style ▾  B I  [Insert] [More]
Your manuscript
Word count · Section status
(Outline/companion opens one drawer or alternate view with Close/Back.)
```

Primary task: write in the selected manuscript; Save is the explicit project-file action. Focus order: global/project controls → Write/Research → panel controls → outline if visible → toolbar → editor → panel if visible → contextual status. Provide named jumps to manuscript/outline/companion without trapping Tab in prose. Focus mode hides secondary chrome and exposes Exit focus mode plus urgent errors.

Empty section shows a quiet prompt outside persisted content, e.g. “Start your introduction.” No active text section offers Add section when editable, or a read-only explanation. Loading retains previous visible draft until a guarded section transition succeeds. Read-only shows a compact reason and “Use this project for free editing” when applicable; restore removed outline ancestors before editing a trashed section. Source/notes/AI panels preserve the editor instance and undo/composition state. Error/conflict retains the visible draft and a separate stored version; there is no automatic merge or overwrite.

Common toolbar: block style, bold/italic, lists, Insert, More. More includes remaining supported formatting and Find/replace; Insert includes references, footnotes, managed images, tables, links, and supported breaks. Image/table controls appear contextually. Section status/synopsis move to Section details. History and outline restore remain reachable. Selection-dependent dialogs capture a valid target before stealing focus and recheck it on apply.

AI is closed by default. The retained companion shows provider/account, context summary with inspectable exact content and prior messages, messages, a composer, Send, and Stop during generation. Chat input never implies an edit. Expanded chat provides Return to writing. Proofreading separately previews section/chapter scope and offers before/after proposals with Accept, Reject, explicit grouped Apply, and stale-target explanations. Reading stored conversations/proposals needs no provider session; no hidden reasoning is shown.

### PL01 — Chapter material (October 14, 2026)

Write → Chapter material replaces the separate Notes/Source companions. It shows the selected outline item’s linked notes, sources, excerpts and chats, followed by inherited parent material, deduplicated by original identity. Labels identify direct use, inherited parent titles and historical chat origin. Add material offers title search, type filtering and pages of 20 items; Add/Remove applies only to the selected chapter, section or part. Select a parent to remove its inherited link. Open original uses retained Research/chat navigation. Questions, claims, annotations and detailed source usage remain in Research; linked material does not imply a citation or an AI context selection.

The panel retains an uncertain link change through the workspace draft owner; Check change reads its outcome without sending another mutation. Read-only access retains inspection. Old device-local Notes/Source panel preferences open Chapter material and preserve pane widths/focus. Existing manuscript, conversation and Research drafts keep their owners. PL01 is implemented, awaiting the [user walkthrough](../manual-testing/planning-PL01.md); the Plan board and chapter-aware AI are later stages.

### S06 — Research

```text
WIDE
Projects / Project title               Save status    Search Save Export
Write  Research
Sources  Notes  Questions & claims
[Add source ▾] [Filter]    Selected source title              [Back to writing]
Source list               Essential metadata  [More details]
Selected source           [Inspect original] [Attach original]
Another source            Source versions / excerpts / annotations
                          Contextual Save or inspection action

NARROW — LIST                     NARROW — DETAIL
Research                         [Back to sources]
[Sources / Notes / Claims ▾]     Source title
[Add source ▾] [Filter]          Essential metadata
Selected source →                [More details]
Another source →                 [Inspect original]
                                 [Save source]
```

Primary action depends on selection: Add source/Note/Question in an empty list; Save edits for a form; Create excerpt for an inspected passage. Focus follows subsection tabs, list/filter/actions, then selected detail. At narrow widths selecting a row focuses the detail heading; Back restores the original row and list position. Source inspection has a clear return target and selected source/version/page labels.

No sources: “Add a source to keep its details and original together.” Study critique may suggest adding the publication here, without a specialized intake. Import remains supported bibliography files with preview/report; attachments remain supported local originals. No implied DOI lookup, URL fetch, OCR, arbitrary DOCX ingestion, or automatic AI analysis. A missing/orphaned target is labeled and cannot silently navigate to another source/version.

Loading/error: retain the draft and report position; show extraction/attachment progress locally and in the session operation summary. Notes/sources may flush through existing contracts. Question/claim/decision/transcription drafts retain explicit Save or Clear controls and block a transition that would lose them. Read-only permits inspection/extraction/search, while changing active source versions, saving excerpts, and editing content require rights. The writing-side inspector and Research use the same content/draft owner.

Search opens from the workspace header. Results identify manuscript sections, notes, sources, questions/claims, and prepared original text. RF13 updates the local projection through the existing owner on entry and saved changes. Preserve query/filter/page/scroll state and origin; Open uses the exact target through the same draft guard. Incomplete results explicitly remain inconclusive; complete no-match results suggest revising the phrase/filters and disclose unsearchable originals. Stop is contextual and stays stopped until Continue. Rebuild is offered only for an actual index problem. Metadata-only bibliography records are not unread originals; stale results retain their locator and explain missing/changed content.

History opens its dated version list directly. RF13 compares earlier/current words with synopsis, placement and a short formatting summary, disclosing visual/reference differences a text preview cannot fully show. Restore this version replaces the whole manuscript/outline and, for versions created since PL01, its saved material links; current writing and links are retained first through the existing exact operation/checkpoint owner. Named versions, eligible dated automatic-version deletion and contextual passage-target repair remain; routine block/index accounting and the extra restore-confirmation branch are removed. Native/content/accessibility acceptance remains pending under the [RF13 guide](../manual-testing/refactor-RF13.md). RF12 Import separation is intentionally deferred until after the remaining refactor and further Import testing.

### Current AI conversation presentation — R3-01/R3-02/R3-03

A chat title opens the newest messages directly. Older paging stays in the same timeline, with complete imported text loaded automatically and stable reading anchors. User bubbles align right and assistant bubbles left, with distinct theme surfaces and accessible authorship. An unlabeled friendly timestamp uses the user's locale; date-only and unknown-zone originals keep their recorded precision. Invalid or absent dates are omitted.

Imported messages, native prompts and assistant replies share the bundled CommonMark/GFM renderer. Headings, nested lists/emphasis, quotes, code, links and tables render inside the pane; wide code and tables scroll locally. Raw HTML does not execute. Exact parser-token positions preserve original answer text for Save reference; generated citations, footnote controls and image placeholders are not quotes. A selection whose mapping cannot be established is not offered as a saved reference. R3-03 displays supported images automatically and direct audio/video with native controls and no autoplay. Retained embedded bytes or exact filenames selected alongside the same accepted export work offline; public HTTPS media uses temporary scoped local display. Missing/unsupported media has a short fallback. PDF and hosted-player links stay ordinary links; no webpage embeds are added.

Only confirmed active Research links expose the small Research icon. Sources opens from that icon or the message context menu; unsaved web references offer Add to Research there, and saved sources offer Open source and Cite. Possible matches and removed sources remain clearly labeled inside the disclosure. Routine messages have no permanent Copy/options row. Right-click, the context-menu key or Shift+F10 opens Copy and, for native turns, prompt reuse and sent context. Save reference appears only for an eligible text selection. Stop and genuine failure/recovery actions remain visible when applicable.

Search the web is checked initially; an explicit per-chat off choice survives switching chats during the project session. Only Send dispatches AI. Archived conversations remain in Chat options. Earlier chat-search/preview and off-by-default descriptions are historical. R3 implementation and required code checks do not establish runtime acceptance; use the [R3-02](../manual-testing/uat-R3-02.md) and [R3-03 manual guides](../manual-testing/uat-R3-03.md).

### S07 — Export

```text
WIDE
[Back to writing] Export project
1 Selection & options   2 Review   3 Destination   4 Result
Sections in order        Format [DOCX ▾]      [Advanced options]+[x] Introduction         Paper [Letter ▾]     [Saved recipes]+[x] Argument             [ ] Include title page
                         Author in properties; private description excluded
                                                    [Review export]

NARROW
[Back] Export
Step 1 · Selection & options
[Sections in order]
[Format] [Paper size]
[ ] Include title page
[Advanced options]
[Review export]
(Later: review issues → native destination picker → per-file result.)
```

Primary action progresses from Review export to Choose destination/Export, then Return to writing. Focus order follows the step, section selection, essential options, advanced controls, then primary action. A preflight error focuses its summary with links to exact sources/sections. A native dialog returns focus to its trigger; cancelling preserves the configured selection.

Empty selection blocks review with a clear reason. Missing references block export; incomplete metadata requires the existing captured-revision acknowledgment or correction. Changing relevant options, head, or selection invalidates earlier review. Loading shows a frozen capture and job progress while writing can continue where already supported. Results list each produced, skipped, failed, or cancelled output; cancellation does not promise zero output. Existing destinations retain their current collision policy and safeguards. An export is not Save or Backup and never acknowledges the selected `.collie` destination.

Read-only/free mode retains standard single-format exports and use of existing recipes one format at a time; paid rights govern recipe mutation and multi-format batches. Explain unavailable convenience actions factually without an upsell panel. Title-page choice is separate from author document properties; text/Markdown do not suddenly gain prepended metadata. Description stays private unless explicitly selected for an applicable output.

### S08 — Settings and Help

```text
WIDE
[Return to project] Settings
Appearance & accessibility     Theme [System ▾]
ChatGPT                        Interface zoom [100% ▾]
Collie access                  [ ] High contrast
Data & recovery                [ ] Reduce motion
Updates                        New-project author preference [Manage]
About, licenses & support      Preferences stay on this computer.

NARROW
[Return to project] Settings
[Appearance & accessibility ▾]
Theme [System ▾]
Interface zoom [100% ▾]
[ ] High contrast   [ ] Reduce motion
[Manage remembered author]
```

Primary action: the selected setting's explicit action; appearance applies immediately and has no misleading global Save button. Focus: return control → settings navigation → page heading → controls/status. Preferences apply from the persistent root before Settings mounts. Malformed preferences fall back safely without blocking project access.

ChatGPT shows a short account summary and Manage ChatGPT; stored transcript access remains in Workspace. Collie access is separately labeled with free designation/purchase restore facts. Data & recovery exposes paths through trusted reveal commands, retained candidates, backup/restore, reset recovery, and the narrowly defined Clear picker history. Updates are explicit and preserve flush-before-restart. Support previews remain content-free with no automatic upload. About includes runtime versions, notices, and readable bundled source access. Loading/errors are local to the requested action; an unavailable service does not replace Settings or revoke offline access.

Help is a parallel simple list: Getting started, Explore an example, Data and saving, Keyboard help, Third-party licenses, About/support. On narrow windows each article has Back to Help. The optional orientation has three points—Write, keep sources in Research, Save a project file—and a Dismiss action stored locally. Resetting the synthetic sample creates a new trusted sample and keeps the old one; it does not reset personal work. Read-only project access never hides Help, preferences, export/recovery guidance, or licenses.

### S09 — Storage/recovery interruption and save details

```text
WIDE
Project title                         Save needs attention [Details]
Persistent issue: The project file changed outside Collie Writer.
[Inspect changed file] [Save As…] [Return to writing]
Details: local changes protected / selected file not updated / cloud unknown

NARROW / WORKING FOLDER REQUIRED
Choose a local working folder
Collie needs a safe place on this device to protect drafts.
[Choose local folder…]
[Why a local folder?] [Return to setup]
Your setup entries are retained.
```

Primary action is issue-specific, not always Retry. Focus the interruption heading/summary once, then the applicable action. Preserve draft input and origin. Storage unavailable mid-edit keeps the window/draft visible and provides Select all for copying; do not advise quitting before preserving unprotected text. A failed migration retains originals and reports recovery options. Missing selected files offer Locate/Retry/Save As as applicable while locally protected work remains readable. Recovering a retained artifact opens an independent project. Unknown/interrupted material is retained, not cleaned automatically.

| Local state                 | Selected-file state                     | Compact message / detail                                                                   |
| --------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------ |
| Visible edits not committed | Any                                     | Protecting changes…; if protection fails, Changes need protection with Retry/copy guidance |
| Protected                   | No destination                          | Protected on this device · Save project file                                               |
| Protected                   | Older than local head                   | Protected on this device · Project file needs Save                                         |
| Protected                   | Saving                                  | Saving project file…; show cancellable operation where supported                           |
| Protected                   | Matching acknowledged head              | Project file saved; details also show local protection                                     |
| Protected or dirty          | External change/unavailable/interrupted | Save needs attention; local state remains separately visible                               |
| Any                         | Customer cloud folder                   | No assertion about completed cloud upload                                                  |

## Complete journeys and retention decisions

| Journey                  | Sequence and observable design outcome                                                                                                                                                                                                | Owning stages     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| First run                | Safe storage initializes → S01/S02 creation and confirmed access → writing in S05. S03 is independent, once-per-launch account prompting. First Save chooses a file natively.                                                         | I02–I05, I07, I11 |
| Returning                | Restore preferences → resolve last trusted nonarchived workspace/section → S05; otherwise S04 with actionable unavailable/recovery state. No repeated tour/login.                                                                     | I03, I06, I09     |
| New project during work  | Guard active drafts/jobs → S01/S02 → reconcile one creation → confirmed editing access → new workspace. Cancelling before dispatch discards only setup; after dispatch reconcile first and retain any created project.                | I03–I05           |
| Free project switch      | Protect current edits → explicitly designate chosen project through existing main policy → open/edit. Create/Open never silently change designation. If no designation exists, offer Use this project for free editing before typing. | I03, I05–I07      |
| Offline / AI unavailable | Local setup/write/research/save/export continue. The connection dialog explains offline/unavailable and can be dismissed or suppressed. Existing chats remain readable when delivered. No background inference retry.                 | I05, I09–I12      |
| Access loss mid-draft    | Freeze new edits → preserve eligible in-flight buffers → offer protection/return to same project's free designation → retain visible unresolved drafts. Reading/export/backup/recovery remain.                                        | I03, I07–I09      |
| Source-backed writing    | S05 → S06 add source/inspect original/excerpt/link evidence → return to the exact manuscript position; opening a companion panel shares the same source/note draft.                                                                   | I07–I08           |
| Recovery                 | Persistent issue → inspect current/retained material → independent recovery copy or Save As → retain original/candidates until an explicit supported action says otherwise.                                                           | I06, I09          |
| Conversation             | Choose provider and exact context including history → send deliberate request → readable partial/complete local message → optional Save as note. No manuscript mutation.                                                              | I10–I12           |
| Proofreading             | Capture selected passage or explicit chapter/section → review grammar proposals → explicit revision-checked Apply/Reject → reversible history. Editing the target can make suggestions stale.                                         | I13               |

## Acceptance boundary

I01's manual review is a review of these specifications, not an instruction to try nonexistent screens. Future stage guides must include only their implemented UI. Josh's assessment of calmness, visual quality, and discoverability is still pending, as are native behavior, accessibility, content preservation, output fidelity, and AI quality. The [existing release NO-GO](../validation/release-candidate.md) remains unchanged. See the [I01 manual review guide](../manual-testing/improvement-I01.md).

### RF14 notices, support and panel recovery — October 12, 2026

Ordinary local protection and success are quiet; current Save status and actual errors remain. Dedicated AI notices cover their retained requests, scoped task screens cover their own progress, and independent drafts/corrections remain actionable. Complete exports stay in Export; interrupted/limited results have a named project notice and deliberate session-only dismissal after settlement. Notice dismissal keeps the result/files. Request-event errors remain in their original owner rather than a second sticky field.

About → Review support preview opens a fresh bounded local summary directly. Copy/share remains the user's choice. The dialog has a scrolling body and reachable Close/Refresh/Retry actions; runtime details come from this preview. Panel failure uses Try again and secondary guarded Restart, without claiming form text was saved. Only tool/dialog boundaries with the editor outside their failed subtree claim text remains. Tabler is the single live icon family; labels, keyboard focus, reduced motion, contrast and native branding remain. See the [RF14 guide](../manual-testing/refactor-RF14.md); native/content/visual/accessibility acceptance is pending and RF12 remains deferred.

### RF15 setup and access — October 12, 2026

Normal creation stays type → details → writing. A folder-required condition opens the native picker directly in retained setup, including pending requests/created receipts; cancel/refusal preserves entries and moves no work. Editing-access remedies cover unfinished setup, with Return to project setup in access settings. Creation requests, receipts, open-before-section acquisition, authoritative free switching and completion cleanup retain their existing owners. No new purchase/account step is added.

Collie access leads with edition, editing rights and the free writing project. Only a project needing designation shows Write in this project. Edition details retains offline/capability facts and configured signed access-file restore. Unconfigured purchase/restore has one availability sentence; configured browser/renewal/management/disconnect actions stay contextual and guarded. Status reads can retry locally; browser expiry disables stale continuation. Free/offline rights and reading/export/backup/recovery remain; no commerce configuration or persisted format changes. See the [RF15 guide](../manual-testing/refactor-RF15.md); runtime acceptance remains pending and RF12 stays deferred.
