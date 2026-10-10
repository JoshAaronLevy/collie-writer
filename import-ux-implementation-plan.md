# Import UX revision implementation plan

## Status and purpose

October 10, 2026 — **IU01–IU05 implementation complete — awaiting user testing.** Josh's first reported import walkthrough exposed an unacceptable experience: too many steps, technical controls, long explanations and individual decisions, with no obvious way to finish. The seven supplied screenshots and his description are user acceptance evidence of that UX failure. They do not establish the cause of the unsuccessful analysis shown in the screenshots, or prove that an import committed successfully.

This plan replaces the interaction design and review requirements in [import-implementation-plan.md](import-implementation-plan.md). IM01–IM12 remain the implementation history and storage foundation; their implementation status does not mean their UX was accepted. This is a revision of the existing importer, not another import system. Josh explicitly requested each stage through IU05. The ordinary path now includes compact setup/model choice, one Submit, automatic preparation, the short summary and atomic Accept. Older unfinished work uses the same flow. Integrated focus, announcements, layout and cleanup are implemented; judge the complete experience using the [final user guide](docs/manual-testing/import-IU05.md) and [acceptance record](docs/validation/import-IU05.md). No user acceptance is inferred.

**The product promise: choose files, choose what to import, optionally add instructions, choose a model, Submit, read a short summary, Accept.** Collie handles preparation and reasonable import decisions. Users inspect or edit the imported content in ordinary Chats, Research and Notes afterward.

Josh explicitly prefers a useful, straightforward import that misses some material over a cumbersome process that requires near-perfect coverage. His 90–95% versus 98–100% comparison expresses that priority; it is not a measured success rate or a numerical release requirement. Correctly preserve what is imported, make obvious omissions understandable, and improve extraction later in response to actual examples. Do not make the user resolve every ambiguity first.

## Product decisions and superseded requirements

The requested behavior comes from the October 10 request; the defaults and edge-case behavior below are this plan's implementation recommendations. Routine implementation does not need another product-decision or approval stage.

| Decision           | Required result                                                                                                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two simple modals  | One setup modal, with processing shown in place, followed by one results modal. Never stack import dialogs.                                                                                               |
| Setup controls     | Files, three content checkboxes, optional instructions, model dropdown, Cancel and Submit.                                                                                                                |
| Categories         | **AI conversations**, **Sources**, **Notes**, independently selectable. At least one is required; a fresh form starts with none selected so the user states their intent.                                 |
| Submission         | Submit authorizes analysis of that selection with the displayed account/model. Local inspection, request preparation and finite sequential processing happen automatically.                               |
| Results            | Show the number of conversations, each conversation's title and message count, the total sources, and the total notes when selected. No message-by-message decisions.                                     |
| Results actions    | **Cancel**, **Re-Analyze**, **Accept**. Re-Analyze is visibly disabled with an accessible “Coming later” explanation; it has no action or network handler.                                                |
| Cancel results     | Return to the populated setup form without accepting anything. Keep protected results so an unchanged Submit can show the same summary without another AI request.                                        |
| Accept             | Add the displayed findings in one existing atomic import operation, close the modal on confirmed success, refresh the normal destinations and show a brief success notice.                                |
| Best effort        | Automatically include supported, sound findings; automatically omit unsupported or unresolved material and handle clear duplicates. The user never fills out exclusion reasons or duplicate-review forms. |
| Relationships      | Preserve conversation/message/source/note origins wherever supported. Source-only imports keep their original conversation references without creating unchecked conversation destinations.               |
| Model choice       | Use the connected account's actual model catalog directly in setup. Keep the existing account owner and preference; no trip to Settings for ordinary model changes.                                       |
| Improvements later | Defer active reanalysis, file-reformatting assistants, new file formats, broad extractor redesign and item-level import editing.                                                                          |

The old requirements for local preview before analysis, a sharing checkbox, manual request ceilings, part-by-part controls, individual Include/Exclude decisions, warning acknowledgments, duplicate decisions, correction forms and a separate Prepare confirmation action are superseded. Their necessary internal work becomes automatic. Hiding the old screens behind an “Advanced” accordion does not meet this plan.

The durable protections still matter: retained originals, truthful provenance, valid data, existing account ownership, finite requests, no automatic inference retries and one atomic acceptance. They are implementation responsibilities. They do not justify extra routine screens, consent steps or technical text.

## The experience to build

### Setup modal: “Import into project”

Show the project name as a quiet subtitle. Use a compact file chooser with **Add files** and removable filename rows. Adding files again accumulates the selection. Show only selected files; removed files and retained history do not remain in this list. A short helper names supported formats: JSON, text/Markdown, CSL-JSON, BibTeX and RIS. Native multi-file selection is sufficient for this revision; drag-and-drop is not a prerequisite.

Below it, show the three category checkboxes, an **Additional instructions (optional)** textarea and a **Model** dropdown. Instructions can be blank. A suitable placeholder is “Anything Collie should focus on or leave out?” The dropdown displays readable catalog names and initially uses the account's saved valid model. No effort, request-budget, branch or raw-payload controls belong here.

Keep one brief retention line near file selection, visible before files are chosen: “Selected originals are kept in this project, including content you don't import.” Near Submit, explain sharing once: “Submit sends the selected file content and your instructions to your connected ChatGPT account. Large selections may use several requests.” This is sufficient routine disclosure; no separate authorization screen or checkbox.

