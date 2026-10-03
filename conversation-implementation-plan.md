# Collie Writer conversation implementation plan

## Status, purpose and relationship to the improvement plan

**October 3, 2026 — C07 shared handoff implementation complete — awaiting user testing, delivered under the explicitly requested CD08 overlap. Other C stages remain planning only and are not authorized by this document.** Implement this plan after the app improvement plan and any additional refinements Josh requests. I12 is now implementation complete — awaiting user testing: see its [decision](docs/decisions/improvement-12-conversation-foundation.md), [record](docs/validation/improvement-I12.md), [schema 11 matrix](docs/formats/working-project-v11.md) and [manual guide](docs/manual-testing/improvement-I12.md). The remaining feature expansion remains planning only; C07 coverage is recorded below. I01–I11 are not instructions to repeat earlier work; I10 remains partial with live access, funding/isolation, eligibility and distribution requirements unresolved.

Josh wants meaningful conversations about research and writing that remain easy to find and organize. A conversation can belong to multiple categories and relate to multiple research items/sources and chapters. AI can help propose these assignments, with the author deciding what to retain. This plan develops that vision from the bounded I12 foundation into a polished project feature.

**Required addition, October 2, 2026:** sources introduced by the AI during a conversation must be easy to review and save to that project's Research → Sources library. Automatic collection into a conversation's review list is allowed; automatic creation or modification of Research sources is not. The user selects sources and explicitly adds them in a batch, without copying bibliographic fields one source at a time. This is a required conversation capability, not an optional future enhancement or a synonym for linking an already saved source.

This revision inserts **C04A** and **C04B** between C04 and C05 so each implementation pass remains focused. Existing C01–C08 IDs, including C07's shared retention dependency in the proofreading plan, remain stable. The authoritative index below now contains ten implementation stages. That planning revision delivered no code or provider activation; the subsequent CD08 request authorizes only its shared C07 overlap.

The original **Important note** remains verbatim in [app-improvement-plan.md](app-improvement-plan.md). This plan supplies implementation contracts, not a replacement or narrowing of that goal. It does not add autonomous web research, specialized Study critique intake, manuscript rewriting, shared cloud history or imported provider-account history.

## Delivered I12 baseline — October 2, 2026

I12 supplies the retained AI writing companion, title search/Active–Archived pages, new/rename/archive/restore, durable plain-text requests/responses, exact passage OR section captures, opt-in prior messages, real I10 dispatch/stop/local-recovery wiring and native UTF-8 transcript export. I12 delivered SQL/minimum reader **11**; I13 subsequently advances the current format to **12**, with conversation tables unchanged. AST/archive **1**, frozen compilation **3** remain. `src/shared/ai-content.ts`, `src/domain/ai/context.ts` and `src/worker/ai/capture.ts` own action-neutral capture/attempt fields, projection and hashing. `src/shared/conversations.ts`, `src/worker/projects/conversations.ts`, `src/main/conversations/` and `features/ai/conversations/` own the concrete conversation implementation. I13 extracts the shared durable coordinator to `src/main/ai/content-service.ts` and shared editor selection to `features/ai/selection.ts`; both content features use them. Inspect these owners before extending them; do not recreate the foundation.

The existing operations database stores local execution bindings separately from portable messages/captures/attempts. Copies retain history without provider authority. Lists page by 20 and transcripts by five requests; up to 20 unsent composer drafts are retained in memory with close/project/access guards. Prompts allow 16,000 characters and aggregate attached context 64,000; up to 12 prior messages are explicit. Unsent drafts need a local request receipt for crash durability. Transcript export is separate from manuscript export and preserves existing destinations. I12 left I10's global **64 retained operation** ceiling intact. CD08 now delivers C07's shared receipt-driven retirement: the hot ceiling stays 64, proven outcomes move to retained cold storage, and both worker binding collections release matching slots without deleting journals.

Provider registration/funding/isolation/model readiness/distribution remain unresolved; actual live generation and every manual observation remain pending. C07 is implemented through CD08, awaiting user testing; C01–C06, C04A/C04B and C08 remain unimplemented. In particular, I12 does not yet collect assistant-suggested source candidates or add them to Research; that important requirement remains explicitly assigned below.

## Division of work

| Delivery | Included | Deliberately left for later |
| --- | --- | --- |
| I12 foundation | Stable portable conversations/messages/captures/attempts; recent list/title search; new/rename/archive/restore; retained plain-text composer/transcript; passage OR current-section context and reviewed prior messages; actual run/stop/recovery wiring; native transcript export | Organization graph, research context picker, rich evidence discussion, AI assignment, branching/summaries, operational journal retention and feature polish |
| C01–C02 | Manual many-to-many organization, retrieval and backlinks | Sending linked content or automatic assignment |
| C03–C04 | Explicit multi-item research/manuscript context, trustworthy evidence presentation and Save as note | Autonomous retrieval, verified-evidence claims and automatic manuscript changes |
| C04A–C04B | Discoverable conversation source list, reversible review decisions, duplicate-aware batch addition to Research and conversation provenance | Automatic Research additions, automatic citation insertion, automatic downloads or claims that suggested references were retrieved/verified |
| C05–C06 | Reviewed AI organization, deliberate history summaries and branches | Silent metadata changes, hidden context or automatic inference replay |
| C07–C08 | Sustained use, retained outcomes, lifecycle recovery, coherent interaction and manual acceptance | Automatic deletion of recovery or a claim that provider/release gates are resolved |

I12 must be useful without these stages. Build on its IDs, strict schemas, capture/attempt owner and storage consumers. Do not put organization into comma-separated strings, use UI array positions as identity or store the only transcript in provider session files. Conversely, I12 need not create unused future tables or a generic extensibility framework.

