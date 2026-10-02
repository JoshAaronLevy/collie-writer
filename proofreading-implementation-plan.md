# Collie Writer proofreading and editing implementation plan

## Status, purpose and relationship to the improvement plan

**October 2, 2026 — planning only, awaiting Josh's review. No P stage is implemented or authorized by this document.** This work follows the app improvement plan and any further refinements Josh requests. I12 and I13 foundations are now implementation complete — awaiting user testing. Read I13's [decision](docs/decisions/improvement-13-proofreading-foundation.md), [record](docs/validation/improvement-I13.md), [format 12 matrix](docs/formats/working-project-v12.md) and [manual guide](docs/manual-testing/improvement-I13.md). This does not implement or authorize any P stage. Earlier implemented stages need no rerun. I10's missing provider contracts/access remain separate work, not a reason to postpone independent review UI/storage engineering.

Josh wants to choose a proofreading/editing task and a selection, chapter or entire document; submit explicit instructions to his own AI account; and inspect flagged writing with contextual suggestions and an option to ignore a particular issue in that particular text. The original **Important note** and all seven ideas remain verbatim in [app-improvement-plan.md](app-improvement-plan.md). This plan retains them and recommends clearer user-facing labels and bounded semantics.

“Run review” applies the selected analysis to the chosen material. It never changes manuscript text. Text changes require a separate reviewed Apply action. Some useful findings are questions, coverage reports or structural advice with no proposed replacement. The author can ignore or resolve those without the app inventing an automatic rewrite.

## Division of work and recommended review catalog

I13 delivers **Spelling, grammar & punctuation** on a selection/current text section that fits one request, with portable exact-target findings, a retained before/after review panel, individual Apply/Ignore/Undo ignore, stale refusal and pre-apply history. It deliberately omits inline flags, repeated-issue suppression, grouped apply, chapter/manuscript batching and the other modes. These P stages extend that same capture/finding/decision owner rather than replacing it. The delivered owners are `shared/proofreading.ts`, `domain/ai/proofreading.ts`, `worker/projects/proofreading.ts`, `main/proofreading/` and `features/ai/proofreading/`. Both AI features use `main/ai/content-service.ts` for durable execution/protection over the single I10 service. Mechanics captures have at most 128 supported runs within one 64,000-unit context envelope, results at most 100 findings, and the project at most 10,000 review runs. Individual accepted corrections use the workspace/editor transaction lock, protected structural checkpoint and existing history comparison. Preserve these identities/receipts and allocate subsequent versions from the actual checkout.

Keep one mode selected per review initially. Show a short explanation and relevant parameters; do not turn the initial dialog into seven panels of settings. Recommendations below are product design choices for Josh's review, not claims about measured AI accuracy.

| Review label | User benefit and bounded input | Finding/action | Delivery |
| --- | --- | --- | --- |
| **Spelling, grammar & punctuation** | Mechanical correctness of explicitly included prose; honor the document language and stated spelling convention, preserve author voice and quoted material | Exact local replacement with reason; Apply or Ignore | I13 foundation; P01–P04 expand review/scopes |
| **Source faithfulness** | Compare a manuscript statement with chosen, actually available source passages; disclose source version, excerpts, context and extraction limits | Possible misrepresentation/overstatement with side-by-side quotes and locators; advisory by default | P06 |
| **Citation & source coverage** | Understand actual citation distribution and uncited research; counts use manuscript occurrences, while optional commentary considers disclosed context | Source/chapter coverage report and cautious suggestions, not a “correct” citation quota | P07 |
| **Claims needing support** | Identify statements whose wording may imply stronger evidence than the supplied material establishes | Review question or suggested qualification with explicit evidence scope; user chooses wording or adds evidence | P06 |
| **Repeated ideas** | Identify possibly redundant claims or explanations, including paraphrases, while preserving intentional summaries/repetition | A group of exact occurrences and why they may overlap; no automatic deletion of all instances | P05 |
| **Clarity & coherence** | Identify wordiness, unclear references, digressions and broken logical transitions; a constructive replacement for “Rambling/Incoherence” | Advisory explanation or a bounded optional replacement; preserve nuance and voice | P05 |
| **Structure & flow** | Review ordering, headings, transitions and alignment of a chapter/manuscript with its stated purpose | Outline-linked advice and proposed organization for human consideration; no automatic outline mutation | P08 |