```text
Import into project                                  ×
Project name

Files                                  [Add files]
  conversations.json                              ×
  references.bib                                  ×
Selected originals are kept in this project,
including content you don't import.

Import
  [ ] AI conversations   [ ] Sources   [ ] Notes

Additional instructions (optional)
  [                                                  ]

Model  [Current account model                      ▾]

Submit sends the selected file content and your
instructions to your connected ChatGPT account.
Large selections may use several requests.

                                  [Cancel] [Submit]
```

This wireframe specifies hierarchy, not final typography or a pixel-perfect design. Use existing Mantine controls, app tokens and semantic feature CSS. Keep normal-sized text, restrained spacing and one primary action. Avoid large outlined buttons for every secondary control.

Submit is available when files are protected, at least one category is selected, instructions fit the existing bound, the project is writable and the selected account/model is ready. Explain an actual blocking condition beside the relevant field. If disconnected, offer the existing **Connect ChatGPT** or **Manage ChatGPT** action in context and return to the same form afterward. Do not render the full account-management panel inside Import.

Setup **Cancel** closes the modal without analysis or acceptance and retains the form for reopening. Reopening a completed import starts a fresh form; completed file lists do not reappear as unchecked inventory.

### Processing: a state of the setup modal

Submit changes the existing modal to a compact processing view. Use a spinner or real progress indicator with simple text such as **Preparing files…**, **Analyzing with ChatGPT…**, then **Preparing your import…**. Show determinate progress only when supported by real completed work; otherwise remain indeterminate. There is no technical parts list, raw prompt, packet viewer or second progress-review dialog.

Keep a **Cancel** action while preparation/analysis is running. It stops further dispatch, requests cancellation of the current request and returns to the retained form once local state is safely settled. Briefly show **Stopping…** if needed. Do not claim a remote request was undone or that account usage was reversed. Completed protected work remains available.

After analysis and automatic preparation succeed, transition directly to the results modal. The user does not click Review, Prepare, Continue to summary or any equivalent step in a normal successful import.

### Results modal: “Ready to import”

The summary comes from the exact prepared import, not model-written totals, selected-file counts, fragment counts or only the first page of a result list. Show only requested categories, including a zero result when relevant.

```text
Ready to import                                      ×

3 conversations
  Conversation title                         24 messages
  Another title                              18 messages
  A third title                               9 messages

42 sources

                  [Cancel] [Re-Analyze] [Accept]
                              Coming later
```

The example counts are illustrative and must never be production constants. For Notes, add one “N notes” line. The conversation list contains titles and message counts only. If long, it scrolls within the modal body; the footer remains reachable. There are no review tabs, item checkboxes, edit forms or separate confirmation screen.

Normally the summary needs no other explanation. When there is a material omission, add one short, specific sentence, for example “Some messages couldn't be read and were left out.” Name an affected file when an entire file could not be used. Keep detailed reasons in the retained implementation record; do not add a Details panel, issue browser or per-item actions to this modal. Routine deduplication is not an error banner.

Sources are counted once per canonical destination, including sources linked to an existing Research entry. If that would otherwise mislead, use a compact suffix such as “42 sources · 8 already in Research.” Each new conversation's message count is the number actually prepared for that conversation. Existing conversations skipped as duplicates do not inflate the new-conversation total.

**Cancel** returns to setup with files, categories, instructions and model intact. It writes no accepted domain content. The close icon and Escape follow Cancel in either idle modal. An unchanged Submit reopens the retained summary without inference; changing files, categories or instructions creates a new analysis intent on the next Submit. As implemented in IU04, an account/model preference change preserves saved findings; the selected model binds the next explicit provider submission or continuation. It does not itself reanalyze existing results. Ordinary edited submission does not implement the deferred Re-Analyze action.

**Accept** is the only action that creates accepted content. While the write is in flight, show **Importing…**, prevent double acceptance and temporarily prevent dismissal. If the outcome becomes unknown, retain the exact operation and allow dismissal/reopening of its recovery state; do not trap the user indefinitely or imply that closing canceled a potentially committed import. On confirmed success, close the modal, preserve the user's current workspace destination and show a short notice such as “Imported 3 conversations and 34 new sources.” Do not add a third completion/report modal or navigate away automatically. The imported items are available in the ordinary AI conversation pane, Research and Notes.

### Visual and accessibility requirements

- Aim for a roughly 36–40rem dialog at normal desktop sizes, capped by the viewport. Keep setup compact for an ordinary one-to-three-file selection; do not shrink text to avoid scrolling.
- Use one modal-body scrolling region with a stable action footer. Avoid the nested scroll boxes and oversized text seen in the screenshots. Longer lists grow that body rather than creating an unbounded page.
- Use existing colors, spacing, radii and bundled semantic icons. The remove-file control has an accessible name containing the filename; every field has a visible label.
- Keep keyboard focus contained, announce progress and errors, respect reduced motion, support narrow windows and 200% zoom, and keep footer actions reachable. No Enter-to-submit while the instructions field is composing text.
- Use the existing after-exit transfer and guarded focus return. Processing and summary transitions cannot steal focus after the user has moved to a different scope or destination.

## Automatic import policy

The policy is deliberately modest. It should make ordinary files useful without a new agent framework, an extraction-confidence dashboard or a configurable rules engine.