## Product and data contracts shared by every C stage

### Calm, discoverable conversation experience

- Keep the optional AI companion beside writing, with one secondary mode at a time. An explicit Expand action may use a larger retained view for a long discussion; it must not create a second transcript owner or permanently crowd the editor. New conversation, current title and recent history are primary; filters and organization are progressive disclosures.
- Prior conversations are project-owned. Support Active/Archived and meaningful title/excerpt/date rows, then search and category/research/chapter filters. Do not display UUIDs, raw event streams or provider diagnostics in ordinary rows.
- Use Mantine and existing static theme/CSP conventions. Author semantic classes such as `conversation-list`, `conversation-context-review`, `conversation-link-picker` and `conversation-message`. Keep component/feature CSS with its real owner. Preserve keyboard navigation, IME input, focus return, zoom, contrast, motion and retained draft guards.

### Sources from a conversation: review once, save selected

**Recommended UX:** put a persistent **Sources (count)** control beside the conversation title. Show a restrained new-source count when a completed reply introduces references, and a **Review sources** action directly beneath that reply. The action opens the same list filtered to that reply, with an obvious All conversation sources option. Keep the header control visible even when its list is closed; when empty, explain that references mentioned by the assistant will appear there. Do not rely on a transient toast or require the writer to notice tiny citation links. New replies never steal focus or open a panel automatically.

In an expanded conversation, this list may be a collapsible right-hand tray. Inside the narrower writing companion, use a Sources subview with **Back to conversation**; at narrow widths use one content area. Reuse the same retained owner, selection and scroll state, rather than creating another permanent app column or another copy of the conversation. Preserve the unsent composer and manuscript selection when opening/closing the list.

Each compact source card shows a title (or its available URL/identifier when untitled), author/year when supplied, domain or DOI, a short assistant-provided relevance description if present, and where it appeared in the conversation. Details disclose the actual origin of metadata and evidence. No remote favicon/preview image is fetched. A checkbox, optional inline Edit details, Open link, Dismiss and **View in Research** when already present supply the relevant actions. Missing metadata is visibly incomplete; do not force a full bibliography form for otherwise saveable records.

All checkboxes start unchecked. **Add selected to Research** with the selected count is the approval action; routine valid additions need no second confirmation dialog. An explicit Select all shown can select the currently displayed eligible IDs only; later streamed/new candidates must not join that selection. Selection is not an AI verdict, and listing a source does not mean it is endorsed. Show **Needs details**, **Already in Research** or **Possible match** inline before dispatch, with direct correction/target choices. If some selected rows are unresolved, clearly offer adding only the ready rows with their exact count and leave the others selected for correction; never silently drop rows or report a partial batch as fully saved.

After a confirmed save, show “Added 3 sources” / “Linked 1 existing source” and a direct **View in Research** action without navigating away automatically. Keep the cards in a Saved view and expose the originating message from the Research source. The same conversation may yield more candidates after prompt refinement; new responses do not silently replace prior review choices. Provide All, To review, Saved and Dismissed filters. Dismiss is reversible and affects the conversation candidate, not the Research source or manuscript citations. Saving source metadata does not download a PDF, verify the source, endorse a claim or insert a citation.

### Candidate records and truthful source provenance

Separate three concepts: **a reference mentioned/suggested in chat**, **a retrieval observation from a supported tool**, and **a source the user saved to Research**. The initial I10 adapter exposes agent text and captured user context, not a supported web-search/source-result contract. C04A must work from those actual outputs and mark newly suggested references as unverified. If a later authorized adapter supplies documented retrieval evidence, preserve its real origin/time/locator, but retrieval alone still does not verify the metadata or the assistant's interpretation. Do not label an AI-generated URL as “found on the web” based solely on its wording.

Actual live source discovery remains a distinct, currently unresolved provider capability. These stages do not enable unrestricted search/browsing or change I10's closed runtime tools to manufacture discovery. If the supported provider cannot search, say so when the user requests fresh research while still allowing references actually mentioned in its response to be reviewed/saved. Missing live retrieval does not block this local capture-and-save workflow, and the completed workflow must not be advertised as live web research.

A conversation-source candidate has its own stable ID plus project/conversation ownership, revision, bounded available bibliographic fields, original reference text, origin kind, first/last occurrence and originating message/run/reference IDs for every actual mention. Keep each occurrence so deduplicating cards cannot lose how/where a source was introduced. A user-captured reference from a reply retains that reply and selected text as its origin even when automated parsing missed it. Preserve the difference between fields supplied by a model, a captured existing source, a documented retrieval result and a later human correction. A model relevance explanation is not an inspected excerpt or a verified quotation.

Store candidate identity separately from its review decision (pending/dismissed), save/link receipts and canonical Research source ID. Thus a saved record can remain readable if the conversation is archived, and a later Research merge/trash can be shown without recreating it. Candidate metadata revisions cannot overwrite saved source fields or invalidate a human choice silently. If a dismissed reference reappears, append its occurrence to that retained card; do not resurrect it as a fresh checked candidate. Changed identifiers or conflicting details need visible review rather than an invisible merge. Transcripts remain immutable when candidate details are corrected.

Use conservative, documented normalized DOI/URL/ISBN identity and existing source matching logic where appropriate. Compare both conversation candidates and current project sources, including aliases/merged targets and trashed matches. Similar titles/authors are suggestions, not automatic identity. Preserve original URLs/identifiers and do not discard arbitrary query parameters to force a match. A domain match alone never joins different articles. A source repeated across several conversations should usually map to one canonical Research source with multiple provenance links, while each conversation retains its own selection/dismissal history.

