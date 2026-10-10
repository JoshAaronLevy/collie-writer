# AI-assisted import into Collie Writer

Originally proposed October 5, 2026; reconciled October 9 after Josh approved the product decisions. **IM01–IM12 are implementation complete — awaiting user testing.** Protected selected originals and finite multipart analysis feed saved review and explicit atomic confirmation. SQL/minimum reader 30 retains accepted-original provenance and versioned continued-conversation context. Imported chats support ordinary history/Find, explicit live follow-up, bounded memory/recall and Research/Notes origins. IM12 completes guarded dialog transitions, reachable recovery and saved-report presentation. Import completion and selected-file Save remain separate. The [current plan](import-implementation-plan.md), [integrated acceptance record](docs/validation/import-IM12.md) and [final guide](docs/manual-testing/import-IM12.md) own current scope and pending acceptance. No successful corpus import is claimed; release remains NO-GO.

**A user creates or opens a project, selects files inside that project, asks the existing ChatGPT integration to analyze them, reviews the proposed additions and explicitly confirms the import.** The result adds chats, sources/research and notes to that project so the user can continue ordinary work in Collie.

## Approved first version

| Area                    | Decision                                                                                                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Destination             | An already-created writable project. Import does not create a project, import another application's project container or replace the manuscript.                                               |
| Categories              | AI chats, Sources & research, Notes. Keep the existing writing importer separate.                                                                                                              |
| Formats                 | JSON, UTF-8 text/Markdown, CSL-JSON, BibTeX and RIS. PDF, DOCX, HTML, ZIP, OCR and media require later readers.                                                                                |
| AI                      | Extend the existing own-account ChatGPT-plan session with a distinct import-analysis contract. No API key, alternate provider, hosted proxy or Codex process.                                  |
| Originals               | Retain exact selected originals in the project, including excluded records, with a clear size/privacy disclosure.                                                                              |
| Chats                   | Preserve separate thread identities, actual message order/roles/timestamps and selected paths; retain alternative branches for explicit inspection/selection. Support later native follow-ups. |
| Sources                 | Preserve message-level kept/rejected decisions, labels, grades and exact origin links. Imported metadata does not establish verification or inspected evidence.                                |
| Analysis and acceptance | A disclosed finite analysis batch may run after explicit Analyze. Stop and explicit continuation remain available. Final local confirmation is always separate.                                |

These choices are approved and do not need renewed approval. The earlier proposal to create a new project from import, include Writing in the same first version and require a Codex route is superseded by this scope. Its preservation, review and recovery principles remain.

## User experience

1. **Open Import in a project.** One retained owner serves the project action and Research entry point. The dialog names the destination and provides Add files, the three independent category checkboxes and optional instructions.
2. **Gather selected files.** Native multi-selection and repeated Add files allow files from several folders in one batch. Show names/sizes, unsupported inputs and exact duplicate-file notices. Intake is local; it does not transmit files or scan neighboring folders.
3. **Analyze with ChatGPT.** Disclose the selected file-derived content, bounded project context, account/model and finite request ceiling. Send locally extracted text/records through the existing protected AI lifecycle. After intake exits, show progress/errors in the same retained workflow. Closing a dialog does not discard the batch; Stop pauses further dispatch.
4. **Review the proposal.** Show separate chats, sources and notes, original versus suggested values, duplicates, unresolved relationships, losses and complete file/record coverage. Let the user correct metadata, choose supported paths, reuse sources or exclude items. Keep original wording through exact local references.
5. **Confirm the additions.** An explicit final action accepts one immutable manifest into the exact destination. An error-free analysis cannot perform this action automatically. A partial import requires explicit exclusions and finalizes that batch; remaining material needs another explicit import.
6. **Continue work and Save.** Open the accepted chats, Research or Notes through existing interfaces. Chat follow-ups are real new Collie requests; citations still require explicit insertion. Import protects local project work. Explicit Save separately writes the portable `.collie` file, choosing a destination on the first Save.

Use calm, compact Mantine surfaces and the existing draft/editor/dialog owners. Preserve caret, undo history, dirty forms, focus and access guards. Routine protection belongs in contextual details; real failures retain actionable recovery.

## Local readers and AI interpretation

Local readers establish exact bytes, structural identities, ordering and provenance. ChatGPT interprets supported unfamiliar layouts, classifies content and proposes relationships using only disclosed input. The model returns a bounded, strictly validated JSON proposal referencing local records/spans. It does not regenerate transcripts, invent authors or publications, mutate SQLite, execute scripts, read paths or fetch links.

