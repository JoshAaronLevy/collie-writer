# Hybrid import implementation plan

## Status and purpose

**User import failures and corrections, October 12, 2026 — acceptance correction implemented, awaiting user testing:** the reader and summary-protocol fixes were followed by a repeated Accept failure. Two prose sources in the same response received the same acceptance identity; the still-current summary was misleadingly reported as a changed project. Span-specific identities, SQL/minimum reader 38 retained-copy migration, and accurate summary recovery preserve the saved findings. The reported result is one conversation, nine messages and nine sources: seven structured references plus two saved prose extractions. See the [follow-up record](docs/validation/import-curated-envelope.md) and [manual retest](docs/manual-testing/import-curated-envelope.md). User acceptance remains pending.

**RF12 internal refactor, October 12, 2026 — implementation complete, awaiting user testing:** the retained selection/recovery hook now owns intake and dialog lifecycle, with presentation in `ImportProvider`; stored review admission is separate from current evidence construction. Shared dispatch, cancellation and summary reads replace duplicated orchestration. The same simple flow, exact originals, explicit AI grants and atomic Accept remain. No persisted versions change. See the [RF12 record](docs/validation/refactor-RF12.md) and [manual guide](docs/manual-testing/refactor-RF12.md). The earlier RF12 deferral is lifted by Josh's explicit request; earlier runtime acceptance is not inferred.

**RF06 presentation update, October 11, 2026:** the inactive Re-Analyze placeholder is removed. The current summary has Cancel and Accept; explicit continuation/retry and retained recovery remain unchanged. See the [RF06 guide](docs/manual-testing/refactor-RF06.md).

Updated October 11, 2026 — **IH01–IH07 implementation complete — awaiting user testing.** Josh approved the architecture: use TypeScript for reading, transforming, validating and importing data; use ChatGPT to understand unfamiliar structures and interpret content only where needed. This document plans that replacement and records requested stage implementation below. Stage progression does not establish runtime acceptance of earlier work.

The existing [import plan](import-implementation-plan.md) records the storage and provenance foundation. The [UX revision plan](import-ux-implementation-plan.md) establishes the interaction that remains required: **choose files, categories, optional instructions and model → Submit → short summary → Accept**. This plan supersedes their requirement that newly imported records first receive AI recognition. It also lifts their deferral of extraction improvements, specifically for the hybrid work described here. Historical project formats and saved work retain their meaning.

The objective is a useful, reliable import with much less unnecessary AI work. Known structured exports should need **zero AI requests** when their selected content can be read locally and no instructions require interpretation. Unfamiliar but regular JSON should usually need a small mapping request per distinct structure, not a request for every group of messages. Prose interpretation can still require multiple requests. These are architectural targets, not measured savings or accuracy promises.

## Context and diagnosis

The user has encountered a connected-account Submit refusal, an artificial large-file request ceiling, a missing multipart-template allowance, rejection of a model response because the prompt and validator disagreed about chat ordering, and prolonged analysis without sufficient progress information. Follow-up fixes are recorded in [IU05](docs/validation/import-IU05.md); they do not establish successful end-to-end extraction. Josh's approximately 1.7 MiB conversation JSON is a useful real acceptance example, not a special case to hard-code.

At the planning baseline, the implementation already did substantial deterministic work:

- The local graph reader recognizes raw ChatGPT exports, curated conversation JSON, bibliography formats and some literal notes. It retains original text and relationships.
- Multipart preparation then serializes eligible record metadata, original bodies and relationships into AI requests, even when the reader already understands them.
- Review preparation depends on identified records from valid protected AI results. A valid local parse alone cannot reach the same summary/Accept path.
- Unfamiliar JSON is retained as unsupported before that analysis. Sending more copies of recognized records does not solve this missing interpretation path.

Therefore, this is an evidence and extraction change, not another prompt adjustment. Local extraction must become sufficient evidence for import. AI mappings must become constrained data that TypeScript can apply, not model-generated copies of every conversation.

Planning baseline: SQL/minimum reader **32**, existing atomic acceptance/receipt and original-retention owners, and current multipart framing **7** with historical framing-5 readers. Verify these versions when implementing a stage; do not overwrite newer work or allocate a conflicting version. Prior code changes and user projects must remain intact. IH01 now introduces schema/minimum reader **33**, local evidence/review/manifest admission; see the [IH01 record](docs/validation/import-IH01.md) and [local evidence contract](docs/formats/import-local-evidence-v1.md).

IH03 extends SQL/minimum reader to **34** for strictly admitted mapping artifacts, reusing the existing managed artifact/blob owner and preserving schema-33 DDL. See the [mapping contract](docs/formats/import-mapping-v1.md) and [IH03 record](docs/validation/import-IH03.md). The interpreter is an internal prerequisite; AI discovery and mapped acceptance remain IH04.

IH04 extends SQL/minimum reader to **35**, with mapping capture/run 3, execution/binding 10, framing 8, handoff 5, graph/reader 2, session mutation/revision 3 and mapped review/manifest 4. Older contracts remain readable with frozen validation/digests; see the [discovery contract](docs/formats/import-discovery-v1.md).

IH05 extends SQL/minimum reader to **36**, with semantic plan/packet/output 1, capture/run 4, execution/binding 11, framing 9, handoff 6, graph/reader 3, session mutation/revision 4 and interpreted review/manifest 5. Complete-context instruction selection and targeted original-span extraction reuse the existing finite coordinator and atomic Accept. See the [semantic contract](docs/formats/import-semantic-v1.md) and [IH05 record](docs/validation/import-IH05.md).