| Material or condition                | Automatic behavior                                                                                                                                                                                                                                                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clear conversation and messages      | Include the conversation and eligible messages together. Keep original roles, order, text and timestamps; consecutive messages with the same role stay separate. Never manufacture native AI attempts.                                                                                                               |
| Conversation branches                | Prefer the full export's selected parent chain. Use a curated thread or explicit ordered representation when no full selected-path representation exists. Never concatenate branches or choose identity by filename alone.                                                                                           |
| Several representations              | Use one coherent representation per conversation, with stable precedence: full selected-path export, then curated thread, then an unambiguous ordered array. Preserve all originals and compatible source occurrences. Skip a genuinely conflicting identity group rather than make the user adjudicate it.          |
| Missing title or incidental metadata | Supply a modest display title from supported evidence, or a neutral fallback. Retain available metadata. Missing optional metadata or an unknown extra field does not require acknowledgment or block an otherwise usable record.                                                                                    |
| Sources                              | Use existing normalization. Reuse a unique compatible active canonical source by strong identifiers; consolidate compatible duplicates in the selection. Keep each supported originating conversation/message occurrence even when several occurrences share one destination. Never merge on title similarity alone. |
| Conflicting or removed source        | Preserve the existing Research record and removal intent. Omit an incompatible or unresolved source candidate, without overwriting metadata, restoring a removed record or blocking unrelated conversations.                                                                                                         |
| Rejected/search/internal records     | Preserve original occurrence decisions. Rejected-only sources and unsupported search/image/widget records do not become active Research. Internal reasoning and system/developer execution instructions do not become ordinary chat messages or analysis instructions.                                               |
| Notes                                | Import supported literal note bodies and original labels, with truthful imported authorship. Do not turn a model summary into an alleged original note.                                                                                                                                                              |
| Unchecked category                   | Create no destinations in that category. Preserve file-level and message-level origins where available; a source-only import does not silently create chats.                                                                                                                                                         |
| Exact prior import                   | Skip already accepted identical material. A changed original identity does not overwrite or append to an existing imported conversation. Include unrelated new material.                                                                                                                                             |
| Partial usable result                | Include valid findings whose required text, identity and relationships are established; skip unresolved findings and their necessary dependent records. A skipped source need not discard its otherwise valid conversation. Mention material omissions briefly.                                                      |
| Nothing usable                       | Show a simple “Nothing to import” result and one useful reason. Accept stays disabled; Cancel returns to the form. Do not call a wholly failed analysis a successful empty import.                                                                                                                                   |
| Everything already present           | Say “This content is already in your project.” Accept stays disabled when there are no new destinations or origins to add. Cancel returns to setup. No duplicate-only success ceremony is required.                                                                                                                  |

Preserve useful complete originals even when ancillary analysis coverage is imperfect. The current all-fragments-identified condition must be examined in IU01: a completely available, structurally sound original can be eligible when its essential identity, role, order, text and membership are established and the protected analysis supports its inclusion. Missing acknowledgments for unrelated metadata must not exclude a whole conversation. Record this as a versioned policy change where necessary; do not bypass validation or treat a partial body as complete. Where essential evidence is genuinely missing, omit the affected material.

The existing readers and bounded ChatGPT proposal route remain the starting point. Their current prompt classifies supplied records and permits limited field suggestions; it is not a general-purpose converter that extracts any imaginable source from arbitrary prose. This revision must deliver the simple workflow on the supported inputs without claiming broader extraction. Do not add a preprocessing/reformatting AI pass, broaden file formats or build a replacement extractor to chase theoretical completeness. If actual user examples show missing sources or notes, record the example and improve the narrow mapping later. Failures that prevent the normal supported import from producing any usable result are defects to fix, not acceptable “best effort.”

Automatic preparation must not forge human review. Existing `acknowledged` fields and explicit per-item revisions describe the old workflow. Add the smallest versioned automatic-preparation policy/command needed to record system decisions honestly. Accept approves the complete displayed prepared result, including its disclosed omissions. It does not assert that the user inspected every message, warning or source.

## Existing owners and concrete implementation gaps

Source inspection on October 10 established the following starting points. Renderer rows now identify the IU02–IU03 replacements; other rows describe the original gaps addressed by the stage plan. These are source findings, not runtime checks.

| Owner                                                                                                                                                                           | Reuse and required change                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [ImportProvider.tsx](src/renderer/src/features/imports/ImportProvider.tsx) and [feature styles](src/renderer/src/features/imports/ImportProvider.module.css)                    | Retains project-scoped form/native selection/scope guards. IU02–IU03 replace inventory/previews with compact setup/processing/results and one stable footer.                                                                                                       |
| [useImportFlow.ts](src/renderer/src/features/imports/useImportFlow.ts)                                                                                                          | Replaces useMultipartAnalysis in IU03. One retained owner composes Submit, complete summary reads, atomic Accept and exact outcome recovery; no part/consent dashboard remains.                                                                                    |
| `useImportReview.tsx` (removed in IU02)                                                                                                                                         | Its item/correction/confirmation UI is deleted. IU01 worker preparation and the retained import flow preserve operation semantics; ImportResults presents only the requested summary.                                                                              |
| [import-review.ts](src/worker/projects/import-review.ts) and [shared review contracts](src/shared/import-review.ts)                                                             | Candidates default to undecided; missing choices/acknowledgments block confirmation; strong-identifier duplicates require review. A real worker operation must apply the automatic policy across the full selection. Merely hiding controls leaves Accept blocked. |
| [import-partition.ts](src/worker/projects/import-partition.ts), [import-plans.ts](src/worker/projects/import-plans.ts), [multipart contracts](src/shared/import-multipart.ts)   | Keep bounded extraction, packets, protected results and local consolidation. Avoid changing frozen prompt bytes or old digests in place. Update compatibility only where the revised evidence/selection policy needs it.                                           |
| [import-commit.ts](src/worker/projects/import-commit.ts) and [commit contracts](src/shared/import-commit.ts)                                                                    | Keep the one transaction, exact manifest, stable destination IDs, accepted identities and receipt-first replay. Extend source-occurrence grouping only as needed to preserve multiple origins under one canonical destination.                                     |
| [connectionState.ts](src/renderer/src/features/ai-connections/connectionState.ts) and [ConversationPanel.tsx](src/renderer/src/features/ai/conversations/ConversationPanel.tsx) | Reuse the existing account catalog, `selectModel` and compact composer-picker pattern. Do not embed the explanatory account-settings model panel.                                                                                                                  |
| Workspace/draft, main AI and project lifecycle owners                                                                                                                           | Keep editor buffers, existing Research/Notes drafts, access/close guards, protected attempts and local recovery. No duplicate queue, account, connection, storage or save manager.                                                                                 |

