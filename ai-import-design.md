# AI assisted import into Collie Writer

October 5, 2026. Product direction requested by Josh; documentation only. Implementation, provider feasibility and runtime acceptance remain pending.

**A user should be able to bring research, writing and AI chats from other applications into Collie without first restructuring everything into Collie's format.** The user selects one or more files, and Codex analyzes their contents, separates different kinds of material, proposes an organization and prepares a Collie project for review and creation.

The value is understanding differently structured content and its relationships, beyond recognizing a filename extension. JSON research exports are one example, not the scope boundary. This replaces the former JSON-focused PS09–PS11 proposals in [project-storage-updates.md](project-storage-updates.md). Import has its own design and eventual implementation plan; it does not block the storage stages.

## Intended user experience

1. **Choose Import.** Offer **Research**, **Writing** and **AI chats**, with support for selecting more than one category for a mixed collection. These choices express the user's intent; Codex should identify mixed content within individual files and explain its proposed classification.
2. **Add files.** Select or drop one or more files. Show the file list, sizes, readable/unsupported status and exclusions. Adding files is local intake; before AI analysis, explain which content will be sent to the connected provider. No upload to a Collie-hosted content service is proposed.
3. **Describe the intended project if useful.** Allow an optional instruction such as “These chapters and interviews belong to my book.” The normal flow should not require the user to map columns or understand the source schema.
4. **Analyze with Codex.** Identify document sections, research records, source metadata, conversations and relationships. Show meaningful progress and allow Stop. For ambiguity that materially changes the result, ask a focused question or flag it in the review.
5. **Review the proposed project.** Show its suggested title/type, writing outline, research/source organization and separate chat threads. Account for every selected file and show skipped material, duplicates, uncertain mappings, missing information and conversion losses. Let the user rename, move, exclude or correct items; a good proposal can be accepted together rather than item by item.
6. **Create the project.** Commit the reviewed import through Collie's storage owner, then open the project for writing/research. Creating it protects it locally; first explicit Save still asks where to write its self-contained `.collie` file. Respect the existing visible access/free-project choice before offering editing.

The recommended first destination is a **new project** so a conversion cannot silently overwrite existing work. Import into an existing project can be a later explicit additive flow, with a destination/duplicate review and the same draft protections.

## What the categories mean

| Category | Intended result                                                                                                 | What must survive conversion                                                                                                                                     |
| -------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Research | Sources, attachments, research notes, excerpts and useful groupings, with proposed relationships to the writing | Original records/files, source identity, available bibliographic details, existing tags/decisions, exact quotations and traceable provenance                     |
| Writing  | An organized manuscript with chapters/sections and supported formatting                                         | Author's wording and order, headings, footnotes, citations and media where representable; any unsupported structure must be reported                             |
| AI chats | Distinct imported conversations with readable ordered messages                                                  | Thread identity/title, roles, timestamps when available, attachments/references and known branch relationships; preserve uncertainty where the export lacks them |

Codex may suggest structure, labels and links. It must not rewrite the manuscript, summarize away messages, invent bibliographic facts or convert an AI assertion into verified research without a separate explicit action. Suggested metadata must remain distinguishable from information found in the input.

Imported chats need explicit external/import provenance. They must not masquerade as AI requests run by Collie, acquire live operation bindings or automatically resume/send anything. Where a chat export contains branches, preserve their provenance and review the chosen reading path instead of joining unrelated branches into a fabricated conversation.

For example, a collection might contain a chapter draft, notes in an unfamiliar JSON shape and several chat exports. The proposed result could contain the chapter under Writing, extracted source/notes records under Research, and the original chats as separate conversations. Cross-links are proposed where supported by the material; the user can correct them before project creation.

## How flexible import should work

Use a combination of reliable local file reading and Codex interpretation. Local readers extract available text and structure from explicitly supported containers. Codex interprets unfamiliar field names, identifies content types and relationships, and produces a structured conversion proposal. This avoids requiring a complete custom semantic importer for every exporting application while retaining explicit limits on which files the app can actually read.

Potential file families include text/Markdown, document files, research tables/JSON and chat-export bundles. The supported initial formats, OCR/media handling, archive rules and size limits must be chosen in the import implementation plan. This proposal does not promise that Codex can read every binary format, encrypted file, scanned document or damaged export.

Collie validates the proposal and creates its own documents, sources, conversations, links and asset records. Codex must not directly mutate the live project SQLite database or write arbitrary files into an existing workspace. Preserve exact original content through validated references/spans or local conversion where possible, rather than asking the model to regenerate an entire large file verbatim.