All seven original ideas are included. No plagiarism checker, AI detector, truth score or automatic reference generator is added. Source faithfulness assesses the representation of provided material, not whether a study is scientifically correct. Claims needing support is not an all-purpose fact checker. Saving a source does not obligate the author to cite it; frequency alone cannot establish overuse or adequate support. Those limits should be concise in the product and detailed in Help.

### Parameters and defaults

Use restrained defaults and reveal these options only for their corresponding implemented mode. Persist the chosen parameters in each capture so a later rerun can explain what changed. Product/project type may suggest wording, never silently select additional content or send a request.

| Mode | Recommended parameters |
| --- | --- |
| Mechanics | Use the project's explicitly supported language/spelling convention, initially the existing en-US convention unless a supported choice is implemented; conservative corrections, preserve quotations and voice. Do not imply evaluated multilingual support. |
| Source faithfulness | Author-selected claim/source pairings and passages; show the comparison's actual evidence coverage. No automatic source download or unsupplied study-wide conclusion. |
| Citation & source coverage | Chosen manuscript scope and source set; separate actual citations, evidence links and unrelated saved sources. Local descriptive report first, optional AI commentary second. |
| Claims needing support | Optional intended genre/purpose and selected evidence; distinguish factual claims from interpretation, recommendation and personal observation. Default to cautious review questions. |
| Repeated ideas | Chosen scope and optional instruction to preserve intentional recaps; show grouped occurrences, not a numerical originality score. |
| Clarity & coherence | Optional audience/purpose; conservative mode by default, with suggestions to simplify only when requested. Preserve necessary technical terms and qualifications. |
| Structure & flow | Optional objective and desired audience; selected chapter/manuscript outline plus declared text coverage. Advice only; the writer performs structural edits. |

## Shared execution contracts

### Read the delivered foundation and preserve ownership

Read `AGENTS.md`, the improvement plan's AI/data/style rules and actual I12/I13 decisions/records. Source entry points are `src/shared/ai.ts`, `src/main/ai/service.ts`, `src/main/ai/storage.ts`, the delivered shared capture/attempt/finding modules, `src/renderer/src/editor/adapter.ts`, `src/domain/editor/schema.ts`, `src/shared/outline.ts`, `notes.ts`, `inspection.ts`, `evidence.ts`, worker `manuscript.ts`, `outline.ts`, `notes.ts`, `citation-occurrences.ts` and `evidence.ts`. Read Stage 9 history, Stage 10 annotation and Stage 15 citation contracts, plus I03 retained-session/draft ownership and I07/I08 presentation.

SQL/minimum reader is currently 12 after I13; AST/archive 1 and compilation 3 remain. These are planning facts, not reserved future versions: read the actual checkout after I12/I13 and any C stages. Extend retained-copy migrations, exact shared/main/preload/worker commands, capability classification, portable graph/manifests, snapshots and all Save/Open/Backup/Duplicate/Restore/rekey consumers for each new entity. Preserve old reads, original migration material and valid graph ownership. A copied project retains findings/decisions/captured text without live provider execution authority.

Findings, decisions and review metadata are separate from manuscript AST content and human annotations. Exporting a clean manuscript must not export flags, prompts or review commentary. Portable projects include the review history by default; a deliberate review-report export is separate. Credentials, account/workspace IDs, provider resume handles and running jobs stay device-local. Stable IDs and schema versions permit later modes and several targets per finding without rebuilding the editor or storing the only result in a transient decoration.

### Choosing a scope and disclosing coverage

The product flow is **review type → scope → inspect context and coverage → Run review → inspect findings → Apply / Ignore / resolve manually**. Changing type/scope/context invalidates an unsubmitted authorization. A review captures protected manuscript revisions; source/outline changes after capture do not alter the snapshot silently.

