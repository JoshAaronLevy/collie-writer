# IM01 — Project import decisions

October 9, 2026. **IM01 documentation implementation complete — awaiting user testing (document review).** This records the contract decisions for the [import plan](../../import-implementation-plan.md). The [v1 specification](../formats/project-import-v1.md) is the normative design for later stages; no import runtime, schema migration, provider request or new UI is implemented here. See the [implementation record](../validation/import-IM01.md) and [review guide](../manual-testing/import-IM01.md).

## Settled scope

Josh approved all seven product recommendations before requesting IM01. Import adds material to a project the user has already created or opened. The categories are AI chats, Sources & research, and Notes. Initial inputs are JSON, UTF-8 text/Markdown, CSL-JSON, BibTeX and RIS. The existing writing importer remains separate. PDF, DOCX, HTML, archives, OCR and media are deferred; no project import/creation, synchronization or manuscript replacement is included.

Imported chats belong in the ordinary conversation experience and can receive new native replies in IM11. Keep exact originals within the project, including excluded records, with the approved privacy/size disclosure. Selected-path reading is the default; other branches remain available for explicit review. Preserve message-level kept/rejected decisions, labels and grades without converting them to verified research. One explicit Analyze can authorize a bounded series of requests; Stop, pause, explicit continuation and a final local confirmation remain separate actions.

The source examples remain selected files, not an integration with the Cultural Analysis App. Its code, project marker, directory names, known IDs and historical date cutoffs have no authority. The plan's October 9 collection inventory is a dated source-data observation. No new corpus processing or source-file transmission occurred in IM01.

## Findings from the plan review

| Finding                                                                                                                     | IM01 resolution                                                                                                                                           | Owning later stage        |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| The older design creates a project as part of import and requires a Codex route                                             | Reconcile it with the approved existing-project destination and the current direct ChatGPT session; keep historical release/isolation findings as history | IM01 documentation        |
| Direct execution currently admits conversation templates only; the shared content service handles conversation/proofreading | Add a distinct `import-analysis` purpose and versioned template/result through those same owners, not a conversation masquerading as import               | IM07                      |
| `domain_operations.result` has an exact document-based shape                                                                | Introduce explicitly versioned import-session/import-commit result variants with batch/receipt targets; preserve the original document result reader      | IM02; IM10 commit variant |
| `conversation_messages` requires `attempt_id` and permits one message per role per attempt                                  | Add imported message/provenance tables and a unified read projection; do not fabricate attempts or merge consecutive assistant messages                   | IM05                      |
| History and memory readers require alternating pairs/even counts                                                            | Add imported transcript reference/coverage versions for continuation; old readers/digests remain frozen                                                   | IM11                      |
| AC07 source receipts require a completed native assistant attempt                                                           | Store imported source occurrences independently, including an input locator when no visible chat was selected                                             | IM06                      |
| Notes currently expose only human origin and a restricted document subset                                                   | Add an imported origin/provenance version; keep recorded authorship separate from confirmation and disclose conversion losses                             | IM06                      |
| Main checks expiring picker grants before existing text-import dispatch                                                     | Stage bytes durably and provide outcome lookup that needs no picker or source path                                                                        | IM02–IM03; IM10           |
| Large original/proposal bodies could inflate SQLite and defeat bounded retention readers                                    | Keep large immutable bodies in managed blobs, page metadata and enforce aggregate admission; refuse unsafe cleanup without relaxing existing proof limits | IM02 onward               |
| The initial plan left caps, packet format, revision effects and rekey behavior partly open                                  | Freeze v1 bounds and identity rules in the specification; separate portable evidence from current dispatch/confirmation authority                         | IM01 design               |

These are source findings, not passed runtime tests. Existing consumers are named in the specification's migration matrix so implementation cannot stop at adding a new table or a renderer dialog.

## Provider decision

Extend the app-owned **local ChatGPT-plan** route already selected for the exact unpackaged development identity. Reuse `DirectPlanSession`, `AiService`, `AiContentService`, protected operation storage and the worker settlement/handoff protocol. No additional SDK, login system, API key, hosted service or Codex process is needed for this text-based feature.

