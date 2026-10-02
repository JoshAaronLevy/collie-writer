# I13 — Exact mechanics review and human application

October 2, 2026. **Implementation complete — awaiting user testing.** No application, provider, build or check was executed. I10 remains partial and inference unavailable. This is the I13 foundation; P01–P09, I14/I15 and publication work are not implemented here.

## Scope and presentation

The existing AI writing companion has a Conversations / Proofreading selector. Both panels remain mounted while hidden and inert; neither replaces the manuscript or adds a workspace column. A persistent `ProofreadingProvider` owns the selected run, local capture, page, pending exact command and operation status. The existing draft registry protects an unsubmitted capture on project replacement/close/access changes. A global notice returns to the relevant feature. This selection is session-local, with no new localStorage record.

Mechanics is the only mode. The user chooses a selected passage or current text section, reviews the exact request and coverage, then saves the review locally or explicitly requests eligible inference. There is no chapter/manuscript batching. A saved unsent capture is never a queue for future activation. To run again, explicitly capture and review the current scope as a new attempt. Saved reviews page by 20, findings by 10. All finding decisions remain visible, including ignored items. Ignore and Undo ignore affect only that finding and never call the provider.

## Capture and result contract

`shared/ai-content.ts` remains the common capture/attempt fields. The selection helper moves from the conversation folder to `features/ai/selection.ts`; the domain capture walker and worker digest are shared with I12. `shared/proofreading.ts` and `domain/ai/proofreading.ts` define the mechanics-specific contract rather than putting findings in chat messages or manuscript annotations.

A capture freezes the exact document revision, project head, source selection, block IDs, UTF-16 ranges, original text, compatible marks, coverage, en-US language, `mechanics` mode, `mechanics-v1` template, prompt/context and canonical SHA-256 digest. The worker derives text from the protected document. Renderer-supplied text cannot replace this capture. Changing the head or document before submission requires another review; unsaved typing is protected first. Selecting another section does not retarget a saved capture.

Supported replacements stay inside one contiguous text run in a paragraph, heading or list paragraph. Adjacent text nodes with equivalent marks can form one run. Mark changes and rich atoms separate runs. Tables, images, quotation blocks, citation/footnote atoms and footnote bodies are excluded; coverage lists their applicable counts. Breaks/separators are not replaceable. A mixed image selection asks for a narrower text selection; section review lists image exclusions. Unsupported control text, malformed surrogate content and boundaries inside graphemes are excluded. A section with no supported text is refused. Nothing is silently flattened, trimmed or widened.

One request includes at most 128 runs and 64,000 UTF-16 context units **including its serialized envelope**. The prompt retains I10's 16,000 ceiling; output retains 128,000. Text and run-local labels are sent inside one declared context, with the existing document identity/revision/label envelope; marks and block replacement coordinates stay in the local capture. No research, conversations, other sections, byline or description are implicitly attached.

The prompt requests one complete JSON object with exact `version`, `mode`, and `findings` fields. This uses I10's actual text output, not an invented structured-output SDK API. Each finding has `targetId`, local UTF-16 `from`/`to`, exact `before`, `replacement`, `reason` and `kind`. Replacement text is plain, single-line, bounded to 4,000 units; the original span has the same bound. Explanations are at most 1,000 units; there are at most 100 findings. Empty findings is valid. Unknown keys/targets, mismatched quotes, grapheme splits, unsupported text, overlapping ranges or malformed/incomplete JSON reject the whole result. No partial subset becomes applicable. Findings receive app-owned UUIDs only after a genuinely completed and fully valid result.

The run outcome, result validation, finding decision and current target validity are distinct. Actual incomplete/invalid output remains readable as inert text. An unavailable request creates no findings. Saved output is not an accuracy guarantee.

## Shared execution, recovery and access

I12's main coordinator is extracted to `main/ai/content-service.ts`; conversation and proofreading services are narrow adapters over this same implementation. It reuses I10's real prepare/start/cancel/read/retry methods, intent-before-dispatch, exact device-local bindings, increasing sequences, coalesced writes and read-only recovery. There is still one `AiService`, encrypted provider journal and global 64-job cap. Neither feature silently starts inference on recovery or deletes jobs to make room. The two content owners block new dispatch while the other needs protection. All account/funding/isolation/packaging gates remain unchanged.

Main and preload expose only `proofreading.command` with validated public actions and sanitized events. Binding and output settlement remain internal worker commands. Main authorizes new review intents and decisions as edits. Reading and protecting previously authorized outcomes remains possible without a new edit or inference grant. There is no proofreading access-drain privilege. Main close/update/access/project-replacement guards now include both content owners. Failed output writes retain the same operation for disk-only retry.

## Apply, undo and history

Apply is a separate human command with an operation UUID, expected project head and finding revision. The worker requires a valid pending finding, the captured active text section and exact document revision, original run coordinates/text/marks and supported replacement boundaries. It refuses stale targets without fuzzy matching or rebasing.

In one transaction the worker retains a **Before proofreading correction** structural checkpoint, replaces the bounded text, updates the document revision and editor IDs/anchors/citation projections/annotation mapping, advances the project head, records the accepted finding and decision history, and writes the standard idempotent receipt. Ignore/Undo ignore record only a human decision and project commit. Retried Apply reconciles its receipt before revisiting a replacement. Main checks an existing exact receipt through a read-only worker action, so a completed correction can be acknowledged after access changes without authorizing a new edit.

The workspace controller owns an in-flight application, synchronously locks editor document mutations, and pauses conflicting saving/navigation while acknowledgment is unknown. After reading the stored result, it compares the exact resulting document and dispatches one normal ProseMirror transaction into the retained editor. Existing undo history and rich content remain intact; no editor remount or wholesale buffer replacement occurs. A production transaction filter blocks keyboard/programmatic edits while the correction is pending. Only that exact approved transaction can pass the lock. Unconfirmed acknowledgments retain the exact local request and expose Reconcile correction.

Editor Undo follows normal transaction history and does not erase the historical acceptance record. The finding links to its retained pre-correction checkpoint in the existing History comparison. Full history restore is explicitly reviewed and first retains later work. I13 never offers a one-click full-document rollback disguised as a surgical correction undo. Any document revision change, including accepting one finding or Undo, makes remaining old-revision findings stale. P01 owns future grouped application.

## Persistence and limits

[Format 12](../formats/working-project-v12.md) owns the retained 11→12 migration and complete consumer matrix. Review data travels in customer project files and backups; execution bindings, credentials and provider journals do not. Clean manuscript exports remain compilation 3 and exclude findings/prompts/review metadata. No new report format is claimed; P09 owns a dedicated review-report export.

There is a 10,000-review project ceiling, at most 100 findings per run and bounded individual capture/output reads. The existing portable database limit still applies. There is no automatic retention expiry, repeated-issue suppression, grouped Apply, inline hover flags or broader review mode. No dependency, remote origin, runtime registration or persistent preference was added. Existing CSP, semantic CSS, notices and ad-free policy remain.

All migration, portable copy, editor/IME/undo, keyboard/focus/zoom/screen reader, native filesystem, live output and quality observations are pending. Follow the [manual guide](../manual-testing/improvement-I13.md). Release remains NO-GO.