Adding selected sources is a local domain operation requiring current editable scope, not a provider operation: it works after disconnect/offline and never sends another prompt. Reading candidates/saved sources and their provenance remains available read-only. New sources default to the existing `verified: false`; clicking Add is not the separate human verification action. Do not mark a source `manual` or overwrite the provenance/verification of an existing matched record merely because it arrived through chat.

The selected batch freezes candidate IDs/revisions, chosen create/link actions, reviewed metadata and expected existing-source revisions under one operation ID. A successful transaction creates/links sources, records promotion receipts, updates candidate status and adds the disclosed conversation/source relationship together. It does not infer source/chapter citation usage from conversation/chapter links. Unknown results retry that exact local operation; no duplicate sources, rerun inference or “Saved” state before a durable receipt. Concurrent edits/duplicate discoveries require refreshed review rather than silently replacing metadata. Limit each batch and make progress/remaining choices explicit.

Persist candidates, occurrences, dismissals, human corrections and source-promotion provenance in the project's portable graph, including backup and independent copies. Keep account/runtime secrets out. Source merge/trash, conversation archive/branch and project copy require explicit reference handling; dangling provenance retains readable labels and cannot cascade-delete research. An unsaved checkbox selection is retained UI intent, never queued automatic approval on reopen. No hidden scraping or DOI resolver runs to complete metadata. External links open only through an explicit user action and a narrow main-owned validated HTTP(S) target path, not a generic renderer URL/command API.

### Organization is distinct from context

Recommended categories are **flat, user-named, project-local conversation categories**, distinct from project type and existing note-only labels. A later shared taxonomy would need its own explicit migration; do not quietly repurpose note categories. A conversation can have zero or many categories, and each category can contain many conversations.

Research links use typed references to actual source, note, question, claim or saved excerpt IDs; excerpt links retain their source/version/locator. Outline links identify actual chapter containers. Root-level text sections may also be linked, labeled as sections rather than invented chapters. Each target can relate to many conversations. A link records stable project-local target identity, relationship revision and a readable fallback label. It never asserts that a source supports a claim or that a conversation is an actual manuscript citation.

Keep mutable organization links separate from immutable sent-context captures. Linking/unlinking, renaming a source, moving a chapter or changing categories cannot rewrite what an earlier request contained. **Associating a chapter or source does not authorize uploading its text.** Related items can be offered in a picker, unselected by default. AI assignment suggestions likewise require their own reviewed prompt/context and separate acceptance.

### Storage, authority and lifecycle

Read `AGENTS.md`, the improvement plan's AI/data rules, [working schema 10](docs/formats/working-project-v10.md), [I03 ownership](docs/decisions/improvement-03-session-navigation.md), [I08 research](docs/decisions/improvement-08-research-workspace.md), [I10 runbook](docs/ai/provider-runtime.md) and [I11 account ownership](docs/decisions/improvement-11-ai-connections.md). At implementation time, also read I12's actual delivered record and any preceding C/P records. The current planning baseline is SQL/minimum reader 10, AST/archive 1, compilation 3; these are not reserved future schema numbers.

Every persistent extension must update its full consumer set: `src/worker/storage/schema.ts`, `migrations.ts`, owning project repositories, `portable-db.ts`, `manifest.ts`, `snapshot.ts`, `archive.ts`, `incoming.ts`, narrow shared/main/preload/worker commands and capability classification, plus Save/Open/Backup/Duplicate/Restore consumers. Preserve supported old reads, copy migration, originals/failed candidates, all association graphs and ID-only receipts. Follow existing independent-copy re-scoping; never remap one side of a relationship alone. Archived/missing targets retain readable historical labels; do not cascade-delete conversations or captures.

Conversation content, source candidates/occurrences/promotion receipts, accepted links, categories, findings, approved summaries and decisions are portable by default. Credentials, provider account/workspace IDs, authorization tokens, filesystem paths, runtime handles and active execution bindings remain device-local. Copied projects retain outcomes but cannot attach to or resume the original process. Deleting a relationship changes neither manuscript nor stored context. Initially use reversible archive/removal; permanent transcript erasure and removal from older backups are not promised.

Read/export remains available offline and after entitlement changes. Local conversation/category/link mutations require current editable scope. AI generation additionally requires the actual selected account/model/capability and binding included-only funding at every request. Completion of an already authorized run may protect its existing output; it does not grant authority for a new continuation. Preserve exact local retries, unknown outcomes and independent close/update settlement. Never replay inference on navigation, startup, account refresh or regained connectivity.

Use real I10/I11 methods. At this checkpoint all registrations are null, funding/isolation refuse, models are unverified and the runtime is not packaged. Local feature engineering proceeds, while dependent live behavior remains unavailable. No fake responses, forced success, fixtures, developer bypass, paid credits/API keys or inferred provider approval. New purpose/capability fields must be narrow, validated across processes and bound to the captured request; a new UI label is not authority.

### Context and evidence

The actual I10 limits are currently 16,000 UTF-16 prompt units, 64,000 total context units in at most 32 chunks and 128,000 output units. Read current constants when implementing; these are content bounds, not billing guarantees. Include prompt framing, approved history and all attachments in the actual payload budget. Do not silently trim, summarize or expand to fit. Prefer fewer explicit chunks; no embeddings service, vector database or autonomous retrieval is required by this plan.

Capture exact text, identities/revisions, labels, prompt version, intended purpose and approved-history selection. Source text is quoted research material, never trusted instructions. Only user-visible model text is retained, not hidden reasoning. Model statements are suggestions; association with a research source does not verify them. Each evidence link must resolve to supplied, captured material or remain visibly unverified. Runtime tools and arbitrary URL/file access stay closed.

