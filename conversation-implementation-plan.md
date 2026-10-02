# Collie Writer conversation implementation plan

## Status, purpose and relationship to the improvement plan

**October 2, 2026 — planning only, awaiting Josh's review. No C stage is implemented or authorized by this document.** Implement this plan after the app improvement plan and any additional refinements Josh requests. I12 is still unimplemented at this planning checkpoint. I01–I11 are not instructions to repeat earlier work; I10 remains partial with live access, funding/isolation, eligibility and distribution requirements unresolved.

Josh wants meaningful conversations about research and writing that remain easy to find and organize. A conversation can belong to multiple categories and relate to multiple research items/sources and chapters. AI can help propose these assignments, with the author deciding what to retain. This plan develops that vision from the bounded I12 foundation into a polished project feature.

The original **Important note** remains verbatim in [app-improvement-plan.md](app-improvement-plan.md). This plan supplies implementation contracts, not a replacement or narrowing of that goal. It does not add autonomous web research, specialized Study critique intake, manuscript rewriting, shared cloud history or imported provider-account history.

## Division of work

| Delivery | Included | Deliberately left for later |
| --- | --- | --- |
| I12 foundation | Stable portable conversations/messages/captures/attempts; recent list/title search; new/rename/archive/restore; retained plain-text composer/transcript; passage OR current-section context and reviewed prior messages; actual run/stop/recovery wiring; native transcript export | Organization graph, research context picker, rich evidence discussion, AI assignment, branching/summaries, operational journal retention and feature polish |
| C01–C02 | Manual many-to-many organization, retrieval and backlinks | Sending linked content or automatic assignment |
| C03–C04 | Explicit multi-item research/manuscript context, trustworthy evidence presentation and Save as note | Autonomous retrieval, verified-evidence claims and automatic manuscript changes |
| C05–C06 | Reviewed AI organization, deliberate history summaries and branches | Silent metadata changes, hidden context or automatic inference replay |
| C07–C08 | Sustained use, retained outcomes, lifecycle recovery, coherent interaction and manual acceptance | Automatic deletion of recovery or a claim that provider/release gates are resolved |

I12 must be useful without these stages. Build on its IDs, strict schemas, capture/attempt owner and storage consumers. Do not put organization into comma-separated strings, use UI array positions as identity or store the only transcript in provider session files. Conversely, I12 need not create unused future tables or a generic extensibility framework.

## Product and data contracts shared by every C stage

### Calm, discoverable conversation experience

- Keep the optional AI companion beside writing, with one secondary mode at a time. An explicit Expand action may use a larger retained view for a long discussion; it must not create a second transcript owner or permanently crowd the editor. New conversation, current title and recent history are primary; filters and organization are progressive disclosures.
- Prior conversations are project-owned. Support Active/Archived and meaningful title/excerpt/date rows, then search and category/research/chapter filters. Do not display UUIDs, raw event streams or provider diagnostics in ordinary rows.
- Use Mantine and existing static theme/CSP conventions. Author semantic classes such as `conversation-list`, `conversation-context-review`, `conversation-link-picker` and `conversation-message`. Keep component/feature CSS with its real owner. Preserve keyboard navigation, IME input, focus return, zoom, contrast, motion and retained draft guards.

### Organization is distinct from context

Recommended categories are **flat, user-named, project-local conversation categories**, distinct from project type and existing note-only labels. A later shared taxonomy would need its own explicit migration; do not quietly repurpose note categories. A conversation can have zero or many categories, and each category can contain many conversations.

Research links use typed references to actual source, note, question, claim or saved excerpt IDs; excerpt links retain their source/version/locator. Outline links identify actual chapter containers. Root-level text sections may also be linked, labeled as sections rather than invented chapters. Each target can relate to many conversations. A link records stable project-local target identity, relationship revision and a readable fallback label. It never asserts that a source supports a claim or that a conversation is an actual manuscript citation.