The baseline is SQL/minimum reader **30**. IU work allocates a new format/schema version only if the actual durable contract requires it. Preserve old readers and captures; update every affected migration, archive, independent-copy, provenance and retention consumer together. Prefer extending existing import tables and commands over introducing a parallel job database. Historical schemas and test code are not rewritten.

## Required code and file cleanup

**Cleanup is part of implementation, not optional follow-up work.** Every stage must delete code and files made unused by its changes. IU04 owns the final pass across the earlier import implementation; IU05 removes any leftovers introduced or exposed by final integration. No separate cleanup stage is needed.

- Remove unused import components, hooks, styles, state fields, helpers, types, obsolete execution paths, event handlers/listeners, IPC/preload routes, assets and configuration. Follow each removed feature through its supporting layers so an invisible screen does not leave a working but unreachable subsystem behind. Remove an entire file when nothing in it remains necessary; remove only obsolete portions from shared files.
- Remove duplicate logic after the new flow adopts an existing owner. Do not retain old implementations behind hidden controls, feature flags, commented-out blocks, unused exports or speculative future-reuse wrappers. The requested disabled Re-Analyze button does not justify keeping an unused reanalysis UI or execution route; retain only code with a current processing, recovery or compatibility purpose.
- Remove import-only dependencies and their package/lockfile entries when ordinary source/configuration inspection establishes that no other feature or supported tooling uses them. Remove obsolete active documentation and links, or update them to the surviving behavior. Preserve useful dated implementation/acceptance records as clearly superseded history.
- Establish whether code is unused by tracing its consumers, registrations, dynamic loading, side effects and persisted-format obligations. A missing direct import or a passing typecheck alone is insufficient. Use ordinary source/reference searches and Git review; do not add or run dead-code audit scripts, test harnesses, builds or runtime probes.
- Retain code needed by the current importer, other app features, supported old project formats, saved proposals/receipts, migrations, provenance or pending-operation recovery. Keep the smallest necessary compatibility path. “Legacy” alone is not a reason to retain an entire obsolete screen or workflow; identify the actual reader, operation or supported data that still needs the retained portion.
- Keep cleanup scoped to the import feature and supporting code it makes unused, including shared files where relevant. Do not turn this into an unrelated repository refactor. Historical test code remains untouched under the standing instruction. Do not delete user/project data, retained originals, protected results, recovery history or migration copies as code cleanup, or broadly rewrite vendored/generated files.
- Each stage handoff briefly names the main removals and any obsolete-looking code retained for a concrete compatibility reason. If removal must wait for a named later stage, record that dependency in this plan; do not silently leave it behind or claim the cleanup complete. Use a short note in the existing stage record, not a new tracking system.

**Completion requirement:** hiding or disconnecting obsolete functionality is insufficient. By the final handoff, unused code from the original import workflow and the revision must be removed, and any retained compatibility code must have an identified purpose. Required format/lint/typecheck outcomes remain separate from user-owned runtime acceptance.

## Submit, Accept and recovery behind the simple UI

The normal sequence is:

```text
Setup → Submit → local preparation → bounded ChatGPT analysis
      → automatic choices and frozen summary → Accept
      → existing atomic commit → close → ordinary project content

Results → Cancel → populated setup
```

**Submit owns analysis consent.** Capture the file revision, categories, instructions, account and model at the click. Local preparation may happen afterward without another confirmation. Main binds that intent to the exact generated plan before any send. Changes to scope/account/model/selection invalidate a not-yet-dispatched intent instead of silently broadening it. File content remains untrusted data; only the user's instructions field supplies import guidance. No manuscript or unrelated project content is added to the request.

Authorize the complete eligible plan once, within existing finite bounds, and process sequentially. Remove the user-facing default-16/request-ceiling choice; use an application-owned bound within the existing main limit. Do not add hidden retries, reconciliation inference or a loop that automatically requests new grants. If a selection exceeds the supported bound, explain once that it must be reduced; no partial concealed submission. Pauses caused by cancellation, account changes or actual failures are exceptional recovery states, not normal required steps.

**Automatic preparation owns proposed decisions.** After protected results are ready, perform one bounded worker operation over all relevant records, protect registered project drafts through the existing owner, and freeze the summary and manifest. Use actual full-selection totals with bounded/paged rendering. Do not run a renderer loop that clicks or calls public per-item review mutations. Persist automatic exclusions and their reasons for recoverability without presenting an exclusion form.

**Accept owns domain mutation.** Bind it to the exact displayed summary and manifest. Protect drafts and revalidate through existing guards. An unrelated head change may permit local regeneration only if the user-visible content, identities, mappings and omissions are unchanged and that equivalence is established. Otherwise show the refreshed short summary and require Accept again. Never rerun ChatGPT to repair staleness. An unresolved commit retains its operation ID and is reconciled before any retry; no second import is created to “try again.”