## Stage execution and index

Use prompts such as **“Implement C03 from conversation-implementation-plan.md.”** Read the shared contracts above and that entire stage, inspect the actual checkout/ordinary Git state and delivered prerequisites, then implement only its work and necessary owner changes. Proposed paths are ownership suggestions, not proof that a file already exists. Do not silently implement missing earlier stages. Missing live access blocks live outcomes, not independent local work.

Model headings use the improvement plan's existing names: Astra for coupled architecture/data integrity work and Sol for bounded UI work; High/Extra High are workload recommendations, selected by Josh in his client. They do not select the writer's AI or authorize agent delegation.

| Stage | Outcome | Depends on | Status |
| --- | --- | --- | --- |
| C01 | Categories and typed many-to-many links | Delivered I12 | Not started |
| C02 | Search, filters, related-conversation entry points | C01 | Not started |
| C03 | Explicit research and multi-section context | I12; C01 for related-item suggestions | Not started |
| C04 | Evidence-aware discussion and adopted notes | C03 | Not started |
| C04A | Conversation source candidates and discoverable review list | I12, C02/C04 presentation and reference contracts | Not started; inserted stage, required |
| C04B | Explicit batch save/link to Research with provenance | C01, C04A, existing source repository | Not started; inserted stage, required |
| C05 | User-reviewed AI organization suggestions | C01–C03 | Not started |
| C06 | Deliberate summaries and conversation branches | C03; I12 attempt storage | Not started |
| C07 | Shared durable outcome handoff and sustained use | I12/I13 actual schemas; explicit CD08 overlap | Implementation complete — awaiting user testing; [shared record](docs/validation/conversation-C07.md); live use blocked by CD03 |
| C08 | Integrated conversation polish and acceptance handoff | C01–C07, explicitly including C04A/C04B | Not started |

### Stage C01 — Add categories and many-to-many associations

#### Model: Astra | Effort: Extra High

**Purpose and entry:** make conversation organization real, portable and manually usable. Read the actual I12 schemas, `src/shared/notes.ts`, `sources.ts`, `evidence.ts`, `inspection.ts`, `outline.ts` and existing reversible lifecycle commands. This stage changes organization, not AI context.

**Implementation:**

1. Add a bounded conversation-category entity with ID, name, revision, timestamps and active/archived state, plus unique conversation/category memberships. Define name normalization for duplicate detection while preserving the displayed spelling. Renaming preserves ID and membership. Archiving removes a category from default new choices but retains memberships and archived inspection; restoration is reversible. Category merge/hierarchy is outside this stage.
2. Add project-owned typed association records for chapter/section, source, note, question, claim and excerpt targets. Enforce uniqueness and target ownership/type in the worker, not only in the picker. Use target-specific foreign keys where available and explicit graph validation for polymorphic references. Capture fallback labels/locators without treating them as live source content.
3. Implement narrow revision-checked, idempotent attach/remove/category commands with capability classification and the complete storage/copy migration. Reject stale or cross-project targets. Keep removed-link history or tombstones sufficient for an explicit undo operation; do not erase old sent captures.
4. Add an Organization disclosure to a conversation, with multi-select category and typed target pickers, remove actions and visible archived/missing-target states. Make category creation reachable there. Changes are explicit local saves; unknown acknowledgments retain the exact request. Do not make organization a prerequisite for Send.

**Done when:** a conversation can simultaneously belong to two categories, two chapters/sections and multiple research sources/items, and each target can be linked to multiple conversations. Stable links survive rename/move/archive and portable copies; text/context is not sent by any organization action.

**Manual guide:** Josh creates and links disposable conversations, renames/archives/restores a category or target, removes/undoes a relationship and reopens a saved independent copy. Expected results include retained membership/history, clear inactive labels, no provider request and no alteration to the manuscript. Native migration/copy outcomes remain unobserved until reported.

### Stage C02 — Make prior discussions easy to find

#### Model: Sol | Effort: High

**Purpose and entry:** turn the association graph into useful navigation. Read C01, `src/renderer/src/app/navigation.ts`, `features/research/ResearchLayout.tsx`, `SourceUsage.tsx`, `ResearchData.tsx`, workspace retention and the existing worker search owner.

**Implementation:**

1. Extend bounded local search from I12 titles to stored visible message text. Use the existing local indexing strategy where suitable; document incremental updates, stale-index fallback and rebuild ownership without adding a second content store. No network search, model-generated indexing or indexing of credentials/hidden reasoning.
2. Add Active/Archived, category, source/research item and chapter/section filters. Use OR within a chosen dimension and AND across dimensions, showing active filters and a clear reset. Include Unassigned. Result rows show title, bounded matching excerpt, readable updated date and compact related-item counts; paginate rather than loading every transcript.
3. Add Related conversations disclosures in chapter/section and research inspectors and typed conversation/message targets in navigation. Preserve exact return target, search query/results position, editor selection and drafts. Backlinks use actual link records, never substring matching or model guesses. Keep existing source citation/evidence counts distinct.
4. Support an explicit expanded conversation view for history-heavy work while preserving the same session/composer owner. At narrow widths, use one primary pane with a clear return path. Avoid adding several permanent navigation rails.

**Done when:** a user can find a previous discussion from its words, category, source or chapter and return to the same manuscript/research location without losing drafts. Missing targets lead to a retained explanation, not a guessed replacement.

**Manual guide:** find a disposable conversation through each entry point, combine/remove filters, archive/restore and reopen a specific message, then use Back at narrow width/high zoom. Observe draft/scroll/focus preservation and honest empty results. No generated large-history fixtures or benchmarks.

### Stage C03 — Build explicit research-context selection