Keep mutable organization links separate from immutable sent-context captures. Linking/unlinking, renaming a source, moving a chapter or changing categories cannot rewrite what an earlier request contained. **Associating a chapter or source does not authorize uploading its text.** Related items can be offered in a picker, unselected by default. AI assignment suggestions likewise require their own reviewed prompt/context and separate acceptance.

### Storage, authority and lifecycle

Read `AGENTS.md`, the improvement plan's AI/data rules, [working schema 10](docs/formats/working-project-v10.md), [I03 ownership](docs/decisions/improvement-03-session-navigation.md), [I08 research](docs/decisions/improvement-08-research-workspace.md), [I10 runbook](docs/ai/provider-runtime.md) and [I11 account ownership](docs/decisions/improvement-11-ai-connections.md). At implementation time, also read I12's actual delivered record and any preceding C/P records. The current planning baseline is SQL/minimum reader 10, AST/archive 1, compilation 3; these are not reserved future schema numbers.

Every persistent extension must update its full consumer set: `src/worker/storage/schema.ts`, `migrations.ts`, owning project repositories, `portable-db.ts`, `manifest.ts`, `snapshot.ts`, `archive.ts`, `incoming.ts`, narrow shared/main/preload/worker commands and capability classification, plus Save/Open/Backup/Duplicate/Restore consumers. Preserve supported old reads, copy migration, originals/failed candidates, all association graphs and ID-only receipts. Follow existing independent-copy re-scoping; never remap one side of a relationship alone. Archived/missing targets retain readable historical labels; do not cascade-delete conversations or captures.

Conversation content, accepted links, categories, findings, approved summaries and decisions are portable by default. Credentials, provider account/workspace IDs, authorization tokens, filesystem paths, runtime handles and active execution bindings remain device-local. Copied projects retain outcomes but cannot attach to or resume the original process. Deleting a relationship changes neither manuscript nor stored context. Initially use reversible archive/removal; permanent transcript erasure and removal from older backups are not promised.

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
| C05 | User-reviewed AI organization suggestions | C01–C03 | Not started |
| C06 | Deliberate summaries and conversation branches | C03; I12 attempt storage | Not started |
| C07 | Shared durable outcome handoff and sustained use | I12; actual schemas of completed C/P stages; can be requested before other C stages | Not started |
| C08 | Integrated conversation polish and acceptance handoff | C01–C07 | Not started |

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
3. Let replies refer to IDs from the captured source/passage manifest. Validate returned references and exact quoted text before rendering a source locator. Unknown references remain unverified text; a clickable existing source is not proof that the source supports the model's claim. Prefer compact references, with details on demand rather than citation clutter.
4. Implement explicit Save as note for a chosen message or passage: show title/body preview and provenance, then use a revision-safe existing note mutation. Extend strict note origin/provenance and all consumers to distinguish user-adopted AI material from human-only notes; retain a link to conversation/message/capture. Idempotent retry must not create duplicate notes. Never create an authoritative evidence link or manuscript citation automatically.

**Done when:** users can discuss chosen research with inspectable reference provenance and deliberately retain useful text as an honestly attributed note. The conversation remains separate from manuscript/citation truth.

**Manual guide:** edit a starter without sending, inspect real response references where available, save one passage as a note and follow its provenance after reopen/copy. Unknown/missing source references remain clearly unverified; saved source text and writing stay unchanged. Without real output, document those dependent observations as pending rather than generating examples inside the app.

### Stage C05 — Suggest organization with explicit human approval

#### Model: Astra | Effort: Extra High

**Purpose and entry:** let AI help assign a conversation to categories, research items and chapters without silently reorganizing the project. Read C01–C03, the actual provider purpose/capability contract and category/link revision commands.

**Implementation:**