Initial input packets are text, not a new binary upload capability. No hidden probes, automatic repair requests, model substitution or inference on reopening is included. Immutable request/response versions and the current account/model/capability binding govern every real analysis attempt.

Raw chat reasoning/internal records are retained only within originals, excluded from ordinary transcript, automatic context and import payloads. Search candidates, citations, snippets, images and inspected source excerpts are different kinds of evidence. Rejected-only source occurrences stay outside active Research while their decisions remain inspectable; rejection in one message does not erase a kept occurrence elsewhere.

The Cultural Analysis App collection is selected input only. Recognize file structures, not its repository name, project marker, topics, date cutoffs or known IDs. Never call its code or read an embedded `source_file` path. The plan documents all six folders, overlapping exports and source relationships without making them production constants or shipped fixtures.

## Portability, duplication and recovery

An unfinished import is protected project work, not disposable cache. Save can carry selected originals, analysis results and review revisions before acceptance, without exposing candidate records as ordinary project content. Excluding visible content does not remove its bytes from whole originals or older saved/retained versions; the user must see that distinction.

File, external entity, text variant and accepted Collie identities are separate. Equivalent selected exports consolidate by identity/evidence; repeated imports default to already-imported/skip. Changed content under an existing external ID requires review and does not overwrite the project. V1 does not splice historical tails around later native replies or synchronize another application's project.

Protected managed bytes replace source-path dependence after intake. Review/confirmation and receipt reconciliation continue if the original file moves. Retain completed analysis across Stop, dismissal and failure. A local write retry uses the exact saved operation; another AI attempt is an explicit action that can consume allowance.

Final acceptance installs one bounded graph transaction plus its immutable receipt. Unknown outcomes reconcile that same receipt before another action; no second operation or AI resend is inferred. Copied or reopened import state never grants provider or commit authority. Every storage extension includes its strict readers, retained-copy migration, full graph/blob validation, snapshot/Save, copy/rekey, retention and export consumers in its owning stage.

## Implementation and release boundaries

IM01 resolved the design and contract. IM02 implements durable staging, exact local receipts and preservation consumers; use its [implementation record](docs/validation/import-IM02.md) and [user guide](docs/manual-testing/import-IM02.md). The twelve stages and recommended coding models/efforts remain in the implementation plan. Implement only an explicitly requested stage, run format/lint/typecheck after code changes and stop with the user-owned manual guide. Documentation-only work requires none of those code checks.

The active direct ChatGPT route remains bounded to its existing development identity. Historical Codex isolation refusals remain attached to that unused route. Paid/installed provider permission, funding enforcement, registration, packaged adapter and platform acceptance are unresolved; the import design does not remove those gates or change release NO-GO.

IM01 changed documentation only. IM02 adds the storage migration and foundations; no provider call, corpus import or runtime verification was performed. Existing content flows require the IM02 migration/Save/reopen walkthrough before acceptance. IM03 now adds protected native multi-file intake and retained choices; use its [record](docs/validation/import-IM03.md) and [guide](docs/manual-testing/import-IM03.md). IM04 adds local readers, protected candidate graphs and bounded previews; see its [record](docs/validation/import-IM04.md) and [guide](docs/manual-testing/import-IM04.md). IM05 adds external-history storage/read contracts and staged ordered transcripts; see its [record](docs/validation/import-IM05.md) and [guide](docs/manual-testing/import-IM05.md). IM06 adds source/note origins and local previews; see its [record](docs/validation/import-IM06.md) and [guide](docs/manual-testing/import-IM06.md). IM07 adds one explicitly authorized analysis request, protected validated proposals and recovery; see its [record](docs/validation/import-IM07.md) and [guide](docs/manual-testing/import-IM07.md). IM08 adds deterministic multipart plans, finite serial authorization, retained coverage and explicit continuation/reanalysis; see its [record](docs/validation/import-IM08.md) and [guide](docs/manual-testing/import-IM08.md). IM09 adds protected editable review and immutable confirmation previews; see its [record](docs/validation/import-IM09.md) and [guide](docs/manual-testing/import-IM09.md). IM10 acceptance and IM11 continuation are now implemented as recorded above; IM12 remains unstarted. No live analysis or native acceptance is inferred.