- **Selection:** exact section/block IDs and UTF-16 ranges, captured before text and compatible marks. Do not split surrogate pairs/grapheme content or flatten rich atoms to make an offset fit. Unsupported rich ranges are visibly excluded or require a narrower selection.
- **Current section:** the actual active `text` outline item; not an entire chapter merely because its title contains “Chapter”.
- **Chapter:** the selected active `chapter` container and its effectively active text descendants in outline order. Show included sections. If no chapter exists, offer Current section; do not create one, silently choose a parent part or widen to the project.
- **Entire manuscript:** a frozen list/order/revision map of active text sections, with explicit inclusion options where supported for footnotes or other peripheral content. Archived/trashed/merged sections, research library, notes, attachments, project description and old history are excluded unless separately chosen. Unsupported content remains listed in coverage, not silently counted as reviewed.

Main currently bounds prompt/context/output to 16,000/64,000/128,000 UTF-16 units, with at most 32 context chunks. Read current constants when implementing. The complete payload includes instructions, history, source passages and any summaries. Long review work uses explicit disclosed batches only after P03/P04. Bound chunks, count and output growth; refuse oversize work with narrowing options instead of quietly truncating or increasing provider limits.

Report “reviewed these sections/passages” and exclusions. A completed chunk is not proof that a whole book was coherently evaluated. Whole-manuscript mechanics can aggregate independent chunks; cross-manuscript repetition/structure needs a separately disclosed synthesis input and coverage contract. An AI summary cannot stand in for source evidence or an exact quote.

### Findings, Ignore and human application

A durable finding identifies its review/run, mode/template/schema version, actual provider/model provenance when known, one or more captured targets, exact quoted text, short explanation, optional replacement, evidence references where applicable, and current decision/target-validity state. Keep model confidence or severity descriptive and unverified, not a calibrated truth score. Unknown fields/targets, forged source IDs, overlapping replacements and invalid result shapes fail production validation before becoming applicable findings.

Separate **decision** (pending, applied, ignored, user-resolved) from **target validity** (current, stale, missing) and **run outcome** (not-sent, running/stopping, partial/completed, cancelled, failed, unknown/interrupted). Ignoring one issue in one occurrence must not hide every occurrence of the same words or every issue of that mode. Reversible ignore records retain original text/range, scope/mode and stable issue identity. P01 defines conservative repeat suppression: uncertain equivalence stays visible rather than hiding a potentially different issue.

Inline flags are derived decorations, never persisted formatting. Hover may reveal a preview, but keyboard focus/click and a retained issue list must expose the same information/actions. Do not place every word in the tab order, steal focus while typing or rely only on color. Multiple/overlapping advisory flags form an accessible issue group; they do not authorize overlapping replacements.

Apply always checks current editing rights, expected head/revisions, exact before text/range/marks and supported replacement rules. Use the existing worker mutation/history boundary, with a pre-apply checkpoint and an idempotent receipt. Update manuscript, anchor/citation projections and decision in one transaction. A grouped application succeeds atomically for all reviewed compatible findings or refuses; it cannot partially apply stale choices. No AI call occurs on Apply/Ignore/Undo ignore. Undo/history preserves later work rather than silently restoring an old entire document over it.

I13 conservatively makes other old-revision findings stale after an application. P01 adds grouped acceptance for a reviewed compatible set; manual edits and unproven target movements still make results stale. Do not silently fuzzy-match a quote elsewhere. Existing exact annotation/anchor mapping can inform a future safe translation, but changing a source version or manuscript wording is not automatic proof that a result remains valid. Ignore is not factual endorsement, and manually resolving an advisory finding is not provider-verified correctness.

### Provider and local-only behavior

All AI reviews use I10's supported boundary and the user's eligible account. Every batch, synthesis, rerun or internal continuation rechecks session, model, scope/capability and binding included-only funding. No API-key, credits/top-up route, automatic provider switch or background replay. No source-web lookup, shell, plugins or project filesystem access is authorized by a proofreading prompt. Source passages are untrusted evidence, never executable instructions.

All registrations remain null at this checkpoint; funding/isolation/eligible-model/packaging work is incomplete. Build actual capture, persistence, finding/review/apply code and honest unavailable states against delivered methods. Never fabricate findings, seed responses, simulate account success or use a provider request as a connectivity probe. Missing provider methods are named dependent gaps, not an excuse to skip independent UI/data work.

