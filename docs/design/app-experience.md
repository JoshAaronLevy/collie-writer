# Collie Writer experience specification — I01

October 1, 2026. **Specification implementation complete — awaiting user review.** This document specifies future screens; none of the wireframes is a running interface or an observed result. Read it with the [improvement plan](../../app-improvement-plan.md), [architecture decision](../decisions/improvement-01-experience.md), and [provider evidence](../ai/provider-eligibility.md). I02–I15 own the application changes.

## Product baseline

The opening experience should communicate care through typography, space, and a clear next action. Writing gets the largest, quietest surface. Research remains deep but appears in focused views. Each screen has one primary task; routine success stays quiet, while failures that threaten work remain visible.

| Settled choice                                  | Design consequence                                                                                                                                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Nonfiction edition; fiction is separate         | Five primary categories and two secondary choices below; no novel/story option.                                                                                                                                          |
| Mantine and semantic scoped CSS                 | Use one themed component system. Classes describe product roles; feature styles live with their owner.                                                                                                                   |
| Warm editorial identity                         | Warm neutral surround, paper surfaces, graphite text, deep green accents, system sans controls, bundled Source Serif prose.                                                                                              |
| Light, dark, system; accessibility retained     | Each surface/state has theme tokens; high contrast, 100–200% interface zoom, reduced motion, and keyboard paths remain available.                                                                                        |
| Title and byline required; description optional | No account identity becomes the author. Remember the author only through an unchecked opt-in preference.                                                                                                                 |
| Short empty starter outlines                    | No instructional/example prose inside a personal manuscript. Existing projects retain their outlines.                                                                                                                    |
| Local writing works without accounts            | Connection is optional, and the project exists before connection begins. No shared AI account, API-key form, or paid-token fallback.                                                                                     |
| Conversations and proofreading                  | Conversations are optional beside writing. Proofreading produces reviewable, reversible suggestions after an explicitly selected scope.                                                                                  |
| Portable ownership                              | Writing, research, conversations, and proposals travel with projects when implemented; credentials, live sessions, and view preferences do not.                                                                          |
| Free/paid access                                | One explicitly designated free editable project; paid unrestricted editing. Reading/export/backup/recovery remain available across projects. Eligible AI follows editable scope without an additional Collie AI paywall. |
| Tutorial and help                               | Optional separate synthetic nonfiction sample; dismissible three-point orientation; no blocking tour.                                                                                                                    |
| Permanent ad-free product                       | No promotions, upsell cards, sponsor slots, analytics, or remote decorative assets. Factual access controls belong in Settings.                                                                                          |

## Navigation and visual hierarchy

Application destinations are **Setup**, **Projects**, **Workspace**, **Settings**, and **Help**. Workspace has **Write** and **Research**. Research has **Sources**, **Notes**, and **Questions & claims**. Search, Export, Project details, and History are focused destinations with a remembered return target. Their presentation can be a view or dialog as specified below; they do not create another project session.

The workspace secondary panel has exactly one mode: Closed, Notes, Source, or AI. Expanding AI temporarily gives the conversation the primary reading area and supplies Return to writing. Keep the current editor/draft alive. Changing panels never creates a second note/source draft or silently broadens AI context.

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

Use small bundled Lucide icons decoratively with visible titles. The optional choices use the same selection semantics, without overwhelming the five primary cards. Expanding More starting points retains selection and focus. A selected secondary option stays visible when returning to this step.

Study critique's eventual central material may be a local PDF or a publication/research link. **This increment adds no special upload/link wizard, central-study field, automatic fetching, argument analysis, or refutation action.** Its later workspace may suggest “Add the publication in Research → Sources,” using existing manual source tools. Entering a URL records a link; attaching a PDF uses existing managed-original behavior. Other nonfiction capabilities remain the same.