#### Model: Astra | Effort: Extra High

**Purpose and entry:** make critical discussion of writing and research possible through a precise payload. Read I12's capture/run owner, C01 links, source inspection/excerpts and the current editor/outline contracts. If proofreading has extended the shared capture owner, reuse that extension without importing proofreading UI.

**Implementation:**

1. Extend the context picker to multiple selected passages/sections, active text descendants of selected chapters, saved notes and inspected source excerpts. Select items explicitly; category/chapter/research links only offer candidates. A whole attachment or URL is not silently fetched or sent. Use existing inspected text and human excerpts; show unavailable/partial extraction and transcription provenance.
2. Capture a reviewed manifest with exact text/revisions, section order, source version/hash/page/locator and approved previous messages. Define deterministic deduplication so the same excerpt/history item is not sent twice; retain provenance for every inclusion. Freeze the manifest at confirmation and invalidate authorization if it changes.
3. Show item content, totals and exclusions before Send. Reject an over-limit payload with choices to remove items/narrow passages; batching is not added here. A chapter without supported text does not become an implicit whole-project request. Notes/research content have the same disclosure as manuscript text.
4. Centralize capture/readable projection so conversations and later proofreading can use the same versioned manifest without depending on one another's panels. Update strict inputs/digests, persistence/copies and request-purpose validation together. Keep source text delimited as untrusted evidence and prohibit runtime tools.

**Done when:** the actual authorized prompt can be explained entirely by the inspected manifest. Edits after capture cannot alter the outgoing text or rewrite history. No automatic full-project upload or source retrieval exists.

**Manual guide:** select two source excerpts and writing, inspect/remove items, modify a source afterward and observe frozen provenance; attempt an over-limit selection through ordinary UI and receive a narrowing choice. With eligible access, submit explicitly and reopen the captured context afterward; otherwise retain unsent input and the real refusal.

### Stage C04 — Present critical discussion and evidence responsibly

#### Model: Astra | Effort: High

**Purpose and entry:** support readable analytical conversations grounded in chosen material. Read C03, source inspector navigation, source-usage/evidence distinctions and `src/shared/notes.ts`/worker notes. The existing note contract is human-only; do not silently label adopted AI text as human-authored.

**Implementation:**

1. Add optional concise prompt starters such as Examine this argument, Compare these passages and Find limitations or counterarguments. Each produces an editable draft and context suggestion, not an immediate request. Include supporting and challenging interpretations; do not instruct the app to assume a chosen study is false.
2. Add bounded safe rich-text display for supported Markdown constructs using the existing renderer conventions or a documented narrowly selected dependency if needed. Reject raw HTML, remote media, executable links and automatic external navigation. Preserve raw visible text for export/recovery. Streaming incomplete markup must stay readable and cannot escape the container.
3. Let replies refer to IDs from the captured source/passage manifest. Validate returned references and exact quoted text before rendering a source locator. Unknown references remain unverified text; a clickable existing source is not proof that the source supports the model's claim. Preserve explicit novel reference mentions for C04A's candidate extraction instead of discarding them as unknown. Prefer compact references, with details on demand rather than citation clutter. A link to captured evidence and a newly suggested citation must be distinguishable.
4. Implement explicit Save as note for a chosen message or passage: show title/body preview and provenance, then use a revision-safe existing note mutation. Extend strict note origin/provenance and all consumers to distinguish user-adopted AI material from human-only notes; retain a link to conversation/message/capture. Idempotent retry must not create duplicate notes. Never create an authoritative evidence link or manuscript citation automatically.

**Done when:** users can discuss chosen research with inspectable reference provenance and deliberately retain useful text as an honestly attributed note. The conversation remains separate from manuscript/citation truth.

**Manual guide:** edit a starter without sending, inspect real response references where available, save one passage as a note and follow its provenance after reopen/copy. Unknown/missing source references remain clearly unverified; saved source text and writing stay unchanged. Without real output, document those dependent observations as pending rather than generating examples inside the app.

### Stage C04A — Collect and review sources introduced in conversation

#### Model: Astra | Effort: Extra High

**Purpose and entry:** make sources visible and reviewable throughout the discussion without adding anything to Research yet. Read I12's actual messages/attempts, C02/C04's retained presentation/reference parsing, the source-candidate contracts above, `src/shared/sources.ts`, worker `sources.ts`, [Stage 11 source decisions](docs/decisions/stage-11-sources.md), source inspector navigation and I10's actual text/event contract. Do not assume the provider already emits structured search results.

**Implementation:**

1. Define strict versioned candidate/occurrence/review-decision records, bounded field/row sizes and exact idempotent ingest keyed to real conversation/message/attempt output. Extend all migration, portable/copy, command and capability consumers. Candidate metadata can be incomplete even though a canonical Research source has stricter requirements. Do not create canonical source rows or claim complete bibliography metadata during ingestion.
2. Collect references from actual completed assistant output: use documented structured references if genuinely delivered, otherwise the versioned conversation text/reference format and conservatively recognized explicit URLs/DOIs/bibliographic mentions. Keep original text and parsing provenance. Do not treat every URL in prose as a verified scholarly source, access hidden reasoning or make a second AI request merely to extract references. Unsupported/malformed references stay visible in the transcript with a route to capture their supplied details; do not silently lose the reply because its reference block is invalid. An in-message Add to source list action can recover a missed reference without retyping it.
3. Design streaming so provisional reference text cannot become an approved source while its fields are still changing. Ingest durable reference occurrences from the stored output boundary, never directly from changing component arrays. A retained partial/cancelled reply can offer explicitly captured complete references, labeled as from partial output; it cannot pretend the research finished. Reconciliation after reopen uses the same occurrence keys without duplicating cards, replacing human edits or resetting dismissals.
4. Implement the persistent Sources count, per-reply Review sources action, compact tray/subview, filters, origin-message navigation, checkboxes and inline corrections described above. Deduplicate cards conservatively while retaining all occurrences. Add reversible Dismiss/Restore and visible possible-match/metadata-uncertain states. Do not auto-open the tray, preselect sources or expand the visible selection as new results arrive. C04A's handoff explicitly states Research promotion is not yet implemented; C04B delivers the final Add action, with no fake saved state in this stage.
5. Open an external link only on user activation, through a narrow main action resolving the scoped candidate/reference ID and validating its stored HTTP(S) destination. Show the domain and reject credentials/unsafe schemes; do not download or resolve bibliographic metadata. Preserve retained UI drafts and focus on return from the browser, and keep raw URLs/content out of diagnostics.