Read/export of saved findings survives disconnect/read-only access. New reviews and manuscript/decision mutations require current editable scope; generation additionally requires provider authorization. Preserve pending input and protect already authorized outcomes across entitlement transitions through existing guards. Main jobs and local writes outlive hidden panels and participate in close/update settlement. A storage retry retains its exact operation and never resends inference.

## Stage execution and index

Use **“Implement P02 from proofreading-implementation-plan.md.”** Read the shared contracts and entire stage, inspect actual delivered dependencies, implement only that stage and necessary owner changes, then stop. Astra/Sol and High/Extra High follow the improvement plan's workload recommendations; Josh selects the implementation model/effort in his client. They do not choose the product's inference model or authorize delegation.

Conversation C stages are not blanket prerequisites. P06/P07 may reuse C03's source-context owner if delivered; otherwise they implement the narrow required extension in the same shared capture owner and record it for future C03 to reuse. C07 owns shared durable operational handoff/retention for both features and can be explicitly implemented after I12 without the other C stages. Until C07 is delivered, proofreading must disclose and respect I10's 64 retained-job cap; it cannot claim sustained unrestricted use. Neither plan may create competing capture, run or retention services, silently implement the other plan or force a rerun of I01–I11.

| Stage | Outcome | Depends on | Status |
| --- | --- | --- | --- |
| P01 | Reusable findings, exact-occurrence Ignore and grouped apply | Delivered I13 and I12 shared core | Not started |
| P02 | Accessible inline flags and contextual inspector | P01 | Not started |
| P03 | Explicit chapter review and bounded batch lifecycle | P01; I12 run owner | Not started |
| P04 | Entire-manuscript scope and disclosed synthesis | P03 | Not started |
| P05 | Clarity/coherence and repeated-idea reviews | P01–P04 | Not started |
| P06 | Source faithfulness and claims needing support | P01–P04; existing inspected sources/evidence | Not started |
| P07 | Citation/source coverage report and optional commentary | P06; actual citation occurrence projections | Not started |
| P08 | Structure/flow review | P04; P01/P02 finding presentation | Not started |
| P09 | Integrated modes, help, report export and acceptance handoff | P01–P08; C07 shared retention for the sustained-use milestone | Not started |

### Stage P01 — Extend findings and occurrence-specific decisions

#### Model: Astra | Effort: Extra High

**Purpose and entry:** give all later modes one robust review model and make “ignore this issue here” precise. Read I13's actual result storage/validator/apply commands and Stage 9/10 revision/history semantics. Implement new behavior for mechanics first; do not expose absent modes as usable.

**Implementation:**

1. Add versioned typed mode descriptors and finding records supporting advisory versus replaceable results and multiple exact targets. Mechanics remains the only active mode. Each descriptor declares accepted scope/input/result versions and supported actions; no arbitrary prompt execution or generic unvalidated result payload.
2. Define an occurrence identity from stable block/section identity, exact range/quote, mode/rule or issue kind, replacement where present and captured local context. Persist reversible ignore decisions separately from prose. Within a run, ignore targets one finding. Across explicit reruns, suppress only a provably equivalent issue at the same unchanged occurrence; retain suppressed items in Show ignored. No fuzzy semantic suppression, global word exceptions or automatic acceptance of model-supplied identity. Changed/ambiguous occurrences are eligible to be shown again.
3. Add explicit Ignore, Undo ignore and Mark resolved for advisory findings, with current capability/revision checks, timestamps and provenance. Removed/missing text retains its historical decision and captured quote. Export/copy keeps the decision without granting live authority.
4. Add user-selected grouped Apply for nonoverlapping compatible replacements from one reviewed revision set. Preview every change, check all targets/head/revisions/marks, create one pre-apply checkpoint, and atomically record manuscript/projections/decisions and idempotent receipt. A stale member refuses the group. Findings not included become stale under I13's conservative rule when their document revision changes.

**Done when:** single-occurrence decisions, repeated-issue handling, advisory findings and grouped mechanics application share one strict portable model. Ignoring cannot mutate manuscript or hide unrelated occurrences; rejected/stale results remain readable.