IH06 extends SQL/minimum reader to **37**, with typed refusal records, execution/binding **12**, handoff **7** and session mutations **5/6/7** for recovery and explicit legacy transition. IH07 preserves these durable versions, removes obsolete recognition constructors and request controls, and finishes phase-specific progress and the integrated handoff. See the [current route and compatibility contract](docs/formats/import-recovery-v1.md#ih07--integrated-routing-and-compatibility).

## Product decisions

| Area                            | Required behavior                                                                                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User workflow                   | Keep the two-modal experience and existing controls. No parser choice, mapping editor, per-record review, conversion wizard or mandatory extra confirmation.                                            |
| Mode selection                  | Choose local parsing, AI mapping and targeted interpretation automatically from the files, categories and user instructions. Do not add an AI/local toggle.                                             |
| Known formats                   | Read every applicable record locally. Do not ask ChatGPT to re-identify records or restate original text.                                                                                               |
| Unknown structured data         | Ask ChatGPT for a bounded declarative mapping from representative structure/examples. Apply it to the entire selected input in TypeScript.                                                              |
| Prose and semantic instructions | Use AI on relevant content when a mapping cannot answer the request. Explicit source metadata still uses local extraction.                                                                              |
| Normalized JSON                 | Retain a project-owned, versioned normalization result internally. Users need not save, open or upload converted files. Prefer existing paged graph/text references to duplicate full-body JSON copies. |
| Account/model                   | Keep the existing own-account connection and model dropdown. Model choice affects only necessary AI requests. A fully local import must not require a connected account or available quota.             |
| Instructions                    | Never silently ignore or weaken instructions to obtain a local result. Arbitrary instructions require interpretation unless an exact supported local rule applies.                                      |
| Original content                | Copy original message/note bodies from retained files. Preserve identity, ordering and source occurrences; generated summaries are not imported original notes.                                         |
| Acceptance                      | Only Accept creates destination content, through the existing atomic manifest/commit owner. Summary counts come from exactly that manifest.                                                             |
| Partial results                 | Retain usable independent findings and explain omissions briefly. Missing AI work is not evidence that the input has no content.                                                                        |
| Re-Analyze                      | No inactive placeholder or general reanalysis action. Explicit interrupted-request recovery remains separate.                                                                                           |

File contents are data. Embedded instructions, URLs and local paths never become execution authority. Only the user's form instructions direct the import, within the supported extraction behavior.

## Intended processing path

```text
Submit
  → retain originals and inspect locally
  → known structures: deterministic extraction
  → unfamiliar structures: bounded AI mapping → deterministic extraction
  → semantic work, if needed: targeted AI interpretation → local validation
  → one normalized candidate set with original references
  → existing automatic choices and frozen summary
  → Accept → existing atomic commit → ordinary Chats / Research / Notes
```

These are internal phases, not user steps. A selection can contain all three kinds of work. A failure in one independent file must not erase another file's valid local result. Instructions that restrict the whole selection prevent presenting unfiltered local results as compliant with those instructions.

### 1. Local inspection and supported formats

Reuse the strict input readers, graph builder and bibliography normalization. Recognize structure from explicit fields and validated content, not filenames, source paths or the test project's topic. Preserve raw selected-branch semantics, alternate/rejected/internal records and original role/date precision. A collection or thread is not automatically one conversation; a message array without a provable envelope/order remains unresolved until a supported mapping establishes it.

Inspect the whole selected input within existing depth/value/text/record limits. Partition mixed structures before proposing mappings. Record selected-category coverage and reasons for exclusions. Parser failures or capacity limits produce bounded, actionable errors; there is no silent prefix truncation. Keep current native file limits and worker responsiveness/cancellation. No format expansion to PDF, archives, audio or images is required by this plan.

### 2. AI mapping as data

Define one small versioned mapping contract for unfamiliar structured JSON. It should express only the operations needed by the existing import destinations:

- Object-field paths and bounded array traversal with a defined current-item scope.
- Fields for conversation/message/source/note identity, labels, roles, literal bodies and explicit metadata.
- Parent/group keys and supported original ordering, including selection of an existing supported branch policy where applicable.
- A finite role-alias map and existing deterministic date/source normalization functions.

Use typed path segments or a similarly constrained representation. Do not introduce a general transformation language, arbitrary JSONPath expressions, model-authored regular expressions, JavaScript, `eval`, dynamic modules, shell commands or a plugin runtime. Reject unknown operators and unsafe object keys. No fetching external references or scanning directories.

Samples include structure, field types, collection sizes and bounded examples across first/last records and observed variants. Explain truncation explicitly. Group by compatible structure rather than blindly making one request per file or every N messages. File names and sampled values stay untrusted; instructions are separate. No manuscript or unrelated project context is added.

Bind each mapping to its sampled evidence, exact selected file hashes, relevant settings and contract version. Reuse it within the same import only after each target structure is admitted. No global learned-format registry is needed. Identical shape does not prove identical field meaning, so incompatible semantic roles or evidence require separate treatment.

TypeScript applies a valid mapping across all applicable records and validates every result. Sampling cannot establish full-file coverage. Missing keys, unexpected types, duplicate identities and broken parent links produce explicit omissions or failure of the affected mapping, not guessed values. Do not treat the model's confidence score as validation. Do not repeatedly send the entire file to repair an invalid mapping.

### 3. Targeted interpretation

Reserve content-level AI work for semantic selection instructions, ambiguous prose references, and irregular text/Markdown that cannot be handled by a supported local reader or mapping. Send only relevant records/ranges with stable original locators and necessary context. A source-only request may need conversation text as evidence, but must not create unselected conversation destinations.

Model output identifies existing records or exact original spans and relationships. TypeScript resolves spans against protected originals and performs normalization. For prose references, retain supporting spans and any unresolved fields; never invent an author, DOI, publication date or verification claim. Missing bibliographic fields are allowed when the existing source model supports them. Notes remain literal source text with honest origin/authorship, not generated notes disguised as user text.

Semantic conditions such as “only sources that support this argument” may require reading all relevant passages. Structural sampling alone is insufficient. Return matches, exclusions and unresolved coverage separately. If the interpretation cannot fit the supported budget, retain preparation and explain the limitation; do not import all locally recognized items while claiming to honor the condition.

### 4. One normalized result and one acceptance path

Extend the existing graph/review pipeline with explicitly typed evidence for **local reader**, **AI mapping applied locally**, and **AI interpretation**. The normalization result identifies its originals, parser/mapping version, settings, record/text locators, relationships and omissions. It must distinguish original fields from inferred labels. A local result has no fake AI attempt, completed request, provider digest or selected multipart proposal.

Use existing managed graph pages and protected text references wherever possible. If an additional JSON artifact is necessary, keep it bounded and project-owned, with a supported reader; avoid storing several equivalent copies of all transcript bodies. Keep originals and recovery history. Historical archive growth is not permission to delete earlier artifacts.

All evidence types feed the existing conservative automatic choices, source matching, summary and atomic acceptance. Preserve strong-identifier deduplication, multiple source occurrences, source-only origins, removed-source intent, notes, explicit older exclusions, repeat-import identity handling and immutable receipts. Review every consumer that currently assumes AI coverage, including accepted transcript/origin readers and later conversation context. Never bypass those checks by fabricating old-format evidence.

## UX, progress and usage

Setup keeps files, category choices, instructions, model, Cancel and Submit. Replace unconditional sharing copy with a short accurate statement such as: “Collie reads supported files locally and uses your selected ChatGPT model when interpretation is needed.” Keep the original-retention disclosure.

Local preparation is allowed without a connection. When Submit discovers necessary AI work without a usable account/model, retain preparation and show a contextual connection action. Do not silently omit that work or send after the user merely opens account management; returning and explicitly continuing supplies authority. A stored model preference is not a requirement for the zero-request route.

Processing uses concise labels such as Reading files, Understanding file structure, Extracting content and Preparing summary. Local progress uses measured file/record work where a denominator exists; otherwise show a working state. AI progress uses the full phase task denominator and labels processed structure/content tasks separately from the current run’s reserved request attempts and ceiling. It shows protected response activity and never counts local records as AI requests. A saved-attempt count includes reserved/not-sent and failed attempts; it is not a billed-request, token or account-usage count. Do not invent a percentage for an undiscovered total or mix phases into an arbitrary smooth progress bar. A short “Processed locally; no ChatGPT requests” completion note makes the zero-request path observable without a diagnostics dashboard.

Results keep actual conversation/message counts, total sources and notes for selected categories, plus one brief omission notice when relevant. Cancel returns to setup; Accept commits and closes. Do not add a list of every mapping decision or omitted record.

Use finite application-owned budgets, with one request in flight. Initial implementation defaults are **at most 8 mapping tasks per selection, and 8 mapping request attempts per explicit Submit/Continue** (normally one request per distinct unfamiliar structure) and **at most 32 targeted interpretation requests per explicit Submit/Continue**. Reuse tighter existing packet/wire/output limits until a separately justified change is made. The historical 1,024-attempt bound remains a storage/compatibility ceiling, not the new normal grant. These defaults are planning choices, not provider limits or user-facing settings.

If unusual semantic work exceeds one grant, pause with saved progress and one contextual Continue action for the next bounded portion. Never obtain another grant automatically. A mapping budget exhaustion must not start full-file AI recognition as a fallback. Known-format imports with no interpretation need do not encounter this budget flow. Preserve the current five-minute per-request and 90-second network-idle guards unless an observed failure justifies a separate change; no overall five-minute import deadline exists.

Collie currently has no documented integration for reading an account's remaining five-hour/weekly percentage. Do not add an undocumented endpoint, a paid inference probe, an invented estimate or a quota-reservation claim. Add a quiet Manage usage link using the existing safe external-navigation owner. OpenAI directs connected apps to [ChatGPT Usage settings](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions); users can set a [per-app weekly percentage cap](https://learn.chatgpt.com/docs/sign-in-with-chatgpt). Availability and settings stay provider-owned. No credit purchase, billing-route switch or automatic cheaper-model substitution is part of import.

## Recovery and compatibility

| Situation                       | Required behavior                                                                                                                                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Usage-limit refusal             | Pause further inference, retain successful local/AI work, explain that a plan or app limit was reported, and offer Manage usage. Do not invent the exhausted window or reset time.                                |
| Resume after quota is available | Explicit Continue may retry the specific quota-refused task as a new bounded attempt, then process pending work. Reuse successful mapping/extraction results; no whole-import restart or missing refused segment. |
| Temporary rate limit            | Preserve machine-readable reason and any supported retry timing; distinguish it from exhausted subscription allowance. Never spin in an unbounded retry loop.                                                     |
| Interrupted or unknown response | Reconcile/protect the exact old outcome first. Never assume no usage occurred or blindly replay an uncertain request.                                                                                             |
| Invalid mapping/interpretation  | Preserve the response and useful independent results; show a concise failure. No automatic repair chain and no promotion of invalid evidence.                                                                     |
| Cancel or restart               | Stop scheduling, retain preparation/findings and restore the same simple UI. Opening or copying grants no authority to send.                                                                                      |
| Accept available findings       | Show that the summary is partial. Accept finalizes that selection under the existing contract; further omitted material needs a new deduplicated import. Waiting to resume preserves the unfinished selection.    |
| Save or copy                    | Preserve new normalization/mapping evidence and old history through existing portable owners. Save is not Accept. Independent copies do not inherit a live inference grant.                                       |
| Older unfinished import         | Keep exact pending output/commit recovery and valid old summaries. Once settled, offer an explicit transition to the updated importer with retained files/settings; do not secretly convert or resend on open.    |
| Older accepted import           | Keep transcripts, Research origins, Notes, receipts, follow-up context and duplicate detection readable without recomputation or AI.                                                                              |

The current Continue selector deliberately excludes every previously attempted part. IH06 replaces that rule for newly typed, confirmed quota refusals only. Preserve old result-validation semantics and unknown-outcome safeguards. A generic HTTP 429 is not proof of a weekly limit; follow the [documented distinction](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery).

New persisted meanings require new versions, not changes to frozen validators, prompt bytes or digests. Allocate the smallest necessary schema/contract extensions in the stage that introduces their writer, then update portable admission, migration, Save/archive, independent-copy rekeying, retention and relevant provenance/context consumers together. Never ship a writer whose artifacts the app cannot reopen. Retain earlier-format readers and exact local recovery, without retaining their obsolete ordinary authoring UI.

## Existing implementation owners

| Owner                                                                                                                                                                                                                                                                                                    | Planned responsibility                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [graph.ts](src/worker/projects/import-readers/graph.ts), [json.ts](src/worker/projects/import-readers/json.ts), [import-graphs.ts](src/worker/projects/import-graphs.ts)                                                                                                                                 | Existing readers, original locators, bounded profiling and normalized graph construction; add constrained mapping application here or beside these readers. |
| [import-graph.ts](src/shared/import-graph.ts), [project-import.ts](src/shared/project-import.ts)                                                                                                                                                                                                         | Explicit local/mapping/interpretation evidence contracts and bounds; preserve historical graph readers.                                                     |
| [import-review.ts](src/worker/projects/import-review.ts), [import-automatic.ts](src/worker/projects/import-automatic.ts)                                                                                                                                                                                 | Remove mandatory AI-identification dependence for new local evidence; retain one automatic choice and summary owner.                                        |
| [import-commit.ts](src/worker/projects/import-commit.ts), [import-content.ts](src/worker/projects/import-content.ts), [import-identities.ts](src/worker/projects/import-identities.ts)                                                                                                                   | Same atomic acceptance, original text/source/note origins, strong-identity reuse and repeat-import behavior.                                                |
| [analysis-service.ts](src/main/imports/analysis-service.ts), [content-service.ts](src/main/ai/content-service.ts)                                                                                                                                                                                        | Scoped finite AI work, exact attempt protection/handoff and explicit continuation; no second job queue.                                                     |
| [import-partition.ts](src/worker/projects/import-partition.ts), [import-plans.ts](src/worker/projects/import-plans.ts)                                                                                                                                                                                   | Replace full-record recognition authoring with necessary mapping/interpretation work; retain required historical readers and result evidence.               |
| [ImportProvider.tsx](src/renderer/src/features/imports/ImportProvider.tsx), [useImportFlow.ts](src/renderer/src/features/imports/useImportFlow.ts), [ImportResults.tsx](src/renderer/src/features/imports/ImportResults.tsx), [ImportProgress.tsx](src/renderer/src/features/imports/ImportProgress.tsx) | Same retained form/results owner, local-only readiness, phase-appropriate progress and contextual recovery.                                                 |
| Shared account/model, workspace/draft and project lifecycle owners                                                                                                                                                                                                                                       | Keep account/catalog selection, safe links, dirty-editor protection, project-head refresh, native Save/close and recovery ownership.                        |

## Model recommendations and stage map

These settings are recommendations for the **coding assistant**, not defaults or restrictions for the user's import model. Use GPT-6.1 Sol for most stages; Astra is recommended for the first evidence/compatibility boundary. High effort is justified by durable-data and cross-layer work; final presentation/cleanup uses Medium. No Max/Ultra or delegated-agent workflow is required. This is a planning judgment informed by [current OpenAI model guidance](https://learn.chatgpt.com/docs/models), consulted October 10, 2026; actual model availability remains account-dependent.

Implement only the stage Josh requests. Each stage has a concrete boundary and stops with its handoff. Stages do not imply acceptance of earlier user tests.

| Stage | Deliverable                                                             | Depends on               | Recommended coding model | Effort |
| ----- | ----------------------------------------------------------------------- | ------------------------ | ------------------------ | ------ |
| IH01  | Durable normalized evidence that does not require an AI result          | Current IM/IU foundation | GPT-6 Astra              | High   |
| IH02  | Complete local import for recognized files through the normal UI        | IH01                     | GPT-6.1 Sol              | High   |
| IH03  | Constrained mapping contract, structure profiling and local interpreter | IH01–IH02                | GPT-6.1 Sol              | High   |
| IH04  | AI structure discovery wired into the same import flow                  | IH03                     | GPT-6.1 Sol              | High   |
| IH05  | Targeted semantic extraction and instruction handling                   | IH04                     | GPT-6.1 Sol              | High   |
| IH06  | Quota-aware pause/resume and old-import transition                      | IH05                     | GPT-6.1 Sol              | High   |
| IH07  | Integrated polish, final code cleanup and user acceptance handoff       | IH06                     | GPT-6.1 Sol              | Medium |

### IH01 — Make deterministic extraction valid import evidence

**Status:** implementation complete — awaiting user testing. **Model: GPT-6 Astra | Effort: High.**

Implemented October 10, 2026: local evidence v1, review/manifest v3 and schema/minimum reader 33. Required format, lint and node/web typechecks passed cleanly. See the [record](docs/validation/import-IH01.md), [contract](docs/formats/import-local-evidence-v1.md) and [user guide](docs/manual-testing/import-IH01.md). Ordinary Submit switches to the local route in IH02; no native/provider acceptance is inferred.

**Outcome:** locally validated candidates can prepare the same exact summary/manifest without a provider attempt.

1. Trace the graph → review → automatic choices → manifest → commit → transcript/origin/context assumptions. Define the smallest versioned evidence discriminator and normalized result that removes mandatory AI recognition while preserving original-file checks.
2. Implement the deterministic preparation writer using existing recognized-reader output and current categories. Store exact parser/settings/original hashes, complete record/text references, relationships, coverage and omissions. Reuse paged artifacts; do not duplicate transcript bodies merely to create a new JSON file.
3. Adapt review/automatic preparation and acceptance admission to this new evidence. Empty, already-present, partial and ready summaries retain their distinct meanings. Local success cannot be represented as a fake completed AI request.
4. Implement all affected migration, portable validation, Save/copy/retention and accepted-origin/context readers alongside the writer. Keep earlier capture/proposal validators unchanged.
5. Document the evidence contract and its limits in one focused format document. Do not create a generic import framework or a separate storage manager.

**Primary owners:** graph/shared contracts, worker review/automatic/commit and affected portable consumers.

**Completion bar:** a complete local candidate set is sufficient for an exact committable manifest; original text and relationship validation still apply. No new visible local route is claimed until IH02.

**Cleanup:** remove duplicated new/old preparation logic where a shared owner suffices. Keep the current authoring route until IH02 replaces its callers; identify exact legacy readers still required.

**User handoff:** explain the backend boundary. In a disposable existing project, normal open/read/Save should preserve previously imported content. Do not request hidden commands or a testing-only UI to exercise the new worker writer.

### IH02 — Deliver the complete local path for known formats

**Status:** implementation complete — awaiting user testing. See the [IH02 record](docs/validation/import-IH02.md) and [user guide](docs/manual-testing/import-IH02.md). **Model: GPT-6.1 Sol | Effort: High.**

**Outcome:** supported structured imports reach summary and Accept with zero AI calls when interpretation is unnecessary.

1. Route Submit through local classification/extraction and IH01 preparation before any inference planning. Reuse raw/curated conversation, bibliography and literal-note readers; cover multi-file/mixed known inputs and all category combinations.
2. Decouple local readiness from ChatGPT authentication/catalog/quota. Keep the model field, but explain its relevance only when AI is needed. Unsupported structure or nonempty instructions needing interpretation retain the selection with a clear temporary limitation until IH04/IH05; never silently ignore instructions or secretly invoke the old full-file recognition path.
3. Preserve exact transcript bodies, ordering, source occurrences, rejected/internal treatment, source-only origins and ordinary deduplication. Apply existing title fallbacks without inventing bibliographic facts.
4. Wire the same summary/Accept/Cancel and draft/head-refresh owners. Show honest local processing and a small zero-request completion note. Accept, not local extraction or project Save, creates destination records.
5. Retain local preparation across cancellation/dismissal and repeated Submit. Resolve the same saved command/summary instead of repeating writes or creating duplicate records.

**Primary owners:** ImportProvider/useImportFlow/progress, local graph readers, review/automatic/commit.

**Completion bar:** a recognized conversation JSON without semantic instructions can be imported while ChatGPT is disconnected, then found in Chats/Research and retained by Save/reopen. Provider/visual acceptance remains user-owned.

**Cleanup:** remove unconditional AI readiness and mandatory analysis-plan creation from this new route. Keep historical recovery and clearly bounded not-yet-replaced helpers, not a hidden second normal importer.

**User handoff:** on a disposable project, import the user's real conversation export with conversations/sources and blank instructions; expect no ChatGPT requests, a useful summary and normal Accept. Repeat while disconnected, then inspect original history, supported source origins and Save/reopen. Also try suitable Notes-only/bibliography inputs and duplicate selection; no fixed sample counts are asserted.

### IH03 — Build the small mapping interpreter

**Status:** implementation complete — awaiting user testing. See the [IH03 record](docs/validation/import-IH03.md), [mapping contract](docs/formats/import-mapping-v1.md) and [user guide](docs/manual-testing/import-IH03.md). **Model: GPT-6.1 Sol | Effort: High.**

**Outcome:** a validated declarative mapping can convert unfamiliar structured data to the same normalized candidates entirely in TypeScript.

1. Add bounded whole-file structure profiling, variant grouping and representative sample selection. Keep original locators and mark omitted sample content; avoid copying giant arrays into prompts.
2. Implement the constrained mapping shape and interpreter described above. Support current-item field paths, nested arrays, grouping/parent identity, original order, role aliases and existing metadata normalization. No arbitrary code or programmable expression engine.
3. Validate mappings and their applicability to every traversed record, including heterogeneous arrays and optional fields. Preserve original IDs and derive stable namespaced identities only when IDs are absent. Unproven group/order or ambiguous links remain unresolved.
4. Produce IH01 normalized candidates and evidence linking mapping fields to exact originals. Handle cross-file references only among selected, admitted originals with proven identity; never follow an embedded path or URL.
5. Version/retain mapping artifacts with the affected portable readers in this stage. Support bounded cancellation, worker scheduling and input limits. Mapping reuse remains within the import.

**Primary owners:** import-readers, graph construction, focused shared mapping contract and artifact readers.

**Completion bar:** the interpreter has a finite operation set and cannot accept model-generated executable logic; normalized records retain exact source evidence. No AI discovery UI is claimed yet.

**Cleanup:** share known-reader normalization utilities instead of copying a second metadata or provenance implementation. Remove unused experimental transformation helpers introduced during the stage.

**User handoff:** identify this as an internal prerequisite. Known-format imports from IH02 should remain unchanged; unfamiliar mapping acceptance is exercised through IH04, without asking the user to author mapping JSON or run developer scripts.

### IH04 — Ask ChatGPT to understand unfamiliar structure

**Status:** implementation complete — awaiting user testing. See the [IH04 record](docs/validation/import-IH04.md), [discovery contract](docs/formats/import-discovery-v1.md) and [user guide](docs/manual-testing/import-IH04.md). **Model: GPT-6.1 Sol | Effort: High.**

**Outcome:** an unfamiliar but regular JSON file can be mapped once, fully extracted locally and imported through the existing simple flow.

1. Add a distinct versioned mapping request/output contract to the existing own-account execution/capture/protection owner. Send IH03 profiles, bounded examples and relevant instructions; require only mapping data in the response.
2. Bind Submit's selected files/settings/account/model to a finite discovery plan. Count unique mapping needs, use the actual dropdown model, and issue at most one request per admitted structure group within the mapping budget. Do not ask the model to return all records.
3. Protect terminal output, validate the mapping and apply IH03 across the entire input. Store validation/coverage and source references. A bad mapping does not invalidate independent local findings, create invented content or trigger an automatic repair request.
4. Integrate mapping progress and contextual connection handling. An unchanged saved valid mapping is reused without another inference request. Failed/incomplete mapping has a specific reason and a bounded explicit recovery path, not an empty-success claim.
5. Update all affected execution/binding/framing/portable contract readers without changing older request bytes or their validation outcomes. Preserve cancellation before dispatch and no-send-on-reopen behavior.

**Primary owners:** main import/AI content coordination, shared mapping request contracts, worker mapping evidence and retained renderer flow.

**Completion bar:** AI usage scales with unfamiliar structures for mapping work, not with message count; TypeScript extracts all admitted records and relationships. A known file alongside an unknown file does not get sent through AI recognition again.

**Cleanup:** remove new-import routing to the old per-record recognition prompt/partitioner wherever mapping/local extraction now owns the work. Keep frozen historical validators and pending-outcome recovery.

**User handoff:** use a real unfamiliar supported JSON export in a disposable project, optionally alongside a known export. Expect bounded Understanding file structure activity, then local extraction and a normal summary. Inspect early/late records, original bodies, grouping and links; repeat unchanged Submit to confirm saved findings are reused. No mapping editor or per-message choices should appear.

### IH05 — Limit content-level AI to semantic work

**Status:** implementation complete — awaiting user testing. See the [IH05 record](docs/validation/import-IH05.md), [semantic contract](docs/formats/import-semantic-v1.md) and [user guide](docs/manual-testing/import-IH05.md). **Model: GPT-6.1 Sol | Effort: High.**

**Outcome:** prose extraction and additional instructions work without requiring AI to rewrite structured conversations.

1. Classify requested work into existing local operations versus semantic interpretation. Unknown/nonempty instructions cannot be ignored; interpret them through a bounded request when local semantics are not exact. A request that combines schema discovery and instruction interpretation may share one packet only when both validated outputs are explicit.
2. Implement bounded text/Markdown and embedded-prose extraction with original record/range references. Keep structured source metadata local; inspect prose that could add requested sources rather than skipping all prose merely because some metadata exists.
3. Implement instruction-driven selection over relevant original records/ranges. Cover all material needed for the semantic condition or mark it unresolved. Do not infer whole-file compliance from sampled rows or silently include unfiltered items.
4. Resolve extraction spans locally, validate candidate metadata and relationship evidence, and merge results through IH01 automatic choices. Preserve literal notes and original transcript bodies. Incomplete source facts remain incomplete; no web verification/fetch is added.
5. Plan only necessary requests, respect the targeted-work budget and retain local results between grants. Present concise partial/failed outcomes. Additional instructions cannot broaden execution authority beyond import or selected content.

**Primary owners:** targeted request planning and validators, graph/text readers, source/note normalization, existing automatic review and UI flow.

**Completion bar:** structured copying is local; semantic work receives enough relevant context to make its decision; unsupported meaning or missing coverage is disclosed. Selecting Sources can find explicit prose references while retaining their original conversation/message origins.

**Cleanup:** remove any remaining new-import dependence on full-file AI recognition and duplicate parsing/field-copying. Use focused new contracts instead of repurposing the frozen multipart validator.

**Implemented limits:** complete-context instruction selection admits at most 128 destination candidates and 50,000 packet characters including metadata. Unsupported/unread context, unknown JSON plus instructions, and rewriting/generation receive explicit unresolved limits with no unfiltered candidates. Prose interpretation uses 24,000-unit ranges with 512 overlap and at most 32 unread tasks per explicit grant; valid original spans feed automatic review/Accept. Confirmed quota retry, early partial-finalization and legacy transitions remain IH06.

**User handoff:** import suitable real Markdown/prose and a structured export containing inline references. Try an instruction that excludes a recognizable subset; expect it honored or an explicit limitation. Inspect source origins and unchanged literal text. Compare the normal blank-instruction structured path, which should remain local unless requested content genuinely needs interpretation.

### IH06 — Resume quota interruptions without losing or repeating work

**Status:** implementation complete — awaiting user testing. See the [IH06 record](docs/validation/import-IH06.md), [recovery contract](docs/formats/import-recovery-v1.md) and [user guide](docs/manual-testing/import-IH06.md). **Model: GPT-6.1 Sol | Effort: High.**

**Outcome:** quota pauses, app restarts and older unfinished imports remain understandable and recoverable within the same UI.

1. Distinguish confirmed quota refusal, temporary rate limits, unknown transport outcomes, invalid output and local protection failures. Preserve the actual structured reason; do not identify a five-hour/weekly/app window without evidence.
2. Add explicit continuation of a confirmed quota-refused mapping/semantic task with a new attempt identity, within finite retry/batch limits. Keep successful results immutable and selected until any replacement is valid. Reconcile/protect uncertain old operations before retry eligibility; no automatic retry loop or successful-task resend.
3. Preserve progress through Save/reopen/copy, with no copied execution grant. Revalidate account/model/scope and exact remaining work on Continue. A different model is an explicit user choice, not a silent fallback.
4. Add the small Manage usage link in setup and usage-limit recovery through the safe external-link owner. Keep spending settings provider-owned; do not add a speculative quota API or misleading usage meter.
5. Support old ready summaries and exact pending commit/output recovery. After settlement, explicitly transition an old unfinished selection to the new importer using retained files/settings and a new evidence revision. Preserve older manual choices, originals and receipts; no picker repetition merely to recover already retained files.
6. State partial-Accept finalization clearly in recovery. A user who wants to finish the same selection later should keep it paused rather than unknowingly finalize it. Normal successful imports still have no extra step.

**Primary owners:** main import/AI coordination, scoped attempt selection and retained recovery, account usage link, compatibility readers and Import flow.

**Completion bar:** a quota-refused segment cannot disappear from Continue, and successful work is not charged again through a full restart. Unknown outcomes remain separate. Old accepted projects and ready summaries remain readable/usable.

**Cleanup:** remove obsolete failed-part recovery branches and ordinary legacy continuation authoring once the new transition owns them. Retain exactly the old decoders, validators, reconciliation and receipt readers needed by real saved states.

**User handoff:** use a real interrupted selection or naturally encountered limit, if available; do not exhaust allowance deliberately. Expect a clear pause, preserved findings, Manage usage, and explicit continuation after availability returns. Reopen a disposable older project to inspect saved content and transition settled unfinished work. If no limit occurs, record quota recovery as unverified.

### IH07 — Finish integration and remove unused import code

**Status:** implementation complete — awaiting user testing. See the [IH07 record](docs/validation/import-IH07.md) and [integrated user guide](docs/manual-testing/import-IH07.md). **Model: GPT-6.1 Sol | Effort: Medium.**

**Outcome:** one simple importer uses the least necessary AI work, with coherent progress and no unused replacement code left behind.

1. Review the complete route matrix in source: local, mapped, semantic, mixed, disconnected, partial, duplicated, cancelled, quota-paused, reopened and legacy. Resolve integration gaps without adding a new workflow surface.
2. Finish compact layout, responsive wrapping, keyboard/focus behavior, reduced motion and concise announcements. Keep phase-specific denominators and the existing stable header/footer. No raw JSON/prompt/part dashboard or misleading account-usage percentage.
3. Trace all superseded imports, exports, commands, IPC/preload registrations, dynamic consumers, styles and dependencies. Remove unused original/multipart-recognition authoring code and transitional replacement helpers. Keep the minimum identified compatibility/recovery readers and shared owners used elsewhere.
4. Update active format/architecture documentation and plan/checkpoint links. Keep dated IM/IU history clearly historical, and identify concrete remaining compatibility obligations. Do not create a separate audit system.
5. Produce one integrated manual guide and acceptance record that covers all requested categories and routes, including the user's real large JSON example. Record zero-request known-format behavior and actual request counts as user observations, not assistant benchmarks or promised percentage savings.

**Primary owners:** integrated import renderer/main/worker path, active documentation and import-only dependencies.

**Completion bar:** no new import needs the legacy per-record recognition path; the approved short UX remains intact; every retained legacy component has a concrete reader/recovery purpose; all required code checks are clean. Runtime acceptance remains pending until Josh reports it.

**Cleanup:** final cross-layer deletion is mandatory, including leftovers identified in IH01–IH06. Passing typecheck alone does not prove code is unused. Historical tests and user/project data remain untouched.

**User handoff:** use the integrated walkthrough below, report actual errors/omissions/request counts and stop for observations. No release readiness is inferred.

## Cleanup rules for every stage

Cleanup is part of each implementation stage, with IH07 owning the final pass. Remove unused components, hooks, handlers, styles, helpers, types, authoring routes, registrations and import-only dependencies as their callers disappear. Do not leave old functionality behind hidden controls, flags, commented-out code or speculative wrappers. Reuse existing account, draft, storage, graph, review and commit owners.

Establish disuse through ordinary source/reference and Git inspection, including dynamic loading, side effects and persisted-format obligations. Retain the smallest necessary historical reader/reconciliation path; name its concrete purpose in the stage record. If a removal depends on a later stage, name that stage and close the dependency by IH07. Do not delete frozen validators merely because their normal authoring path is gone.

Do not delete originals, user projects, recovery records, saved results, retained working copies or history as code cleanup. Do not rewrite historical test code, vendor files or generated artifacts. No new tests, audit scripts, fixtures, mocks, fault injection, benchmarks or testing-only hooks are authorized.

## Integrated user-owned walkthrough

1. **Known structured conversation export:** use a disposable project and the user's real conversation JSON, conversations/sources selected, blank instructions. Expect local processing without ChatGPT requests when the selected data is fully supported. Accept, inspect early/late messages and supported source origins, then Save/reopen. No sample counts are hard-coded.
2. **Disconnected local import:** use suitable known-format conversation, bibliography and literal-note inputs without an active AI connection. Expect local work to succeed; unsupported/semantic work asks for the connection contextually without losing setup.
3. **Unfamiliar structured JSON:** use a real export with different field names/nesting. Expect a small mapping phase followed by local extraction across the full file. Inspect identity, order and links beyond the sampled records; model success is not assumed.
4. **Semantic extraction/instructions:** import prose and try a meaningful inclusion/exclusion instruction. Expect literal original content, supported source facts and relationships, or a concise omission/limitation. No generated body is presented as an original note or message.
5. **Mixed files and duplicates:** combine suitable known and unfamiliar files; repeat an accepted original in another selection. Expect independent valid findings, preserved multiple source origins and no duplicate accepted identities or overwritten Research metadata.
6. **Interruption and recovery:** Cancel during normal work and reopen later. Expect retained results with no automatic send. If quota or a temporary limit occurs naturally, expect a clear pause and deliberate resumption of unfinished/refused work without repeating successful requests. Do not induce exhaustion or failures for this exercise.
7. **Older projects and layout:** open disposable older accepted/unfinished import projects; inspect existing work and recovery. At narrow width/200% zoom, use keyboard navigation and reduced motion. Expect readable phases, accurate summary totals and reachable Cancel/Accept without technical screens.

The reference file is `/Users/joshlevy/Desktop/Cultural Analysis App/api/data/conversations/cultural-analysis/cultural-analysis.conversation.json`. It is user-owned manual input only, not a fixture, hard-coded path, automatic import or a file this plan authorizes modifying. Additional real examples should guide reader improvements after observed omissions, without expanding this revision into universal document conversion.

## Stage workflow and completion ledger

For each implementing stage, read this plan and the applicable source/checkpoints, implement only that stage, and create a concise record at `docs/validation/import-IHxx.md` and user guide at `docs/manual-testing/import-IHxx.md`. Update durable format documentation only when the contract changes. Use source inspection for implementation decisions; do not represent it as passed runtime testing.

After code changes, inspect script/ignore scope and run **`npm run format` → `npm run lint` → `npm run typecheck`** with the repository's pinned toolchain. Fix all errors and warnings, including pre-existing findings surfaced by these checks. No automated tests, builds, app launches, runtime verification, browser automation, screenshots, benchmarks or substitute testing scripts. Documentation-only work needs no code checks.

At each handoff, state actual command outcomes separately from **implementation complete — awaiting user testing**. Give concise ordered actions with observable expectations, name meaningful cleanup and retained compatibility, state what remains unverified, then stop. Backend-only stages must not claim a new visible feature or require testing-only hooks. Preserve prior uncommitted work. Stage requests do not establish user acceptance or authorize subsequent stages.

| Stage | Implementation                                 | Required code checks                    | User acceptance          |
| ----- | ---------------------------------------------- | --------------------------------------- | ------------------------ |
| Plan  | Complete, October 10, 2026; documentation only | Not required; not run                   | Awaiting document review |
| IH01  | Implementation complete, October 10, 2026      | Format, lint, node/web typechecks clean | Awaiting user testing    |
| IH02  | Implementation complete, October 10, 2026      | Format, lint, node/web typechecks clean | Awaiting user testing    |
| IH03  | Implementation complete, October 11, 2026      | Format, lint, node/web typechecks clean | Awaiting user testing    |
| IH04  | Implementation complete, October 11, 2026      | Format, lint, node/web typechecks clean | Awaiting user testing    |
| IH05  | Implementation complete, October 11, 2026      | Format, lint, node/web typechecks clean | Awaiting user testing    |
| IH06  | Implementation complete, October 11, 2026      | Format, lint, node/web typechecks clean | Awaiting user testing    |
| IH07  | Implementation complete, October 11, 2026      | Format, lint, node/web typechecks clean | Awaiting user testing    |

Deferred: arbitrary executable mappings, global format-learning services, new upload formats, exported conversion-file workflows, active Re-Analyze, web enrichment/verification, automatic inference repair, unsupported account-usage APIs and unrelated architecture changes. Existing commercial/installed/release gates remain unresolved; this plan does not change release status.