**Done when:** new sources mentioned in genuine conversations are automatically collected into a durable, easy-to-find review list; users can inspect, select, correct and reversibly dismiss them without any Research/source/citation mutation or extra AI call. The UI truthfully distinguishes supplied, suggested and actually retrieved evidence. Candidate-only delivery remains partial toward the required end-to-end save feature.

**Manual guide:** using genuine saved assistant replies when available, open Sources from the header and a reply, review a repeated reference and its message occurrences, dismiss it, refine the conversation and observe that the decision survives, then restore/correct it and reopen the project. Selecting items must not add Research sources or include newly arriving candidates automatically. Without actual output, observe the truthful empty/unavailable state and mark candidate/live observations pending; do not inject sources or generate fixtures.

### Stage C04B — Save selected conversation sources to Research

#### Model: Astra | Effort: Extra High

**Purpose and entry:** complete the required low-friction capture workflow. Read C04A and C01, `src/shared/sources.ts`, `src/worker/projects/sources.ts`, project source commands/capabilities, `SourcesPanel.tsx`, `ResearchData.tsx` and source import/merge/revision/portable consumers. The existing manual create path labels provenance `manual`, while bibliography import depends on a native file grant. Neither is a ready-made conversation batch API: reuse their domain normalization/matching/transaction helpers, not fabricated file grants or forged import provenance.

**Implementation:**

1. Add narrow prepare/commit conversation-source promotion commands. Prepare resolves the selected actual candidate IDs in the project, validates their revisions and proposed metadata and computes current exact/possible canonical-source matches. Supply a bounded review plan/digest with create, link-existing or needs-review outcomes; commit accepts the exact plan/choices and stable operation ID. Main checks editable scope, worker enforces ownership/revisions. No provider session, network resolver or inference is needed for this local operation.
2. Use current canonical `SourceMetadata` types/validation. Fill available fields without inventing author/date/type; require a supported type and nonempty title to create, with a compact inline choice/correction only where needed. Clearly label suggested/incomplete metadata. An explicitly accepted URL-as-title can retain an otherwise untitled web reference with missing fields left blank. Match DOI/ISBN/URL and existing aliases conservatively; show similar-title cases for user choice. Unambiguous existing records use Link existing after the reviewed action; multiple/conflicting/trashed matches need explicit resolution. Never restore a trashed source or overwrite/merge its metadata automatically.
3. Make the visible Add selected to Research action the batch approval. Freeze the exact ready candidate IDs/revisions, metadata and target choices before dispatch; if any selected items need attention, clearly state which ready subset/count the action will save and leave unresolved rows retained. In one transaction, create new sources with `verified: false` and conversation-derived provenance, or link existing canonical sources without replacing their metadata/verification, then write per-candidate promotion receipts and the disclosed conversation/source associations. Repeated citations and subsequent conversations can attach provenance to the same source; no duplicate creation on repeated clicks/retries.
4. Persist structured origin links to conversation/message/run/candidate plus a bounded readable provenance label; do not overload a free-text source field with an entire transcript or credentials. Extend source merge/trash, graph validation, independent-copy re-scoping and native archive readers/writers to preserve these links. Keep original candidate claims and human corrections distinct from later canonical metadata. Existing metadata verification remains its own explicit Research action; saving is not verification or citation insertion.
5. Publish confirmed Added/Linked/Needs attention results per reviewed row and refresh Research's actual read model. Show Saved/View in Research on cards, an explicit return path to the originating conversation on the source, and remaining candidates without losing composer/selection. Unknown commits freeze the exact operation and offer local reconciliation; no optimistic Saved labels or automatic retry of AI. Scope late replies to the original project, not whichever project is selected afterward.
6. Keep decisions reversible without dangerous automatic deletion: Dismiss affects only candidates; unlinking conversation provenance does not delete the Research source. A mistaken newly added source can be opened in Research and explicitly moved to its existing reversible Trash, with normal citation/other-use visibility. Do not offer a blanket Undo that silently trashes pre-existing/shared sources. Reappearance or a later metadata correction must not resurrect trashed research automatically. Preserve read/export/candidate access after disconnect or loss of editing rights, with Add disabled under the existing editable-project rule.

**Done when:** a writer can review several sources introduced in chat and add the chosen ones to Research with one clear batch action, correct only the rows that need it, and return later to both the canonical record and original discussion. Duplicate handling, truthful provenance, exact local retries and save/copy/reopen behavior are implemented. Source capture is not considered complete at C04A alone.

**Manual guide:** select a few genuine candidate references, leave others unchecked and add the ready selection; Research should contain exactly the newly created records and intentional links. Add a repeated reference from another conversation and observe an existing-source choice rather than a duplicate; inspect conversation provenance, missing metadata and `verified: false`. Refine a prompt, dismiss/restore a wrong candidate, save after disconnect, follow View in Research/back, and use disposable Save/Backup/Duplicate/reopen to inspect preserved records. Exercise a naturally observed uncertain result through its exact local retry only. No fake source generation, forced failures or provider calls by the assistant; unobserved outcomes stay pending.