**Manual guide:** with genuine findings, ignore one of repeated phrases, inspect Show ignored, undo ignore, explicitly rerun and observe conservative matching; preview/apply a small compatible group and inspect history. Edit a reviewed passage first and observe refusal. Without genuine output, report those paths pending; do not create injected proposals.

### Stage P02 — Show accessible inline findings

#### Model: Sol | Effort: High

**Purpose and entry:** implement the requested flagged writing and contextual help without disrupting editing. Read P01, the editor adapter/extensions, selection bridge, I07 layout, existing annotation decoration rules and Mantine/CSP dialog/overlay conventions.

**Implementation:**

1. Derive restrained inline decorations from current valid findings. Resolve exact targets through the shared owner; stale/missing findings stay in the issue list without guessed live highlights. Do not serialize decoration attributes into manuscript AST, clipboard, history or clean exports.
2. Hover displays a concise preview; click or a keyboard Next/Previous issue action opens a stable inspector with explanation, exact before/after, provenance/evidence and Apply/Ignore where supported. Match content/actions across pointer and keyboard paths; support Escape and explicit return to manuscript. Avoid a separate tab stop on every range.
3. Group overlapping advisory flags and show their issue count; selecting one identifies its targets. Keep controls outside active text editing and avoid IME interruption, tooltip flicker, auto-scroll on streaming or focus theft. A screen reader can use the ordered issue list without relying on color/hover.
4. Retain filters/selected finding across panel/navigation changes without leaking another project's results. Scope styles to the proofreading feature/editor-owned decoration extension using semantic names and static tokens. Handle narrow/200% zoom, dark/high-contrast and reduced-motion presentations.

**Done when:** the same real finding is understandable from inline writing and the review list, with occurrence-specific Ignore and safe application reachable by keyboard and pointer. No change to saved manuscript formatting occurs merely by showing flags.

**Manual guide:** Josh inspects real flags with hover, click and keyboard next/previous, ignores/restores one, edits its text and sees stale behavior, then copies/exports prose and observes no flag markup. Check ordinary IME, themes and narrow zoom manually; those outcomes remain unobserved until supplied.

### Stage P03 — Add explicit chapter scope and bounded batches

#### Model: Astra | Effort: Extra High

**Purpose and entry:** review a chapter without pretending every chapter fits a single request. Read P01, I12/I10 run/persistence limits and outline effective-state/order rules. This stage owns a review batch coordinator, not a general background AI queue.

**Implementation:**

1. Add Chapter scope resolving the selected actual chapter's active text descendants in order. Freeze the section/revision manifest, supported spans and exclusions. Offer current-section fallback explicitly if no chapter exists. Protect current editor content before capture; later edits invalidate application, not silently recapture text mid-run.
2. Build a deterministic bounded batch plan at supported block boundaries, with explicit per-batch input/output limits, bounded context overlap and total batch count. Preview what will be sent, what is excluded and the possible multiple subscription operations. Respect actual main operational capacity, including I10's retained-job cap until C07 is delivered; add a narrow main-owned capacity status if needed, without treating a preflight estimate as a reservation. If required work exceeds configured bounds, ask the writer to narrow it; a later capacity refusal preserves completed children and shows partial coverage rather than silently dropping the remainder.
3. Persist a parent review plus child captures/attempts and progress. On a user-approved start, run declared batches sequentially, checking session/funding/capability afresh for each. Stop prevents undispatched children and requests interruption of the active one. Distinguish completed, skipped, cancelled, failed and unknown child outcomes and aggregate partial coverage accurately.
4. Reconcile partial output idempotently by child ID and sequence, deduplicating overlap by exact targets/issue identity rather than prose similarity. Only completed valid child results become findings. Reopen performs local reconciliation but dispatches no remaining children; Resume/retry is explicit and reviews remaining capture/account/scope. Unknown children are not silently repeated.

**Done when:** a chapter review has a durable declared manifest, bounded sequential work and honest partial/terminal coverage. Stop or loss of eligibility cannot launch the next child, and no completion claim covers excluded/failed text.