| Exceptional state                           | User experience and internal boundary                                                                                                                                                                                                                    |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Selection cannot be read or exceeds a limit | Short inline error with filename and remedy; preserve the rest of the form. Existing limits are enforced without printing a capacity manual in the default UI.                                                                                           |
| Analysis fails with no usable results       | “Analysis couldn't finish” and a short actionable reason. Return to setup; reconcile the saved outcome, then use Start new import and Submit for a deliberate new analysis. No automatic resend.                                                         |
| Analysis stops with usable results          | Offer one contextual **View available results** action; the normal summary explains partial coverage. If unattempted work can continue safely, a contextual **Continue analysis** action explicitly authorizes only that remaining work. No part picker. |
| Local protection fails                      | A short **Try saving again** action retries the same local protection work. It never silently issues another provider request.                                                                                                                           |
| Commit reply is uncertain                   | “Checking import status…” followed by the saved outcome. If it cannot be checked, keep the exact pending operation and one **Check status** action. Never show success early.                                                                            |
| App/project reopens                         | Read retained state. Restore the relevant form, ready summary or receipt outcome. A paused analysis never restarts by opening Import.                                                                                                                    |
| An older import is unfinished               | Adapt its existing selection/results into the new flow, retaining saved corrections/exclusions and unresolved operations. Do not demand a fresh import or expose the old technical dashboard as a recovery prerequisite.                                 |

Cancel, close and replacement must not delete retained originals or protected results. Avoid an ever-growing visible batch picker: resume the relevant unfinished import and keep completed history out of the setup form. Internally retire only safely settled canceled/superseded active work, retaining its originals/history, so ordinary edits and cancellations cannot consume all eight active slots. Uncertain work stays owned until reconciled.

An existing saved legacy correction has priority over a newly computed default. Protect an in-memory dirty correction before switching presentation; if protection fails, show the concrete recovery action without silently discarding it. Completed imports remain completed. Project copies retain data and provenance, never execution or acceptance permission.

Selected-file Save remains the normal project Save action; an accepted import must not silently Save to a chosen `.collie` file. Existing retention and import-bearing working-copy removal protections remain intact. Reuse the current imported-chat continuation, Research origin links, Notes and citation owners; acceptance must refresh their existing lists without replacing dirty forms or manuscript content.

## Model recommendations