### Stage C05 — Suggest organization with explicit human approval

#### Model: Astra | Effort: Extra High

**Purpose and entry:** let AI help assign a conversation to categories, research items and chapters without silently reorganizing the project. Read C01–C03, the actual provider purpose/capability contract and category/link revision commands.

**Implementation:**

1. Add Suggest organization as an explicit action. Preview chosen conversation messages and a bounded candidate catalog of selected category names, chapter/section titles and research metadata. Descriptions, note bodies and manuscript/source passages are separate opt-in context. Catalog size is bounded; no automatic whole-library upload.
2. Define a strict, versioned organization result with candidate IDs/types, concise rationale and proposed adds/removals. Extend the shared/main purpose contract narrowly if needed; use the same provider session/funding gate. Do not invoke inference through a metadata command or call a catalog a verified relevance score.
3. Accept only supplied same-project candidate IDs. Proposed new category names appear as separate Create category suggestions that require confirmation; the model cannot invent targets, delete categories or dispatch mutations. Keep captured catalog/conversation revisions and actual run provenance.
4. Present each proposed change with current links and Accept/Ignore actions; allow explicitly selected grouped acceptance after reviewing all changes. Recheck current targets, revisions and edit capability in an idempotent transaction. Preserve manual changes made since capture; stale suggestions need review again. Rejection has no effect on links or prose.
5. Keep source promotion separate: AI organization may suggest a relationship to an existing Research source, but cannot add a C04A candidate to Research or change its dismissal decision. Where C04A/C04B are delivered, unsaved candidates can be offered through Review sources; C04B's explicit selection/save is still required. If those stages are not yet delivered, do not implement their missing flow implicitly under C05.

**Done when:** AI can recommend organization, while every actual category/link change has a separate attributable user decision and reversible local operation. Lack of eligible AI never removes manual organization.

**Manual guide:** use real eligible output when available, accept one proposed link, ignore another and undo the accepted organization change; edit links while a suggestion is pending and observe stale refusal. Before access, inspect the proposed input and honest unavailable state while manually organizing normally.

### Stage C06 — Support longer discussions without hidden context

#### Model: Astra | Effort: Extra High

**Purpose and entry:** preserve intelligible long histories and deliberate new lines of discussion. Read I12's linear transcript/capture storage and C03's bounded manifest. This stage adds summaries and branches, not automatic context compression or an autonomous multi-request agent.

**Implementation:**

1. Add a context-history selector showing exactly which prior messages fit and which are excluded. The writer can narrow history explicitly. Full local history stays readable even when it cannot all be sent.
2. Offer an explicit Summarize selected history action with its own authorized bounded input and outcome. Store the original message IDs/revisions, summary text, prompt/provider provenance and human approval. Let users edit/approve a retained summary before including it in later context. A summary is derived and potentially incomplete, never a replacement for the transcript or evidence.
3. Implement Start a new conversation from here using a new conversation identity, an immutable origin reference and reviewed selected messages/summary. Keep the original linear transcript intact; avoid an editable message-tree framework. Copy/export preserve lineage without copying provider resume authority. A deleted/archived origin still has readable captured labels.
4. Account/provider changes take the same explicit context-review path; do not send old history to a new account automatically. Each summary or later reply is a new authorized operation. No automatic follow-up inference, summary refresh or hidden retry.
5. Where C04A/C04B are delivered, preserve source-candidate/message provenance when branching or summarizing. Sharing selected messages does not approve their sources, duplicate canonical Research entries or transfer approval of unrelated candidates. A source list in a branch derives from its actual copied references and keeps an inspectable origin; it is not reconstructed from potentially lossy summary prose alone. If capture is implemented later, its ingestion must honor the retained message lineage instead of requiring C06 to be redone.

**Done when:** long local history remains usable, context limits are visible, and summaries/branches disclose their source and sharing scope. Narrative continuity is not promised for omitted material.

**Manual guide:** select existing history, inspect excluded messages, branch with a small chosen subset, and reopen both conversations. With eligible access, approve/edit a real summary and inspect the next payload; otherwise retain the explicit unsent action. No fabricated conversations or generated load fixtures.

### Stage C07 — Complete durable handoff and sustained operation

#### Model: Astra | Effort: Extra High

**Implementation checkpoint, October 3, 2026:** CD08 explicitly authorized and implemented this shared contract using `AiContentService`, `AiStorage` and both feature workers. Trusted original-scope receipts precede main hot-record and local binding retirement; encrypted cold originals, exact identities and bounded lazy reads remain. Non-completed outcomes require explicit local acknowledgment and keep their actual state/output. Local database v2 retains its prior backup; portable formats and original operation versions do not change. See the [decision](docs/decisions/codex-CD08.md), [format matrix](docs/formats/ai-handoff-v1.md), [record](docs/validation/conversation-C07.md) and [manual guide](docs/manual-testing/conversation-C07.md). All observations await Josh; no other C stage is implemented. Live repeated use remains blocked by CD03.

**Purpose and entry:** resolve I12's bounded operational capacity without losing unknown/partial content. Read I10's encrypted journal/cap, I12's durable attempt ingestion, main lifecycle/access service, project snapshots and all later schemas actually delivered. This is the shared operational-retention increment for conversations and proofreading. It can be explicitly requested after I12 independently of C01–C06; preserve their records and I13/P-stage findings if present. Proofreading does not need its own competing journal-retention service.