**Manual guide:** preview a disposable chapter containing multiple real sections, confirm its order/exclusions and observe current unavailable gating. With eligible access, start/stop or leave/reopen an ordinary review, then explicitly choose whether to continue remaining work. Do not manufacture long text, fill quotas or inject failures to exercise it.

### Stage P04 — Add entire-manuscript review and explicit synthesis

#### Model: Astra | Effort: Extra High

**Purpose and entry:** support the requested entire-document option with a truthful scope and cross-section context model. Read P03 and current outline, footnote, citation and source-context projections. This stage supplies infrastructure for later broad modes; it does not implement them all.

**Implementation:**

1. Add Entire manuscript with a frozen ordered manifest of effectively active text sections and an inclusion/exclusion preview. Keep research/notes/project metadata separate. Declare the supported treatment of footnotes, tables, quotations and other rich content; exclude unsupported items explicitly. The product must not call a body-text-only review a review of everything in the file.
2. Extend the batch coordinator with a bounded total-work plan, pause/stop state and exact completion coverage per section. Mechanical review aggregates completed independent results. Store the manifest and every child's provenance so a later outline move does not relabel what was reviewed. A narrower rerun is a separate run, not silent replacement of past results.
3. Define an optional final synthesis step for modes that explicitly require it. Preview the exact intermediate summaries/finding references and section coverage it will receive; request renewed confirmation if actual output differs from the reviewed plan or needs new material. Capture its own immutable payload and authorization. Summary-based synthesis must be labeled as such and retain navigable originals; it is not full-text evidence review.
4. Refuse or visibly offer a smaller scope if the synthesis payload exceeds bounds. No hidden recursive compression or unrestricted agent loops. All child/synthesis operations participate in stop, unknown-outcome recovery, account locking, editing rights and funding gates. Read-only access still permits reviewing retained outcomes.

**Done when:** mechanics can review a declared supported manuscript scope and later modes have a disclosed bounded synthesis contract. Partial work remains partial; a whole-manuscript label never conceals omitted sections or unreviewed evidence.

**Manual guide:** compare the preview with the real active outline, inspect exclusions and retained section coverage, then observe a real permitted multi-section review if available. Reopen and inspect progress/history without automatic resumption. Large-book time, memory, usage and quality remain unobserved; no benchmark or bulk content generator.

### Stage P05 — Add clarity, coherence and repeated-idea reviews

#### Model: Astra | Effort: High

**Purpose and entry:** add the two prose-analysis modes sharing multi-target findings, while avoiding wholesale rewriting. Read P01–P04 and actual prompt/result versioning. Use one selected mode per request.

**Implementation:**

1. Add Clarity & coherence with concise parameters for intended audience/purpose and desired conservatism. Flag specific wordiness, ambiguity, digressions or logical gaps; preserve qualifications and author voice. Return an explanation and optional supported local replacement. “I prefer this wording” must not be presented as a grammatical error.
2. Add Repeated ideas with structured groups of exact passages and an explanation of possible overlap. Distinguish intentional recap/emphasis from redundant development. For chapter/manuscript scope, use declared batch/synthesis coverage and acknowledge limits of summary-based comparison. Never invent an occurrence from a paraphrased summary.
3. Validate every target against captured text; mark synthesis observations lacking exact original anchors as advisory with section-level scope, not inline replacements. A rewrite that requires unsupported cross-block changes remains advice. Do not make Delete all repeated passages an automatic command.
4. Reuse P01/P02 decisions and accessible flags, plus genuine mode-specific empty states and prompt/version provenance. Ignoring a repeated-idea group is distinct from ignoring a different concern in one of its member passages; show precisely what the action affects.

**Done when:** both modes produce explainable advisory or safely applicable local findings, with declared scope and no automatic rewrite. No-output/invalid-output and unavailable states preserve writing normally.

**Manual guide:** review ordinary disposable prose with genuine eligible output; inspect grouped targets, accept only a supported local edit, ignore a particular issue/group and retain it in history. Judge usefulness/false positives manually; “no findings” is not certification of clarity or originality.

### Stage P06 — Add source faithfulness and claims needing support

#### Model: Astra | Effort: Extra High