Legacy template IDs map as recorded in I04. New outlines are empty text sections, even when a section is called Chapter 1; that label does not make it an outline chapter container. I13 must offer current-section proofreading when no chapter container exists. Changing a project's category never rebuilds an existing outline or forces citation style. Generate references from citations; preserve any legacy/manual References sections.

## Annotated screen specifications

`[Action]` is a button, `( )` is a selection, and `[field]` is an input. Wide/narrow drawings show hierarchy, not exact screenshots. Shared state/focus rules above apply to each screen. AI drawings describe conditional I11–I13 behavior; I05 shows the explicitly unavailable state until a real eligible adapter exists.

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

Empty/default: seven known choices need no network. Loading: storage starts without replacing the cards; creation-dependent actions wait if needed. Error: a safe working-folder interruption uses S09; a cancelled Open picker returns here. Read-only access does not prevent entering setup or creating another local project; designation is separate. Cancelling New project returns to its origin; first-run users may remain here or open an existing file.

### S02 — Project details

```text
WIDE
[Back]  2 of 3 · Project details
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

Primary action: Create project. Focus order: Back/change type, Title, Byline, remember checkbox, Description, Cancel, Create. Initial focus is the heading; a failed submission focuses the first invalid input. Enter submits from single-line fields; Enter inserts a newline in Description. Back retains values.

New title/byline: trim, require 1–500 UTF-16 code units consistently with current JavaScript text validators. Description: optional up to 10,000 code units, preserving Unicode and line breaks; reject forbidden controls per I04. Explain limits near an invalid field and never truncate legacy values. Pen names and collective bylines are ordinary text. Remember-author preference starts off, is device-local, and is independently editable in Settings; it never reads purchase/provider identity.

Loading: “Creating project…” freezes the dispatched payload and exact operation identity. Error/unknown outcome: retain fields and reconcile/retry that operation before allowing changed input. Empty required fields never dispatch. After a durable receipt, the next screen is connection; later Back opens Project details for that same identity rather than recreating it. Leaving after creation retains the project. Storage failure keeps the draft and offers the applicable recovery action. Existing projects may retain an empty legacy author without being sent through setup.

### S03 — Optional AI connection

```text
WIDE
3 of 3 · AI connection                         Project created locally
                 Connect your AI account
                 Use your own eligible subscription. Optional.
                 [Eligible provider card]
                 Account sign-in opens in your default browser.
                 Later requests send only the context you choose.
                 [Continue with provider]
                 [Continue without AI]