Input content is untrusted material to interpret, not instructions authorizing tools or access to other files. Limit analysis to the selected material and the reviewed task. Any needed runtime tools must have an explicit confined contract; importing a document cannot grant access to the rest of the user's computer or cause commands, links or embedded scripts to execute.

## Originals and provenance

Retain the accepted original files and a durable mapping from converted records to their input file/version and record, page, message or text location. Reuse identical managed bytes where the project store supports it. Preserve filenames and original identities in metadata even when the app assigns new internal IDs.

The default recommendation is whole-original retention with a visible size/privacy explanation. Excluding a converted record does not necessarily remove its bytes from a retained original file; the review must say so. A future selected-only retention mode needs a separate, accurate provenance contract. It cannot claim that unselected private content was discarded while retaining a whole export containing it.

Retained originals, reviewed conversion decisions and imported content are project data. An unfinished import may hold the only protected conversion result or reviewed corrections; its staging area is recoverable work, not automatically disposable cache. Derived previews/indexes may be rebuildable only when their authoritative inputs remain available.

The import report should identify what was imported, excluded, unsupported or only partly processed, plus the actual analysis/conversion provenance. A complete project must carry its retained originals and imported content through Save, Backup, Restore and independent copies without depending on the former source paths.

## Large imports and interrupted work

Plan for bounded extraction, chunked analysis, paged review and durable progress. Keep cross-file identities and references stable across chunks; a partial chunk cannot justify reporting the entire collection as analyzed. Define input/output/record limits and account-usage controls before offering large imports. Another AI attempt can consume account allowance and produce a different proposal, so retrying a local write must not rerun analysis.

Freeze the reviewed conversion and exact commit operation. Lost replies must reconcile the original project/import receipt, not create another project. Preserve model output, manual corrections and completed work after cancellation or an uncertain outcome. Distinguish retrying local protection, resuming local conversion and starting a new AI analysis, with no silent inference retry.

Reuse the existing project creation/access and retained-draft boundaries. Commit a validated project or retain an explicitly incomplete recoverable import; do not publish a deceptively complete library entry or grant editing through renderer state. Original files remain untouched.

## Codex integration is a separate engineering decision

Codex is the requested intelligence layer. Keep the established own-account direction: the user's authorized ChatGPT/Codex account, with no developer API key, shared billing, hosted proxy or silent alternative route.

The current repository has an important boundary: [codex-local-policy.ts](src/main/ai/codex-local-policy.ts) refuses the existing Codex content-execution route because tool/content-log isolation is unresolved. The active [ChatGPT plan milestone](chatgpt-plan-implementation.md) instead covers a bounded direct conversation flow. That milestone does not implement file import, authorize broader tools or establish that an installed commercial importer is ready.

The import implementation plan must establish an eligible Codex route, confinement, account/usage behavior, protected operation ownership and deployment prerequisites before enabling analysis. It must not remove existing refusals or silently substitute direct Responses merely to make an Import button work. These are current Collie source constraints, not a claim that the requested product direction is impossible. No new provider integration or account action is performed by this document update.

## What the later implementation plan must settle

- Initial readable formats and representative user workflows, including mixed files and unfamiliar structured exports; distinguish syntactic file support from semantic interpretation.
- The exact Codex connection/execution contract and the files/text it can access, plus user-visible analysis scope, allowance limits, Stop and recovery behavior.
- A versioned conversion proposal with traceable input references, validation, duplicate handling, human corrections and a complete import report.
- Portable formats for imported chats and research provenance, including retained-copy migrations and every Save/Open/Backup/Restore/Duplicate consumer.
- Safe creation of one project from one confirmed import, including the current project-type/details/access choices and no destination until first Save.
- The review experience and manual acceptance scenarios for accurate content preservation, ambiguity, incomplete analysis and recovery.

The [code audit's CA05 finding](code-audit.md) about import retries depending on an expired picker grant/original file remains relevant to that future implementation. Reuse its repair if available, or design the new import's receipt-only reconciliation explicitly. This dependency belongs here, not in the storage stage list.

This document records the new direction; it is not yet a stage-by-stage implementation authorization. Existing deterministic import/Open/Restore features remain available on their current contracts. No AI calls, new imports, source changes or runtime checks were performed. Future implementation follows the repository's required format/lint/typecheck and user-owned manual acceptance workflow.