**Purpose and entry:** compare claims with evidence the writer deliberately supplies. Read existing source inspection/version/excerpt contracts, actual citation occurrences versus evidence associations, P03/P04 and C03's shared capture extension if present. If absent, add only the necessary source-excerpt capture support to the existing shared owner; do not implement conversation UI.

**Implementation:**

1. Build an explicit evidence picker for the selected manuscript statements/scope, offering linked/cited sources as candidates without automatically sending their files. Capture chosen source versions/hashes, exact passages, page/locators and surrounding context; show no-text/partial/extraction/transcription limits. Titles/URLs alone are insufficient for a faithfulness comparison. No new web fetching, OCR system or paywall access belongs here.
2. Add Source faithfulness with a strict result relating an exact manuscript statement to supplied passages. Present the quotes side by side, explain a possible mismatch, missing qualification or change in scope, and use “insufficient supplied context” when appropriate. A model quote must match captured source text before it becomes a clickable evidence quote. Contradictory sources remain separate; no invented consensus.
3. Add Claims needing support, distinguishing no cited support in the chosen scope, insufficient supplied evidence and a possible mismatch with supplied evidence. Missing evidence does not prove a claim false. Suggestions can ask for support or offer a cautious local qualification, never manufacture a reference or automatically add/remove a citation.
4. Findings include source/claim revision provenance and evidence coverage. A changed source version or claim invalidates applicability/needs rereview; retain old quotes and decisions. Default to advisory findings; a supported local wording change may use the existing exact-target Apply path after explicit review. No model output becomes an authoritative evidence link.

**Done when:** every faithfulness assertion can be traced to actual submitted material and every support warning discloses its limited evidence basis. Unavailable source text leads to an honest exclusion, not a guessed review from metadata.

**Manual guide:** choose disposable/public licensed source passages and a corresponding manuscript claim, inspect exactly what will be shared and follow genuine result locators. Change the source/claim afterward and observe staleness. A missing text attachment should yield a clear limit. Actual research quality remains user-evaluated and pending without eligible output.

### Stage P07 — Add citation and source coverage review

#### Model: Astra | Effort: High

**Purpose and entry:** address overconcentration/unused research with reliable local counts and optional interpretation. Read P06, I08 source usage, `src/renderer/src/features/research/usage.ts`, worker citation-occurrence/evidence projections and current source lifecycle semantics.

**Implementation:**

1. Produce a local head/revision-bound report of actual citation occurrences by source and section/chapter, separately displaying evidence links, related-source associations and saved research. Reuse authoritative occurrence projections; a conversation/source association is never counted as a manuscript citation. Disclose scope and archived/uncited source treatment.
2. Show uncited saved sources and concentrated citation distribution descriptively. Do not label a source “underused” because it has zero citations, prescribe equal quotas or equate count with argument strength. Let the writer inspect context before judging relevance. Reuse existing source inspector/navigation rather than a second source catalog.
3. Offer optional AI commentary only after previewing the report and selected manuscript/source passages. Counts alone support descriptive patterns, not semantic source-faithfulness conclusions. Bind commentary to the captured report revision; later edits mark it outdated. Every AI suggestion remains reviewable advice with no automatic citation insertion/removal.
4. Store or export a captured review report and its provenance through the shared review model, with valid copy/migration consumers and clear local-derived versus AI-derived fields. Reading a local derived report is available without a provider; storing new review decisions still follows editing rights. Empty/no-citation states remain useful.

**Done when:** writers can see how sources are actually used and request context-aware suggestions without misleading source-use scores. Local counts work offline and do not require an AI account.

**Manual guide:** compare a small disposable manuscript's visible citations with source/chapter report rows, inspect uncited research and follow an occurrence. Change a citation and observe report refresh/outdated commentary. Optional live interpretation remains pending where access is unavailable.

### Stage P08 — Add structure and flow review

#### Model: Astra | Effort: High

**Purpose and entry:** provide chapter/manuscript organization advice while preserving author control of the outline. Read P04, actual outline/history rules, P01/P02 advisory findings and any completed C-stage shared context changes.

**Implementation:**