Stage settings below are recommendations for the **coding assistant**, not hard-coded choices for the Import dropdown. Most stages use GPT-6.1 Sol; the automatic-policy change uses Astra because it crosses evidence interpretation, durable decisions and transaction compatibility. Effort is proportional to the task, with no Max/Ultra requirement or delegated-agent workflow. This is a planning judgment informed by current [OpenAI model and effort guidance](https://learn.chatgpt.com/docs/models), checked October 10, 2026.

The **in-app dropdown** uses the selected account's actual catalog and existing saved preference. Show catalog labels, preserve the selected model identity through dispatch and refresh through the existing owner when the account changes. Do not hard-code the models in this stage table as user choices. Official [account-specific model guidance](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) supports that distinction; catalog visibility alone does not establish successful import execution. No new runtime effort selector, provider, API key or billing fallback is included.

## Stage map

Implement one requested stage at a time. This plan is already the product specification; do not add another documentation-only architecture stage. Each stage has a bounded deliverable and a short user handoff. Intermediate backend completion is described honestly; the finished simple import requires IU01–IU05.

| Stage | Deliverable                                                             | Depends on         | Recommended coding model | Effort |
| ----- | ----------------------------------------------------------------------- | ------------------ | ------------------------ | ------ |
| IU01  | Automatic best-effort selection and exact prepared summary              | Existing IM01–IM12 | GPT-6 Astra              | High   |
| IU02  | Compact setup, model dropdown and one-Submit processing                 | IU01               | GPT-6.1 Sol              | High   |
| IU03  | Simple results and one-Accept completion                                | IU02               | GPT-6.1 Sol              | High   |
| IU04  | Simple recovery, unfinished-import compatibility and final code cleanup | IU03               | GPT-6.1 Sol              | High   |
| IU05  | Integrated visual/accessibility polish and user acceptance handoff      | IU04               | GPT-6.1 Sol              | Medium |

### IU01 — Prepare the best usable import automatically

**Status:** implementation complete — awaiting user testing. **Model: GPT-6 Astra | Effort: High.** See the [implementation record](docs/validation/import-IU01.md), [contract extension](docs/formats/import-review-v1.md#iu01-automatic-preparation-extension--october-10-2026) and [user guide](docs/manual-testing/import-IU01.md). SQL/minimum reader 31; review revision and confirmation manifest/entry 2. No new visible UI is delivered in this stage.

**Outcome:** the worker can turn protected analysis into the exact importable set and summary without individual user choices.

1. Add a bounded automatic-preparation operation to the existing review/manifest owner. Implement the policy table: complete conversation groups, canonical sources, original occurrences, notes, exclusions, already-imported identities and coherent representation precedence.
2. Separate essential evidence from optional metadata/coverage warnings. Preserve validation of complete original text and required relationships; remove the need for human acknowledgment of every harmless difference. Make new automatic decisions distinguishable from historical human review.
3. Produce summary totals and each conversation's actual included-message count from the same frozen entries Accept will commit. Handle zero results, already-present content and partial usable results explicitly.
4. Preserve multiple compatible source origins when one source destination is reused or created. Update the existing commit preparation and origin consumers only where their current one-choice/one-destination assumptions require it. Do not leave dangling links or force unchecked chats into the import.
5. Implement exact operation reconciliation and invalidation. Version the minimum changed durable contracts and update affected portable validators/migrations/retention readers together. Record the change in the existing format documentation; avoid a speculative framework or unrelated schema cleanup.
6. Delete preparation helpers, decision logic, types and command branches made unused by this replacement. Preserve the specific readers and recovery paths still needed for saved manual revisions; name any removal that depends on IU02–IU04.

**Primary owners:** worker import-review, import-content, import-identities, import-commit preparation; shared review/commit contracts; affected portable consumers.

**Completion bar:** all includable items are settled by the automatic policy, totals describe one committable result, and no hidden undecided/acknowledgment requirement remains. Existing manual revisions are readable and retain their meaning. This stage does not claim the new UI is delivered.

**Cleanup outcome:** shared evidence reading replaces the duplicate inline identification traversal, and automatic/manual preparation share one manifest writer. Old intake/progress/review UI and its commands still have active consumers until IU02–IU03; retained manual revision readers and exact replay remain compatibility dependencies through IU04. No data or historical test deletion is included. Full import-wide cleanup remains IU04.

**User handoff:** review the policy and implementation limitations; open an existing disposable project normally and confirm previously imported content remains available. The new preparation operation has no standalone public walkthrough until IU02–IU03. Do not add a temporary debug screen, test hook or script to demonstrate it.

### IU02 — Deliver the compact form and one Submit

**Status:** implementation complete — awaiting user testing. **Model: GPT-6.1 Sol | Effort: High.** See the [implementation record](docs/validation/import-IU02.md), [submission extension](docs/formats/import-analysis-v2.md#iu02-one-submit-extension--october-10-2026) and [user guide](docs/manual-testing/import-IU02.md). SQL/minimum reader 31 and persisted analysis formats are unchanged.

**Outcome:** the setup experience matches the requested form, and one Submit handles preparation and analysis.

1. Replace the intake presentation with the specified files/categories/instructions/model form. Keep native selection, exact originals and retained input ownership. Remove saved-selection inventory and ordinary local-preview controls from this path.
2. Reuse the account catalog and compact model-selection operation. Preserve the draft across account-management transfers, model loading and unavailable-model errors. Freeze the displayed account/model at Submit; no inference on model selection.
3. Compose draft protection, graph preparation, plan creation and finite authorization behind Submit. Replace checkbox/part-budget permission with the explicit submitted intent; preserve main-owned guards and no automatic retry.
4. Show compact in-place processing, cancellation and actual error states. Automatically call IU01 preparation once usable analysis is settled. Hold the exact prepared result for IU03; do not add a third temporary results screen or enable a fake Accept handler.
5. Preserve the prepared result after Cancel. Unchanged resubmission reuses it; edited submissions invalidate the displayed preparation and begin a fresh bounded intent only on Submit.
6. Delete replaced intake/progress components, controls, state, handlers and styles once their remaining consumers have moved. Trace unused supporting routes and helpers; carry forward only named compatibility or later-stage dependencies.

**Primary owners:** ImportProvider, retained import flow (renamed useImportFlow in IU03), main import-analysis orchestration, existing connection state, feature styles and shared request contracts where necessary.

**Completion bar:** successful ordinary analysis takes one Submit without local inspection, plan review, request ceilings or consent checkboxes. The stage handoff explicitly says the new summary/Accept presentation awaits IU03; no claim of a completed revised import.

**Cleanup outcome:** removed the old graph/content previews, source-field review, raw analysis text viewer, single-request analysis UI and item-review hook. Replaced the multipart dashboard with a retained controller and kept only a compact saved-attempt recovery surface. Ordinary imported transcript/origin readers remain used by Chats/Research/Notes. Main/worker manual revision decoding, exact operation replay and atomic commit preparation remain compatibility/acceptance dependencies; IU03–IU04 own the final supporting-route cleanup. No historical tests or retained data were changed.

**Manual guide:** in a disposable project, open Import, choose files and categories, add optional instructions, select another available model and Submit. Expect the compact form, retained choices and automatic processing. Cancel once and reopen; expect preserved input. This stage does not ask the user to accept through the old review dashboard.

### IU03 — Show the summary and finish with Accept

**Status:** implementation complete — awaiting user testing. **Model: GPT-6.1 Sol | Effort: High.** See the [implementation record](docs/validation/import-IU03.md), [acceptance extension](docs/formats/import-commit-v1.md#iu03-simple-summary-and-accept--october-10-2026) and [user guide](docs/manual-testing/import-IU03.md). SQL/minimum reader 31 and persisted import/provider formats are unchanged.

**Outcome:** the normal successful journey works end to end through the two requested modals.

1. Open the results modal automatically after preparation. Render conversation titles/message counts and source/note totals from IU01's exact result, with one concise omission notice only when needed.
2. Add Cancel, disabled Re-Analyze and Accept with the defined close/Escape semantics. Keep every count accurate across a multi-page backend result. Remove item-choice tabs and separate confirmation preparation from the normal route.
3. Bind Accept to the existing atomic transaction and exact receipt. Protect other drafts; guard duplicate clicks, stale summaries and unknown outcomes. A relevant change refreshes the summary locally and requires another Accept instead of rerunning analysis.
4. Close only on confirmed success, refresh normal Chats/Research/Notes through their existing owners and show a brief success notice. Preserve workspace location and editor/forms. Keep source-to-conversation/message links navigable through the ordinary readers.
5. Handle zero/all-duplicate results without fake successes. Keep protected results after Cancel and ensure the disabled Re-Analyze has no hidden execution path.
6. Delete obsolete item-review forms, correction controls, confirmation screens and their unused hooks/styles/helpers. Preserve saved decisions and exact recovery through the surviving owners rather than retaining the old interface solely to read its data.

**Primary owners:** simplified retained import presentation/review controller, import-commit, workspace head refresh, normal destination readers and origin links.

**Completion bar:** on a supported successful selection, the user makes no decisions between Submit and the short summary, and one Accept adds precisely that summary's result and closes. Item-level review is not an escape hatch required to finish.

**Cleanup outcome:** the IU02 saved-findings placeholder is removed. The retained multipart controller is now `useImportFlow.ts`, owning Submit, complete summary reads and exact acceptance recovery without a second review owner. Item-review/correction/confirmation screens were already deleted in IU02 and remain absent. No report modal or destination-navigation detour was reintroduced. Existing commit/report, manual-revision and saved-attempt readers remain portability/recovery dependencies; IU04 owns the final supporting-route cleanup.

**Manual guide:** Submit a small disposable conversation-and-source selection. Expect automatic summary counts. Cancel and Submit unchanged; expect the same summary without another analysis. Accept; expect the dialog to close and the content/origins to appear in normal destinations. Confirm Re-Analyze is visibly unavailable.

### IU04 — Finish recovery, compatibility and code cleanup

**Status:** implementation complete — awaiting user testing. **Model: GPT-6.1 Sol | Effort: High.** See the [implementation record](docs/validation/import-IU04.md), [compatibility extension](docs/formats/import-review-v1.md#iu04-recovery-and-compatibility--october-10-2026) and [user guide](docs/manual-testing/import-IU04.md). SQL/minimum reader 32 adds legacy review v2 and inherited-choice revision v3 without changing database tables.

**Outcome:** interrupted work and older imports use the same understandable experience, and unused code from the original import workflow is removed.

1. Map existing preparing, paused, results-ready, committing, unknown and completed states into the new form/results/recovery presentation. Preserve old explicit corrections, exclusions and pending operations. Never rebuild an old import by silently resending it.
2. Complete Cancel/close/reopen behavior across preparation and analysis. Retain protected results, latch cancellation before future dispatch and make recovery actions contextual. Continue analysis sends only eligible never-attempted work after an explicit click.
3. Reconcile unknown analysis/acceptance outcomes before retry. Local saving/checking stays separate from another provider request. Keep recovery reachable during access or account changes without exposing normal mutation controls incorrectly.
4. Retire settled canceled/superseded active work without deleting originals/history. Preserve project-copy, archive and retained-draft ownership; opening a copy starts no request and accepts nothing.
5. Complete the import-wide cleanup required above. Delete obsolete single-request analysis presentation, technical progress/review dashboards, completed-report detours and their unused supporting files/code. Follow removals through renderer state/styles, shared types, preload/IPC registrations and main/worker handlers; remove unused assets, dependencies and configuration when no other consumer needs them. Do not merely disconnect their entry points.
6. Resolve cleanup deferred from IU01–IU03 and inspect the remaining import code for unreachable or duplicate paths. Retain only necessary current behavior and identified compatibility readers/recovery. Update active documentation and record the main removals plus concise reasons for retained legacy code. Leave historical test code and retained project data untouched.

**Primary owners:** retained import/draft owners, existing main execution and lifecycle owners, exact review/commit recovery, portable state readers and obsolete import code across renderer/shared/preload/main/worker layers.

**Completion bar:** a user can return to ordinary unfinished work without selecting a batch ID, inspecting a packet or approving every record. No recovery route duplicates accepted content or silently starts inference. Obsolete import functionality and unused supporting code/files have been deleted; retained compatibility portions have a concrete purpose. Any unresolved removal is reported explicitly and prevents claiming this cleanup complete.

**Cleanup outcome:** removed the separate saved-attempt dialog and its hook, graph/content/part/proposal preview routes and validators, staged transcript presentation/route, old manual-choice authoring handlers, single-request capture creation and unused preview fields/counters. Recovery uses the same retained flow; protected v1/v2 analysis readers, historical manual-command decoding/reconciliation, receipt/report lookup, imported transcript/origin readers and portable validators remain necessary. No new dependency or unused placeholder support was added. The deferred IU01–IU03 cleanup is resolved; no identified removal is deferred. IU05 must remove anything made unused by its own polish.

**Manual guide:** use disposable copies of an older unfinished import and an accepted project. Reopen, view retained results, Cancel, Save and reopen again; expect the new simple presentation with preserved data and no automatic analysis. Exercise normal cancellation once. Report rare protection/provider failures only if naturally encountered; do not manufacture faults.

### IU05 — Finish the experience and hand it back for user testing

**Status:** implementation complete — awaiting user testing. **Model: GPT-6.1 Sol | Effort: Medium.** See the [final acceptance record](docs/validation/import-IU05.md), [presentation extension](docs/formats/import-commit-v1.md#iu05-integrated-presentation--october-10-2026) and [final user guide](docs/manual-testing/import-IU05.md). SQL/minimum reader remains 32; no persisted or provider format changes.

**Outcome:** the complete flow is compact, consistent and ready for Josh to judge visually and practically.

1. Read the integrated source against the setup/results wireframes and remove leftover routine technical copy, redundant actions and nested scrolling. This is final refinement; simplicity and usable layouts are required from IU02 onward.
2. Finish keyboard labels, announcements, footer behavior, long filename/title wrapping, reduced-motion transitions, narrow layout, zoom and guarded focus transfer using existing shared controls. Do not redesign unrelated app surfaces.
3. Ensure normal destination lists, imported transcript/source links and note editing remain the way users inspect results. Keep missing-item improvements and active Re-Analyze in a short deferred list rather than adding another review workflow.
4. Update this ledger, relevant existing format/implementation records, the historical plan pointer and AGENTS checkpoint. Consolidate one concise final user guide and one acceptance record; avoid duplicating the entire architecture in every stage document.
5. Remove code, styles or assets made unused by final integration/polish, and close any remaining cleanup items before the final code checks and handoff. Do not reintroduce old workflows as hidden fallbacks or keep unused code for the deferred Re-Analyze feature.
6. Run the required code checks, hand off the final walkthrough below and stop for Josh's observations. Address observed defects within this revision before claiming the new UX is accepted.

**Primary owners:** import presentation/styles, existing UI primitives only as needed, ordinary destination integrations and documentation.

**Completion bar:** the normal path remains **Import → fill form → Submit → summary → Accept**. No extra mandatory screen, per-item decision, technical control or active placeholder survives. The required code/file cleanup is complete and any retained compatibility code is accounted for. Visual/runtime quality is pending until the user reports it.

**Cleanup outcome:** removed the results component's separate focus effect/ref and redundant status announcements, consolidated contextual recovery visibility, removed routine picker-cancellation copy and fixed-instance accessibility IDs. No empty recovery row or routine Check status/View available results/Start new import row remains after a healthy complete summary is canceled back to setup. Necessary protected-history, receipt, migration and ordinary transcript/origin readers remain as accounted for in IU04. No obsolete import code identified in this revision remains deferred.

**Deferred:** active Re-Analyze, file reformatting assistance and extraction improvements driven by actual missed material. These do not introduce another review workflow. Stop for Josh's observations; implementation and clean code checks do not establish UX acceptance.

## Final user-owned walkthrough

The [final guide](docs/manual-testing/import-IU05.md) is the consolidated walkthrough for the implemented revision; the outline below remains a planning reference. These are user-owned acceptance steps, never assistant-executed checks. The handoff uses the repository's “Stage IU05 complete. As a user:” format.

1. **Launch the updated local app and open a disposable project.** Use the repository's normal development launch (`npm run dev`) or the updated installed build being evaluated. Opening Import shows the compact setup form, three categories, optional instructions and the connected account's model dropdown.
2. **Choose a small supported file or file set, select AI conversations and Sources, choose a model and Submit.** Preparation and analysis proceed without another consent, preview, request-budget or per-message screen; no accepted content appears yet.
3. **Read the resulting summary.** It lists conversation titles and their message counts plus the total sources, with only a brief relevant omission notice. Re-Analyze is disabled. No detailed review is needed to continue.
4. **Cancel, then Submit without changing the form.** The original inputs remain and the same prepared summary returns without another AI analysis. Accept it; expect the dialog to close and a short success notice.
5. **Open ordinary Chats and Research.** The new conversations have readable original messages; imported sources retain their supported conversation/message origins. Follow up in an imported chat through the ordinary composer. The manuscript and unrelated drafts remain intact.
6. **Try Sources only and Notes only with suitable files in separate disposable selections.** Only the chosen destinations are added; source-only origins remain traceable and notes retain literal content. Repeating an identical completed import does not create duplicates.
7. **Cancel an analysis normally, reopen Import, and later Save/close/reopen the disposable project.** Input and protected results remain recoverable, accepted content persists, and opening never restarts analysis. Use an older unfinished import copy if available; expect the same simple UX.
8. **Use keyboard navigation, a narrow window and 200% zoom.** Fields, file removal, Cancel, Submit and Accept remain understandable and reachable; dialog transitions return focus sensibly. Report any confusing step or unnecessary explanation along with omissions you actually notice.

The larger historical six-folder corpus remains useful for subsequent user sampling, but reproducing every old count or completing the old technical review matrix is not a prerequisite to judging this UX. Do not import those files automatically or hard-code their identities/counts. No promised accuracy percentage substitutes for looking at real results.

## Stage workflow and completion ledger

For every code stage, inspect script/ignore scope, then run **`npm run format` → `npm run lint` → `npm run typecheck`**, fix all reported issues and finish with all three clean. Do not add/run tests, builds, launches, browser automation, verification screenshots, benchmarks or other runtime checks. Source reading and Git diff review are not passed runtime tests. Documentation-only work requires none of those three commands.

At handoff, report actual command outcomes separately from **implementation complete — awaiting user testing**, briefly report cleanup removals/retained compatibility/deferred items, supply concise ordered manual actions with visible expected results, and stop. Backend-only IU01 must state its lack of new visible behavior. Stage progression never implies user acceptance. Keep the existing installed/commercial and broader release gates separate; this plan does not change release NO-GO.

| Stage                         | Implementation                                 | Required code checks        | User acceptance          |
| ----------------------------- | ---------------------------------------------- | --------------------------- | ------------------------ |
| Plan and aligned instructions | Complete, October 10, 2026; documentation only | Not required; not run       | Awaiting document review |
| IU01                          | Complete, October 10, 2026; backend only       | Format/lint/typecheck clean | Pending                  |
| IU02                          | Complete, October 10, 2026; setup/processing   | Format/lint/typecheck clean | Pending                  |
| IU03                          | Complete, October 10, 2026; summary/Accept     | Format/lint/typecheck clean | Pending                  |
| IU04                          | Complete, October 10, 2026; recovery/cleanup   | Format/lint/typecheck clean | Pending                  |
| IU05                          | Complete, October 10, 2026; integrated polish  | Format/lint/typecheck clean | Pending                  |

Success means the user can finish the import confidently through the stated short path and find useful content afterward. A dense “Advanced” screen, a smaller-font version of the current UI or automatic inclusion that still stops on ordinary per-item acknowledgments does not satisfy this plan.