Official plan-use guidance describes account-specific model discovery, OAuth inference at the public Responses endpoint, streaming without provider-side storage and terminal completion. It does not grant access to historical ChatGPT conversations; those arrive only through selected files. [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference), [plan-use overview](https://developers.openai.com/siwc/token-sharing-open-source).

The current preview documentation distinguishes model-supported file inputs from the **Files upload API**, which this flow does not support. It also excludes fields such as `max_output_tokens` and HTTP `previous_response_id`. V1 import sends locally extracted text, uses local receive/admission limits and carries its required context explicitly. General API upload examples must not be copied into this route. [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).

Freeze `project-import-analysis-v1` / `project-import-proposal-v1` as the new import template/result names. Use a strict JSON proposal returned as ordinary response text and validated locally. Do not depend on undocumented structured-output request options; adding such options later requires a new verified request contract. No tools, web search, file upload, remote conversation ID, automatic repair request or fallback model is part of v1. Exact instruction/schema bytes and their digests are versioned when IM07 implements this contract; changing them later cannot reinterpret retained requests.

The account's live model catalog remains the runtime selector. Import observations are scoped to the actual account/model/catalog/session and template revision. Readiness permits an explicit request; it is not proof of access or good analysis. Ordinary text success is not import-proposal success. The stage's Astra/Extra High recommendation is a coding setting, not a hard-coded import inference model or effort parameter.

## Three different authorities

1. **File intake:** a native picker permits bounded local reads of exactly selected files into protected project staging. It does not permit provider transmission, neighbor-file reads or accepted domain writes.
2. **Analysis:** Analyze authorizes the disclosed finite plan under one current account/model/scope. Main owns this ephemeral authorization. Persisted captures, completed parts and portable copies are evidence; none resume dispatch. Restart, Stop, uncertainty, errors or account changes pause the plan.
3. **Acceptance:** final confirmation authorizes one immutable local commit manifest for the exact destination. A matching receipt can be reconciled repeatedly; a fresh write requires current access and confirmation authority. Analysis never adds its candidate chats/sources/notes to normal content or context.

Staging itself is durable project work. Save can retain an unfinished import and its originals without accepting the candidate entities. This distinction must appear in copy and provenance: a `.collie` file may contain unaccepted/excluded source bytes. No selected-content-only privacy claim is made.

## Data and transaction decisions

Use project-scoped import batches, immutable revisions, selected-file manifests, paged input records/relationships, immutable analysis attempts/results, proposal/review revisions and accepted import receipts. The format document specifies their fields and validation. Preserve raw IDs and input locations separately from Collie IDs, exact original text separately from display variants, and one source entity separately from every source occurrence.

Store imported messages outside frozen live attempt tables. A typed transcript projection displays the imported prefix followed by native exchanges. Historical role, participant and time information remain inspectable, including unknown values. Reasoning/internal records stay in originals only; they do not become ordinary transcript, AI context or import payload. Arrays without branch evidence remain reviewable interpretations rather than falsely reconstructed trees.

Use existing source normalization and duplicate candidates, but require explicit reuse in the final review. Reuse never alters an existing source's metadata/verification. Rejected-only occurrences stay outside active Research; the same source can still be accepted from a different occurrence. Importing a URL does not inspect an article, create an excerpt or insert a citation. Notes preserve existing content with imported/unknown authorship and explicit format losses.

Every non-no-op batch uses ChatGPT analysis through this workflow. Recognition and exact reconstruction stay local. Model output references input record IDs/field spans; it must not regenerate long transcripts, invent bibliographic facts or issue database commands. The complete coverage ledger, not the model's summary, determines whether review is complete.

The final accepted graph is one bounded worker transaction after required bytes are protected. It installs accepted entities/relationships, origin mappings and the exact receipt with one project commit. Local flush/protection, source-candidate refresh and receipt lookup do not rerun analysis. A known stale target produces a new reviewed manifest; an unknown commit outcome must first resolve the original operation.

No automatic post-import rollback is promised. Once citations, edits or new chat replies depend on imported data, an unconditional batch deletion would be unsafe. Existing archive/trash/recovery actions remain available; report and originals remain retained.

## Compatibility decisions

No active format number changes in IM01. The inspected baseline is SQL/minimum reader 21, archive/editor 1, conversation record 2, live message 1, capture 5 and direct operation/binding 6. `project-import-v1` is a design contract version, not a claim that schema 22 exists. Each later stage allocates the next actual version and ships its complete migration/reader/copy/retention consumers together.

Use project ID as outer ownership; import evidence bodies omit project/workspace routing IDs. Independent copies rekey the outer project ID and domain-operation result's routing field while retaining entity IDs, external identities and immutable evidence digests. Imported content is inert on a new working copy. A pending confirmation from the original working copy is not permission to write in the copy.

The worker's current operation-result reader cannot represent an import receipt without a document. New typed result variants must participate in strict portable validation and version admission. Do not invent a manuscript document, misuse a source ID as a document ID or weaken all result validation to accept arbitrary JSON.

Large blobs must participate in `readPortableGraph`, manifest blob inventory, snapshot leases and retained-content comparisons. A receipt/hash alone does not prove its original/proposal blob is retained. Working-copy removal remains conservatively refused for import-bearing projects in v1, consistent with the current AI-linked refusal; relaxing that policy is separate work.

## Remaining gates, without blocking independent design work

| Gate                                                                                        | Current status                                                          | Owner / stage                                       |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------- |
| Product choices                                                                             | Approved; no unanswered scope questions                                 | Recorded here and in the plan                       |
| Local v1 storage/readers/UI                                                                 | Specified, not implemented                                              | IM02–IM06                                           |
| Import-purpose transport/protection/settlement                                              | Requires the explicit extensions above; current code cannot dispatch it | IM07                                                |
| Correct live structured proposals and finite batches                                        | Unobserved; no hidden probes                                            | Josh's manual IM07–IM08 observations                |
| Atomic native persistence, full-corpus quality, continuation and accessibility              | Unobserved                                                              | IM10–IM12 and their user guides                     |
| Paid/installed provider permission, funding enforcement, registrations and packaged adapter | Existing unresolved gates remain                                        | Separate provider/release work; release stays NO-GO |

The official overview separates local/open-source plan use from paid/remote integration inquiries. Source registration entries and installed funding/adapter guards remain unresolved; this document grants no commercial access. [Plan-use overview](https://developers.openai.com/siwc/token-sharing-open-source).

IM01 is complete as documentation. Do not advance IM02 or enable a provider feature until separately requested. No reapproval of the seven settled product choices is needed.