**Implementation:**

1. Define a main-to-worker handoff receipt binding original scope, purpose, operation/attempt, terminal sequence, payload/result digest and committed portable record revision. Main must obtain/validate this through the trusted storage boundary; a renderer claim is insufficient. A conversation transcript and a proofreading result can have different portable owners but use the same transfer rule. Protect output before acknowledging transfer. Lost acknowledgments repeat the local handoff only, never inference.
2. Separate active/unsettled journals from successfully handed-off retained operational history through a versioned protected local index/archive design. Release a hot-job slot only for a proven terminal durable handoff with no pending write. Keep original encrypted material retained under explicit policy; do not purge it or merely raise/ignore the 64-job cap. Bound cold-record listing and lazy reads so restart does not reload every transcript into memory.
3. Unknown/partial operations remain conservatively retained and cannot become completed because a copy exists. Allow explicit local acknowledgement/archival only with readable preserved output/outcome and no live child or pending write. Main can retain output for a closed project and reconcile later by original identity; never send it to whichever project is now selected. A copied project cannot acknowledge the original's handoff.
4. Present storage/capacity and unsaved-output problems with disk-only Retry protection and recovery actions. Preserve fail-closed close/update behavior, external save conflicts and snapshots. Do not add timers for automatic expiry, content-bearing diagnostics or reset/GC shortcuts. Document what remains in older project files/backups and what any future deletion would require.

**Done when:** ordinary continued conversation use is not permanently capped by successfully transferred old jobs, while unsettled work and both local/portable recovery remain protected. Capacity handling is an actual durable contract, not an unbounded in-memory queue.

**Manual guide:** use naturally accumulated genuine history to observe retained results, handoff status and reopen; save independent copies and confirm no live job resumes. Use disposable data and ordinary close/navigation/storage-error observations only. No repeated paid calls to fill the cap, generated fixtures, forced crashes or failure injection. Unobserved capacity/recovery behavior stays pending.

### Stage C08 — Integrate and polish the conversation experience

#### Model: Sol | Effort: High

**Purpose and entry:** finish the delivered feature as an understandable writing/research workflow. Read C01–C07 records, explicitly including the inserted C04A/C04B stages, and Josh's supplied results; inspect actual I15 refinements and completed proofreading changes for shared-owner compatibility. Source review and batch capture into Research are required for this milestone, not optional polish.

**Implementation:** harmonize list/picker/message/context/action language and empty/error states; finish responsive expanded/companion transitions, keyboard/focus/IME behavior and restrained source displays; resolve reported defects in owning modules. Make source discovery in the UI, multi-select Add, duplicate/needs-details outcomes and reversible dismissal straightforward. Include the source checklist in keyboard/screen-reader coverage and make new-source announcements polite, without interrupting composition. Make archived/missing links, omitted context, derived summaries, partial replies and unconfirmed outcomes legible without exposing operational jargon. Update Help/navigation, privacy inventory, accessibility matrix, portable-format documentation and retention explanation. Do not add new models, review modes, research fetching or provider activation under polish.

**Done when:** every original conversation requirement and the required source-capture addition is reachable through a documented real path, each dependency or pending observation is explicit, and a consolidated user guide covers organization, critical discussion, reviewing/saving sources to Research, reuse of history, account changes, export/copy and recovery. A Sources list with no working batch Add flow does not satisfy completion. A polished unavailable state is not acceptance of live conversations or live source retrieval.

**Manual guide:** Josh follows one disposable project journey from linking several chapters/sources through a real permitted discussion and retained note, spotting the Sources count, reviewing only useful candidates, adding a selected batch to Research, refining the prompt without auto-adding rejected results, finding/reopening the discussion from saved-source provenance, reviewing organization suggestions, branching and portable export. Include existing/trashed matches, offline save of retained candidates, read-only access, themes, narrow/200% zoom, keyboard/screen-reader use and selected-account changes. Record only supplied results; unsupported/live paths stay pending.

## Handoff and completion ledger

The standing manual-testing policy applies throughout: no assistant test code, fixtures/mocks, harnesses, check/build/lint/typecheck/audit commands, app/SDK/browser launch, screenshots, benchmarks or delegated verification. Ordinary source/Git reading and production edits are allowed. No assistant login, inference, registration or publication is authorized by a stage request. Manual guides describe ordinary user actions with synthetic/public material or disposable copies; they are not executable verification scripts.

Each requested C stage delivers its production changes, a decision where needed, `docs/validation/conversation-Cxx.md` recording changed paths/schema/limits, and `docs/manual-testing/conversation-Cxx.md` with setup/actions/observable outcomes. Use the complete inserted IDs in filenames and prompts, for example `conversation-C04A.md` and “Implement C04B from conversation-implementation-plan.md.” Update this index and the app plan's expansion ledger without changing earlier acceptance. Distinguish **implementation complete — awaiting user testing**, user-confirmed acceptance, missing dependent code and live/provider/release gates. Finish “Stage Cxx complete. As a user:” with the ordered guide only when implementation is complete; stop before the next stage.

| Milestone | Status |
| --- | --- |
| Planning and scope split | Feature expansion remains planned; explicit CD08 request authorizes the shared C07 overlap only |
| I12 baseline | Implementation complete — awaiting user testing; I13 owns current portable schema 12 |
| C01–C08, including inserted C04A/C04B | C07 implemented through CD08 — awaiting user testing; remaining nine stages not started |
| Conversation sources → approved Research records | Required; C04A collects/reviews, C04B promotes; neither implemented |
| User acceptance and live conversation quality | Unobserved; provider prerequisites remain unresolved |
| Release readiness | Existing NO-GO remains independent |