1. Add Suggest organization as an explicit action. Preview chosen conversation messages and a bounded candidate catalog of selected category names, chapter/section titles and research metadata. Descriptions, note bodies and manuscript/source passages are separate opt-in context. Catalog size is bounded; no automatic whole-library upload.
2. Define a strict, versioned organization result with candidate IDs/types, concise rationale and proposed adds/removals. Extend the shared/main purpose contract narrowly if needed; use the same provider session/funding gate. Do not invoke inference through a metadata command or call a catalog a verified relevance score.
3. Accept only supplied same-project candidate IDs. Proposed new category names appear as separate Create category suggestions that require confirmation; the model cannot invent targets, delete categories or dispatch mutations. Keep captured catalog/conversation revisions and actual run provenance.
4. Present each proposed change with current links and Accept/Ignore actions; allow explicitly selected grouped acceptance after reviewing all changes. Recheck current targets, revisions and edit capability in an idempotent transaction. Preserve manual changes made since capture; stale suggestions need review again. Rejection has no effect on links or prose.

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

**Done when:** long local history remains usable, context limits are visible, and summaries/branches disclose their source and sharing scope. Narrative continuity is not promised for omitted material.

**Manual guide:** select existing history, inspect excluded messages, branch with a small chosen subset, and reopen both conversations. With eligible access, approve/edit a real summary and inspect the next payload; otherwise retain the explicit unsent action. No fabricated conversations or generated load fixtures.

### Stage C07 — Complete durable handoff and sustained operation

#### Model: Astra | Effort: Extra High

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

**Purpose and entry:** finish the delivered feature as an understandable writing/research workflow. Read C01–C07 records and Josh's supplied results; inspect actual I15 refinements and completed proofreading changes for shared-owner compatibility.

**Implementation:** harmonize list/picker/message/context/action language and empty/error states; finish responsive expanded/companion transitions, keyboard/focus/IME behavior and restrained source displays; resolve reported defects in owning modules. Make archived/missing links, omitted context, derived summaries, partial replies and unconfirmed outcomes legible without exposing operational jargon. Update Help/navigation, privacy inventory, accessibility matrix, portable-format documentation and retention explanation. Do not add new models, review modes, research fetching or provider activation under polish.

**Done when:** every original conversation requirement is reachable through a documented real path, each dependency or pending observation is explicit, and a consolidated user guide covers organization, critical discussion, reuse of history, account changes, export/copy and recovery. A polished unavailable state is not acceptance of live conversations.

**Manual guide:** Josh follows one disposable project journey from linking several chapters/sources through a real permitted discussion and retained note, finding/reopening it, reviewing organization suggestions, branching and portable export. Include offline use, read-only access, themes, narrow/200% zoom, keyboard/screen-reader use and selected-account changes. Record only supplied results; unsupported/live paths stay pending.

## Handoff and completion ledger

The standing manual-testing policy applies throughout: no assistant test code, fixtures/mocks, harnesses, check/build/lint/typecheck/audit commands, app/SDK/browser launch, screenshots, benchmarks or delegated verification. Ordinary source/Git reading and production edits are allowed. No assistant login, inference, registration or publication is authorized by a stage request. Manual guides describe ordinary user actions with synthetic/public material or disposable copies; they are not executable verification scripts.

Each requested C stage delivers its production changes, a decision where needed, `docs/validation/conversation-Cxx.md` recording changed paths/schema/limits, and `docs/manual-testing/conversation-Cxx.md` with setup/actions/observable outcomes. Update this index and the app plan's expansion ledger without changing earlier acceptance. Distinguish **implementation complete — awaiting user testing**, user-confirmed acceptance, missing dependent code and live/provider/release gates. Finish “Stage Cxx complete. As a user:” with the ordered guide only when implementation is complete; stop before the next stage.

| Milestone | Status |
| --- | --- |
| Planning and scope split | Draft delivered for Josh's review; no implementation authorization |
| I12 baseline | Not implemented at this planning checkpoint |
| C01–C08 | Not started |
| User acceptance and live conversation quality | Unobserved; provider prerequisites remain unresolved |
| Release readiness | Existing NO-GO remains independent |
