# Conversation reference saves v1

AC07, October 8, 2026. SQL/minimum reader **21** adds `conversation_sources`. Archive/editor format 1, conversation records 2, capture 5, direct execution/binding 6, and research results 1 remain unchanged. Frozen schemas through 20 retain their exact readers. The existing retained-copy 20→21 migration adds an empty table without rewriting sources, writing, conversations or previous operation receipts.

## Local command and receipt

`reference-preview` accepts the exact completed assistant revision, a provider web-reference URL or selected canonical answer text (at most 2,000 UTF-16 units), and proposed ordinary source metadata. The worker checks that origin against the retained answer and uses the existing normalized DOI/ISBN/URL/title-and-author duplicate matcher. At most 12 candidates carry ID, revision, title and match reason. Candidate absence is not proof of bibliographic uniqueness.

`reference-save` freezes an operation ID, origin, reviewed metadata, explicit verification checkbox, candidate snapshot and optional chosen existing source. A single worker transaction:

1. Returns an existing matching receipt; a changed request with that operation ID conflicts.
2. Validates the original completed answer and current candidate snapshot. Any changed candidate requires another review. A selected existing source must still be an active candidate.
3. Creates an ordinary source through the same normalized row creator as Research, or links the explicitly chosen existing source without changing its metadata or verification state.
4. Stores an immutable v1 receipt in `conversation_sources`, linked to the original attempt and accepted source. Advances the ordinary project commit and stores the same digest in `domain_operations`.

Receipt fields are the frozen save fields plus version, digest, source ID, conversation ID and ISO creation time. Metadata in the receipt is the user's original reviewed input; the ordinary source uses existing normalization. The original provider title/reference remains in the linked immutable research response. Receipts contain no workspace IDs, local paths, account credentials, execution authority or file grants. Repeated delivery reconciles the original receipt and does not create a second source. A deliberate later separate save is a new operation; duplicate matching remains explicit.

Limits: 100 receipts per answer, 100,000 per project, 192,000 UTF-16 units per receipt, 20 rows per provenance page. Ordinary source field/count limits still apply. Runtime writes and portable validation enforce receipt shape, digest, attempt/revision/reference membership, conversation/source links and matching domain receipt. Invalid input cannot establish a verified quotation or excerpt.

## Retained UI and citation handoff

One review lives under the retained conversation provider. Closing the dialog or using Keep for later preserves edits; the chat menu reopens it. Only explicit discard clears an unsaved review. An uncertain save freezes fields and keeps the exact operation for Retry this save; replacement, Close and access changes remain protected through the draft registry. Unsubmitted review fields are session-only and are not silently written to the project or sent to a provider.

Only a title is required. Other metadata starts empty unless supplied by the provider reference or user. Selected answer text pre-fills a plain-text book title for editing; AC08 maps supported Markdown text spans back to the exact canonical substring (including intervening formatting) for provenance, while excluding generated badges/images; all existing supported bibliographic types remain available. Verification starts false. Existing-source reuse never merges or marks that source verified. Original-file import, inspection and verified excerpts remain separate existing workflows.

After a receipt, the workspace advances only its project head and refreshes the source read model. Dirty Research forms and manuscript ownership remain intact. Explicit source links follow later canonical merges for display, and removed sources remain labeled removed. Research → Usage and context shows paged chat provenance; chat archival does not delete sources or citations.

Cite captures the current manuscript editor, document and selection before an asynchronous source read. Changed focus, scope, document, destroyed/replaced editor, composition, removed source or unavailable writing refuses the handoff. A source dialog exits before the existing citation dialog opens. The ordinary citation form starts with the chosen source and still requires Apply citation. Its existing document/selection guard and manuscript history/protection own insertion. No answer text is inserted automatically.

## Portability and exports

The table participates in full database snapshots, Save, Backup and project-copy rekeying. Original reference/receipt bytes and digests remain unchanged when the owning project ID is rekeyed. Portable graph validation checks the new relationships. Full-table retention digests include these rows; AI-linked working-copy removal remains refused.

Conversation text exports include historical source-save receipts and their original references. Bibliography and manuscript exports use the ordinary sources and citation/compilation pipeline; bibliography exports explicitly declare that project-only provenance and verification are omitted. The portable `.collie` file preserves the provenance. No network fetch, inference, attachment import or automatic verification occurs when saving or citing a reference.