NARROW / NO ELIGIBLE ADAPTER IN THIS BUILD
AI connection
Your project is ready.
AI connections are not available in this build.
You can write, research, save, and export offline.
[Continue without AI]
```

Primary action while signed out: the actual supported provider sign-in; local continuation remains immediately visible. When no provider qualifies, Continue without AI is primary and there are no working-looking provider cards. For a permitted Sign in with ChatGPT route, use its required “Continue with ChatGPT” branding; Codex execution can be explained underneath. Final branding follows the eligible route's requirements.

Focus: heading → provider choice if there is more than one → sign-in → Continue without AI. Browser opening does not replace the app window. Waiting shows Cancel sign-in and Continue without AI; leaving setup cancels its attempt unless the user explicitly chooses to keep waiting. Late callbacks cannot change a cancelled connection. Returning to the app focuses connection status, then the applicable Continue action.

States: signed out; opening browser/waiting; checking eligibility; ready with recognizable account/workspace; expired; offline; quota blocked; funding unknown; unavailable. “Signed in” is distinct from “Ready.” Error text explains the next action without credentials or SDK output. A ready existing connection offers Continue to writing, Change, and Disconnect. Sign-in sends no manuscript and makes no inference probe. A signed-in but ineligible account offers retry/manage connection or local continuation. Collie read-only status is separate and never resolved by AI login.

If the approved provider route requires a first-use plan disclosure, show that concise acknowledgment once as part of connection completion, following the route's branding requirements in the provider record. It is distinct from the optional product orientation and must not become a recurring tour or a credit-purchase prompt.

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
Write  Research                                [Notes] [Source] [AI]
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

AI is closed by default. Until implemented it shows a short availability explanation, not a composer. When implemented, the panel shows provider/account, context summary with inspectable exact content and prior messages, messages, a composer, Send, and Stop during generation. Chat input never implies an edit. Expanded chat provides Return to writing. Proofreading separately previews section/chapter scope and offers before/after proposals with Accept, Reject, explicit grouped Apply, and stale-target explanations. Reading stored conversations/proposals needs no provider session; no hidden reasoning is shown.

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

Search opens from the workspace header. Results identify manuscript sections, notes, sources, questions/claims, and inspected pages. Preserve query/page/scroll state and origin. An exact target opens through the same draft guard. No results suggests revising the query; stale results retain their locator and explain missing/changed content.

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
AI connections                 Interface zoom [100% ▾]
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

AI connections shows only real availability; stored transcript access remains in Workspace. Collie access is separately labeled with free designation/purchase restore facts. Data & recovery exposes paths through trusted reveal commands, retained candidates, backup/restore, reset recovery, and the narrowly defined Clear picker history. Updates are explicit and preserve flush-before-restart. Support previews remain content-free with no automatic upload. About includes runtime versions, notices, and readable bundled source access. Loading/errors are local to the requested action; an unavailable service does not replace Settings or revoke offline access.

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
| First run                | Safe storage initializes → S01 → S02 atomic local create → S03 optional connection → first empty section in S05. First Save chooses a file natively.                                                                                  | I02–I05, I07, I11 |
| Returning                | Restore preferences → resolve last trusted nonarchived workspace/section → S05; otherwise S04 with actionable unavailable/recovery state. No repeated tour/login.                                                                     | I03, I06, I09     |
| New project during work  | Guard active drafts/jobs → S01/S02 → reconcile one creation → connection → new workspace. Cancelling before dispatch discards only setup; after dispatch reconcile first and retain any created project.                              | I03–I05           |
| Free project switch      | Protect current edits → explicitly designate chosen project through existing main policy → open/edit. Create/Open never silently change designation. If no designation exists, offer Use this project for free editing before typing. | I03, I05–I07      |
| Offline / AI unavailable | Local setup/write/research/save/export continue. Connection explains offline/unavailable and offers Continue without AI. Existing chats remain readable when delivered. No background inference retry.                                | I05, I09–I12      |
| Access loss mid-draft    | Freeze new edits → preserve eligible in-flight buffers → offer protection/return to same project's free designation → retain visible unresolved drafts. Reading/export/backup/recovery remain.                                        | I03, I07–I09      |
| Source-backed writing    | S05 → S06 add source/inspect original/excerpt/link evidence → return to the exact manuscript position; opening a companion panel shares the same source/note draft.                                                                   | I07–I08           |
| Recovery                 | Persistent issue → inspect current/retained material → independent recovery copy or Save As → retain original/candidates until an explicit supported action says otherwise.                                                           | I06, I09          |
| Conversation             | Choose provider and exact context including history → send deliberate request → readable partial/complete local message → optional Save as note. No manuscript mutation.                                                              | I10–I12           |
| Proofreading             | Capture selected passage or explicit chapter/section → review grammar proposals → explicit revision-checked Apply/Reject → reversible history. Editing the target can make suggestions stale.                                         | I13               |

## Acceptance boundary

I01's manual review is a review of these specifications, not an instruction to try nonexistent screens. Future stage guides must include only their implemented UI. Josh's assessment of calmness, visual quality, and discoverability is still pending, as are native behavior, accessibility, content preservation, output fidelity, and AI quality. The [existing release NO-GO](../validation/release-candidate.md) remains unchanged. See the [I01 manual review guide](../manual-testing/improvement-I01.md).
