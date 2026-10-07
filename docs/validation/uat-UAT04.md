# UAT04 — Optional project subtitles

October 6, 2026. **Implementation complete — awaiting user testing.** Implements UAT04 only from the [reviewed UAT plan](../../uat-implementation-plan.md). Earlier UAT01–UAT03 work was preserved. UAT05 remains unstarted; release remains NO-GO.

## Implemented behavior and source evidence

Subtitle is optional in project creation and Project details, appears only when nonempty beneath the Write title, and remains separate from title/byline/description. Shared/domain validators enforce a trimmed single line, empty-for-none, 500 UTF-16 units, no C0/C1 controls or U+2028/U+2029. Forms retain explicit drafts, focus the invalid creation field, normalize before dispatch and freeze exact uncertain requests. Metadata acceptance merges subtitle into the retained project without replacing editor payload/document identity/epoch.

SQL/minimum reader **15** adds subtitle through retained-copy **14→15** migration. The original details DDL and schemas 10–14 remain frozen. Migration validates source details and copies every original field/revision into the new candidate table with empty subtitle; title/head/writing/history/digests remain unchanged. Version-aware stored readers and shared manifest admission cover old/new images. Existing final migration validation/publication and portable inspection remain authoritative.

Reviewed `portable-db.ts`, `snapshot.ts`, archive/compression policy, `incoming.ts`, Save/lifecycle operations and retention's `portableContentDigest`: central version/readers propagate the change; whole-database captures/rekeying and full table/row hashes retain/include subtitle. These consumers needed no alternate copy path or policy change. Stored/deflated reads, expanded budgets, retained originals and all removal protections remain.

Active setup is **`collie.project-setup.v3`**. Highest-present-version precedence refuses malformed-state fallback. Frozen v1/v2 request readers preserve request property order/shape/operation IDs and receipts; conversion adds empty subtitle only to the outer draft. V2 editing intent/completion remain, and v1 invents no consent. Existing successful-write-before-dispatch/designation/opening paths now write v3 before retiring older keys. Completion cleanup retains the newest tombstone until old keys are gone. New personal requests declare `metadataVersion: 2` with subtitle; omitted-version historical requests remain accepted/digested verbatim. The trusted tutorial intentionally retains its durable historical creation shape and defaults to empty subtitle at the creation boundary.

Frozen compilation **5** validates/captures subtitle with title/byline and includes it in preview digests. Both export manifest paths already serialize complete `model.metadata` and `model.version`; no report format changes were needed. Citation compilation supplies the separate field. Enabled DOCX/HTML/PDF/Markdown/text title pages render a nonempty subtitle between title and byline; disabled pages and empty subtitles add nothing. Existing text/HTML/Markdown escaping, main-title DOCX/PDF properties, filenames, source maps, hierarchy, recipes and opt-in description behavior remain. Export UI wording now reflects this output.

See the [persistent contract and consumer matrix](../formats/project-subtitles-v1.md) and [manual guide](../manual-testing/uat-UAT04.md). Manuscript/history **2**, AST/archive **1**, search projection **2**, writing positions **1**, AI attempt/capture/binding and native file/journal formats remain unchanged. Main/preload/worker continue to share exact project validators and existing edit capability.

## Required checks and remaining acceptance

Inspected package scripts and format/lint ignores before formatting; vendor/generated files and historical tests remain excluded from mutation. Used the repository-local Node **24.21.0** / npm **11.19.0**. Ran **`npm run format` → `npm run lint` → `npm run typecheck`**; all completed with exit 0 and no warnings/errors, including node/web TypeScript targets. The initial pass was clean and the final pass includes documentation/refinements.

Applied the React best-practices source checklist to versioned local storage, field labels/errors/ref focus, retained form requests and unchanged editor ownership. Source review is not a runtime test. No tests/test code, builds, app launches, browser automation, screenshots, benchmarks, audits or runtime probes were added/run.

No user acceptance is recorded. Migration, native Save/copy/restore, old setup reconciliation, caret/undo, export layout/properties/Unicode and keyboard/zoom/contrast remain unobserved. Unavailable naturally retained setup/older-file cases remain pending rather than being manufactured. Stop for Josh's results before UAT05.