1. Add Structure & flow with a concise optional purpose/audience prompt and a preview of headings, section order and the supported text/summaries being reviewed. A chapter input uses its actual descendants; manuscript analysis discloses whether it uses full chunks plus synthesis or a narrower overview.
2. Request specific observations about sequence, headings, transitions, repeated setup and missing connective explanation. Return exact or section-level targets and rationale, optionally a proposed outline expressed using known IDs and suggested labels. Reject invented existing targets; proposed new headings are suggestions, not created entities.
3. Present an outline-linked advisory view with current/proposed organization and relevant quotations where exact captures exist. Structural issues need not underline an arbitrary word; anchor them to a section/transition and keep them in the issue list. Allow Ignore, Undo ignore and user-marked resolution.
4. Keep reordering, split/merge and manuscript rewriting manual through existing outline/editor commands. Navigating there preserves the review and return target. Later structural edits mark the old finding context stale; do not execute model-generated outline operations or silently track a new target.

**Done when:** writers receive understandable organization advice, can inspect and act manually, and retain a provenance-rich review without the model controlling the outline.

**Manual guide:** inspect the structure preview, compare a genuine proposed sequence with the current outline, navigate to a section and make a deliberate manual change, then observe old-context staleness and retained history. With no eligible output, only scope/unavailable behavior is observable.

### Stage P09 — Polish the complete review workflow

#### Model: Sol | Effort: High

**Purpose and entry:** finish an approachable seven-mode feature. Read P01–P08 records, actual app/C-plan changes and Josh's reported findings. C07's shared durable handoff/retention must be delivered before claiming the sustained-use milestone; if it is still absent, finish independent polish and record that dependent milestone as partial without silently implementing C07. This is integration and bounded defect work, not authorization for new modes, autonomous editing or provider activation.

**Implementation:** unify mode labels/descriptions, scope selection, context/coverage preview, progress, flags and decisions; resolve reported interaction defects; provide clear current/old/partial review selection without stacking all runs' highlights at once. Add a deliberate human-readable review-report export containing mode/scope/coverage, actual findings/decisions and optional captured evidence, with native grants and no account/runtime secrets. Keep clean manuscript export separate. Update Help, privacy inventory, accessibility matrix, migration/retention documentation and feature status.

**Done when:** each catalog entry has a real implementation path with documented required context and limits, the writer can find a finding from its prose/section and decide what to do, and copies/offline reading preserve the review. User confidence in the experience and real model quality require user observations; a polished disabled review button is not a working-feature milestone.

**Manual guide:** a consolidated disposable-project walkthrough covers each available mode, selection/section/chapter/manuscript scopes, keyboard and hover/click findings, Ignore/Undo ignore, supported individual/grouped Apply, manual structural changes, stale/source-changed results, pause/stop/reopen, offline/read-only access and report versus clean manuscript export. Include narrow/200% zoom, themes, contrast/motion and screen-reader/IME paths. Record supplied results and pending live/native/quality outcomes explicitly.

## Handoff and completion ledger

The standing manual-testing policy applies to every P stage: no assistant test code, fixtures/mocks, test-only controls, harnesses, validation/build/typecheck/lint/audit commands, app/browser/SDK launches, screenshots, benchmarks or delegated verification. Ordinary source/Git reads and production edits are allowed. Do not log in, run inference, contact providers or publish as part of implementation. Manual guides use ordinary user actions and disposable/public material, not executable test scripts or deliberate quota/cost experiments.

Each explicitly requested stage produces its code, migration/decision documentation as needed, `docs/validation/proofreading-Pxx.md` with changed paths/limits and `docs/manual-testing/proofreading-Pxx.md` with user-only setup/actions/observable outcomes. Update this index and the app plan's expansion ledger. Mark **implementation complete — awaiting user testing** separately from user acceptance, provider activation and unresolved dependent code. Finish “Stage Pxx complete. As a user:” only for implemented scope, provide the ordered guide and stop before the next stage.

| Milestone | Status |
| --- | --- |
| Planning and seven-mode catalog | Draft delivered for Josh's review; no implementation authorization |
| I13 mechanics foundation | Not implemented at this planning checkpoint |
| P01–P09 | Not started |
| Native targeting/application, accessibility and AI quality | Unobserved; real eligible output required for dependent observations |
| Provider activation and release | I10 requirements and existing release NO-GO remain independent |
