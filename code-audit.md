# Code audit and staged repair plan

Audit conducted: October 4–5, 2026; document completed October 5, 2026  
Source baseline: `8aa2fd7` — `Fixed prettier problems`  
Status: **Plan reviewed; CA01–CA02 implementation complete — awaiting user testing. CA03–CA18 remain pending.**  
Release status: **NO-GO remains unchanged.**

**Workflow amendment — October 5, 2026:** Josh now requires the assistant to run `npm run format`, `npm run lint` and `npm run typecheck` after code changes, fix all reported issues including warnings, and rerun until clean. The execution policy below reflects that amendment. The audit's original findings and historical record of commands not run are unchanged. Automated tests, builds and app launches remain prohibited; runtime acceptance remains user-owned.

## Assessment

The repository needs functional repairs as well as formatting consistency. The highest-priority findings concern export publication, preservation of drafts during renderer errors, and reconciliation of operations whose responses are lost or delayed. These are concrete control-flow problems in the current source. Broader concerns include implicit React effect lifetimes, very large state owners, expensive repeated reads, and documentation that describes superseded contracts.

The recent cleanup commit changed 154 files. That does not establish when the problems below were introduced, and this audit does not attribute them to that commit. Formatting changes and hook dependency changes need separate review: an editor's mount lifetime, an event subscription's lifetime, and the values its callbacks read are different contracts.

There are substantial safeguards worth preserving: narrow IPC, isolated renderer privileges, strict archive validation, retained migrations, operation receipts, explicit user review of AI context, and local recovery distinct from project-file Save. The plan repairs gaps in those mechanisms before extracting their owners into smaller modules. A wholesale rewrite would put those protections at unnecessary risk.

## Scope and evidence limits

This was a read-only source/configuration/documentation audit followed by creation of this file. No application code, configuration, existing tests, or generated assets were changed. No tests, lint, formatting checks, typechecks, builds, app launches, browser automation, benchmarks, dependency audits, or verification scripts were run. No accounts, provider requests, purchases, deployments, or release actions were performed.

The review covered the production source inventory and traced representative end-to-end paths through renderer, preload, main, worker, and persistence. The inspected TypeScript/JavaScript inventory across `src`, `services`, and `scripts`, excluding bundled public assets, contains roughly 52,800 lines. This is a broad source audit, not a claim that every line, branch, platform, dependency, or historical format was exhaustively proven correct.

Evidence labels used below:

- **Source-confirmed:** the stated implementation and problematic control flow are present. The consequence is inferred from source; it has not been reproduced here.
- **Risk:** there is a specific structural weakness or missing local invariant, but existing caller guards may limit reachability. It is not a confirmed user-visible failure.
- **Acceptance gap:** source or configuration exists, but required owner observations are absent. An intentional disabled feature is not classified as a coding defect.

Priorities:

- **P1:** repair before relying on the affected workflow; includes misleading outcomes, draft/recovery risk, or broken normal functionality.
- **P2:** address during stabilization before shipping; includes lifecycle fragility, native usability, maintainability, and scale risks.
- **P3:** repository/documentation polish, except where inaccurate information would affect a release decision.

There is no claim of a clean lint/typecheck result, current dependency-advisory clearance, proven exploit, or defect-free product. Native output fidelity, timing, accessibility, account eligibility, and packaged behavior remain user-owned observations.

### Coverage map

| Area               | Principal source reviewed                                                                                                    | Focus and remaining limits                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Renderer ownership | `main.tsx`, `App.tsx`, workspace controller/session/views, draft registry, retained regions                                  | Mount lifetime, transitions, local protection, error recovery; no UI execution                                                          |
| Editor             | `RichDraft.tsx`, editor adapter/selection helpers, writing workspace                                                         | Callback capture, command targeting, retained selection/undo; IME/native behavior unobserved                                            |
| Research           | Notes, Sources, SourceInspector, Evidence, Search, ResearchData; corresponding worker modules                                | Exact retries, original-file dependence, stale reads, read amplification; parser/output coverage unobserved                             |
| Save and storage   | StorageWorker, project file IPC/lifecycle, repository, project files, streams, archive/storage helpers                       | Timeouts, ownership, retained-copy migration and safe publication; native filesystem behavior unobserved                                |
| Export/import      | Export UI, shared contracts, main native pickers, worker jobs/compilers/interchange                                          | Capture/start/publication/report lifecycle and selected-file grants; independent reader fidelity unobserved                             |
| AI                 | Main AI service/direct route/content coordinator, conversation and proofreading services/providers, versioned format records | Route separation, retained operations, project handoff and disabled capabilities; no login/inference or external contract certification |
| Security/privacy   | Main security/windows/protocols, preload validation, print boundary, account storage                                         | Privilege boundaries and explicit capabilities; no penetration testing or dependency-advisory audit                                     |
| Commerce           | Desktop entitlement boundary and `services/entitlements/`                                                                    | Queueing, provider calls, webhook admission, operational separation; service remains undeployed/unaccepted                              |
| Repository/release | Package/TypeScript/ESLint/Prettier/editor settings, builder configs, asset manifest, README and release records              | Ownership of generated/vendor files, current-state drift and unfilled release gates                                                     |

## Findings

### F01 — Export publication rejects its own temporary hard link

**P1 · Source-confirmed · CA01**

[Export jobs](src/worker/exports/jobs.ts), `publishNew`, lines 240–268, creates `destination` with `link(temporary, destination)`, then calls `fileHash(destination)` before unlinking `temporary`. [The hash helper](src/worker/projects/streams.ts), lines 85–94, rejects any file whose `nlink !== 1`.

On a filesystem supporting the publication operation, the output has two links at that point. The helper therefore rejects the file the publisher just created. `renderBatch` reports a failed format even though output may already exist. Markdown can fail while publishing an image sidecar before publishing the main document. This also affects a single format selected through the compilation/batch path. The separate legacy DOCX `render` path already unlinks the temporary name before hashing.

Repair the publication ordering and failure bookkeeping while retaining atomic no-overwrite publication, directory sync, content inspection, and prior-file protection. Do not relax the global hard-link rejection to accommodate a publisher-owned intermediate state. Node documents `stats.nlink` as the file's hard-link count in its [filesystem reference](https://nodejs.org/api/fs.html#statsnlink).

### F02 — Renderer error fallback destroys draft owners and offers an unguarded reload

**P1 · Source-confirmed · CA02**

[The root renderer](src/renderer/src/main.tsx) puts `ErrorBoundary` above `App` and the persistent workspace. [ErrorBoundary](src/renderer/src/components/ErrorBoundary.tsx) replaces all children on an error and calls `window.location.reload()` from its recovery button.

An exception caught there unmounts the session, editors, and in-memory form/composer owners. The reload also bypasses [the normal close/protection handshake](src/main/lifecycle.ts). Merely adding a confirmation to the button would not preserve owners already destroyed by the fallback. Local protection limits some manuscript exposure, but does not make every explicit form or composer draft durable.

Isolate recoverable presentation failures beneath persistent owners where possible, and route recovery through a trusted lifecycle action. Explain exactly what was protected and what remains uncertain. Do not promise recovery of memory already lost to a renderer crash.

### F03 — A caller timeout is treated as worker settlement

**P1 · Source-confirmed · CA03**

[StorageWorker](src/main/storage-worker.ts), `request`, `requestFile`, `idle`, and the result handlers, removes requests from pending maps after 60 seconds. That does not cancel work in the utility process. `idle()` only checks those maps. A late project response is discarded before validation and before the access observer runs.

Consequently, a timeout can make main report an idle boundary while a queued or executing operation still exists. [AccessService.requireSettled](src/main/entitlements/service.ts) and [AI content settlement](src/main/ai/content-service.ts) rely on that boundary. Discarding the late response also omits its normal state observation. This is a confirmed distinction missing from the bookkeeping; actual conflicting execution or data loss is not established.

Separate the caller's wait deadline from the worker's operation lifetime. Retain bounded ownership/settlement metadata until a validated result or confirmed worker exit. Reconcile a late response only with its original request and scope; never acknowledge a different request or automatically resend a mutation.

### F04 — Slow storage initialization becomes a terminal unavailable state

**P2 · Source-confirmed · CA04**

[StorageWorker.start](src/main/storage-worker.ts) starts a ten-second timer that calls `unavailable(child)`. That changes status and asks the child to shut down. `receive` accepts `ready` only while status is `starting`, so a late successful initialization cannot recover the same attempt.

[Worker initialization](src/worker/index.ts), lines 303–345, awaits native storage setup, repository initialization, and file-service initialization before announcing readiness. Slow process startup or catalog/filesystem operations can therefore turn eventual success into refusal. These initializers do not scan an entire library; library size alone is not evidence that this timeout is reached.

Introduce a truthful slow-start state and deliberate recovery policy. Preserve exclusive ownership and cooperative shutdown. Increasing the timeout alone leaves the same faulty distinction between slow and failed initialization.

### F05 — Import replay depends on an unexpired picker grant and sometimes the original file

**P1 · Source-confirmed · CA05**

[Project IPC](src/main/projects-ipc.ts) rejects expired/window-invalid grants before dispatching import requests. The current lifetimes include ten minutes for images/attachments, thirty minutes for text/Markdown, and sixty minutes for bibliography imports. These are appropriate limits on new file access, but no separate receipt-only reconciliation route exists for an already-dispatched operation.

[commitInterchange](src/worker/projects/interchange.ts), lines 453–465, can return a stored receipt before rereading the source, but an expired grant prevents reaching it. [commitImport](src/worker/projects/sources.ts), lines 838–867, rereads and parses the original before consulting `priorOperation`. `attachSourceFile`, lines 1025–1108, checks the current source/attachment count, reads the original, and stages its bytes before its receipt check.

If a mutation commits but its response is lost, later retry can fail because the grant expired or the original moved/changed. Renderer paths that clear pending input on a non-`UNAVAILABLE` error can then lose the exact retry identity. This does not prove duplicate creation in every import path, but it breaks reliable reconciliation.

Separate recovery of a recorded result from permission to read a file again. Preserve original digests and exact request identity; do not solve this by accepting expired grants for new reads or silently assigning a replacement operation ID.

### F06 — Source inspection retains exact operations only for excerpts

**P1 · Source-confirmed · CA06**

[SourceInspector.mutate](src/renderer/src/features/projects/SourceInspector.tsx), lines 312–339, retains `{ operationId, change }` only for `excerpt`. `ensure`, `choose`, `start`, `page`, and `finish` generate a new UUID on each invocation. The catch message tells the user to retry a pending excerpt even for other operation types.

The extraction loop breaks after a page mutation returns no result, then issues a separate `finish` mutation. It does not first determine whether that page write committed. Worker receipts and revision checks cannot reconcile a request whose original identity was discarded. A lost `choose` acknowledgment can also leave a later new-ID retry facing a changed revision.

Retain the exact inspection mutation and extraction cursor until settlement. Pause on an unknown storage result; distinguish that state from a known parser failure. The worker checks coverage before describing extraction as complete, so this finding does not assert that absent pages are currently recorded as successfully indexed.

### F07 — Export start can succeed without returning a recoverable job identity

**P1 · Source-confirmed · CA07**

[DocxExportPanel](src/renderer/src/features/projects/DocxExportPanel.tsx), `start` and `startCompilation`, sends options without a client-owned operation identity. [ExportJobs.start/startBatch](src/worker/exports/jobs.ts) generates a new UUID and schedules work before returning it. The renderer tracks the job only after a successful response.

If the acknowledgment is lost or arrives after the main timeout, export can continue without a job the UI can address. Retrying starts a new operation. The exception messages also state that export did not start, which is stronger than the available evidence.

Capture one exact export-start intent before dispatch, bind the native destination approval to it, and make its result recoverable. An unknown response must remain visible as unknown. Preserve the existing session-owned job scope; adding a restart-persistent export catalog would be an additional product/storage decision, not an incidental refactor.

### F08 — Failed report protection discards the live export outcome

**P1 · Source-confirmed · CA08**

[ExportJobs.renderBatch](src/worker/exports/jobs.ts) swallows report-write failures and then removes the job from `this.jobs`. The single-DOCX error/finally path has the same protection gap. `status()` subsequently falls back to the older report and can relabel its stale rendering state as interrupted.

If output publication succeeds but the final report cannot be written, the last authoritative in-memory outcome is lost. An interrupted label is conservative, but the user loses precise per-file results and a way to retry protecting that result without regenerating output.

Keep an unprotected terminal outcome addressable, expose a local report-protection retry, and release it only after protection or an explicit recovery handoff. Do not hide disk errors, rerender automatically, or discard already-published outputs.

### F09 — Native editing commands omit ordinary fields and note editors

**P2 · Source-confirmed routing gap; platform behavior unobserved · CA09**

[The Edit menu](src/main/menus.ts) uses custom Undo/Redo/Paste as Plain Text actions instead of native roles. The sole [renderer action listener](src/renderer/src/editor/RichDraft.tsx), lines 204–233, returns for `noteMode`, dialog controls, and active inputs/textareas/selects. There is no fallback in that dispatch path.

Using those menu commands while editing a project title, conversation composer, or note therefore has no intended handler. Keyboard accelerator interaction still needs native observation; browser editor shortcuts alone do not establish that menu actions work.

Route commands to the actual focused editor, including notes, or to native text-control actions as appropriate. Keep manuscript-specific Find separate and preserve hidden/inert, read-only, and composition guards. Electron describes menu accelerators in its [keyboard shortcut documentation](https://www.electronjs.org/docs/latest/tutorial/keyboard-shortcuts).

### F10 — Effect dependency and callback-lifetime contracts remain implicit

**P2 · Risk with specific source evidence · CA10, CA14**

[RichDraft](src/renderer/src/editor/RichDraft.tsx), lines 159–200, creates the editor in an empty-dependency effect that captures `payload`, `imageUrl`, `references`, `noteMode`, `onChange`, `onIssue`, and `onReady`. Some changing values deliberately use refs, while callbacks remain those supplied at creation. [WritingWorkspace](src/renderer/src/features/workspace/WritingWorkspace.tsx) keys the editor by project/document/epoch, so some captured values are intentionally tied to that lifetime.

Related patterns occur in workspace cadence/subscription effects, [export polling](src/renderer/src/features/workspace/useExportOperations.ts), and conversation/proofreading providers. For example, the AI status effects read `active` or `bundle` in addition to their listed dependencies. Several callbacks already read current refs, so a missing dependency is not automatically a demonstrated stale-state defect.

For each effect, specify its resource identity, mutable callback inputs, setup/cleanup symmetry, and response-scope guard. Stabilize the right callbacks or use an explicit current-value mechanism where appropriate. Do not add every captured value to editor creation and recreate the editor on typing, or suppress the warning across a file. React's [exhaustive-deps guidance](https://react.dev/reference/eslint-plugin-react-hooks/lints/exhaustive-deps) explains why missing dependencies can retain stale closures and why restructuring the effect is often the appropriate fix.

### F11 — Research refresh can replace the entire workspace project snapshot

**P2 · Risk · CA11**

[useWorkspaceController.afterNoteCommit](src/renderer/src/features/workspace/useWorkspaceController.ts), lines 1530–1536, captures the current scope/document, awaits `openSection`, and passes the entire result to `updateHead`. It does not locally recheck the live scope, document, or head after that await.

The same controller's `refreshConversationHead`, immediately above it, guards scope/document/head changes and merges only head/time into the live project to preserve the manuscript owner. Research uses the less defensive path for notes, sources, inspection, and evidence. Existing busy/draft guards reduce possible interleavings, so a user-visible race is not claimed as reproduced.

Give research commits the same explicit metadata-refresh contract. A late result must not switch the selected document, replace newer metadata, or become the authority for a different retained editor.

### F12 — Large owners and misplaced low-level helpers make changes hard to contain

**P2 · Maintainability risk · CA12, CA13, CA14**

At this snapshot, `useWorkspaceController.ts` has 2,105 lines, `repository.ts` 1,566, `SourceInspector.tsx` 1,411, `sources.ts` 1,380, `project-files.ts` 1,145, and Sources/Notes/Evidence panels each exceed 1,000 lines. Size alone is not a defect. The concern is that individual modules combine read models, draft ownership, dispatch/retry, native actions, and presentation, making the invariants above difficult to review independently.

`WorkspaceSession` also exports the controller's whole return object, including setters and mutable refs, as its public API. Main services import generic filesystem/digest helpers from `worker/storage`. `domain/projects/export-path.ts` performs Node filesystem work even though the web TypeScript project includes all of `domain`. These are dependency-direction issues, not evidence of a current renderer privilege escape.

Extract by real ownership: a persistence coordinator, read-only view models, feature draft/operation owners, presentation components, and a clearly native-only shared infrastructure layer. Preserve a single persistent workspace owner. Avoid a generic request framework or a file split that merely moves shared mutable state behind more names.

### F13 — Unrelated project revisions trigger expensive whole-feature reads

**P2 · Source-confirmed work pattern; performance impact unmeasured · CA15**

[ResearchDataProvider](src/renderer/src/features/research/ResearchData.tsx) refreshes on every head change. Notes and Search do likewise. Search loads full notes to obtain tag filters and full sources to obtain source titles. [readNotes](src/worker/projects/notes.ts), starting at line 70, parses all note bodies and performs separate link/label queries per note.

Retained hidden panels keep their effects alive. Conversation output can also advance heads through the coalesced content coordinator. These mechanisms can repeat large reads for changes unrelated to the displayed research data. The aggregate context value adds broad renderer updates. Actual latency and memory use were not measured.

Use narrower saved-data projections, batched relationships, coalesced/in-flight reads, and explicit invalidation boundaries. Add pagination only with stable order and preserved selections. Keep dirty buffers and pending operations mounted. Also bound purely presentational history: `useExportOperations` accumulates completed jobs for the entire session with no dismiss path. Dismissing UI history must not delete durable reports or recovery artifacts.

### F14 — Formatter scope includes vendor artifacts, and warning policy is weakly communicated

**P2 · Source-confirmed configuration risk · CA16**

[`package.json`](package.json) defines `format` as `prettier --write .`. [`.prettierignore`](.prettierignore) does not exclude `resources/vendor/` or `resources/licenses/`. Those directories contain the vendored Paged.js bundle and the bundled unmodified citeproc source, whose paths and hashes appear in [the asset manifest](resources/asset-manifest.json). Whole-repository formatting can rewrite files that should be preserved as upstream artifacts. No hash mismatch is asserted here.

[`eslint.config.mjs`](eslint.config.mjs) likewise lacks those vendor exclusions. It inherits hook recommendations and the toolkit Prettier config; the installed configurations classify `exhaustive-deps` and `prettier/prettier` as warnings. The lint script has no warning limit. The configuration uses the toolkit's recommended TypeScript set rather than a type-aware policy. Thus a successful exit from a user-run lint command would not, by itself, mean hook or formatting warnings were absent. No lint command was run for this audit.

The editor settings nominate Prettier for TS/JS/JSON but omit TSX and do not recommend the Prettier extension. Establish explicit authored/vendor/generated boundaries and a documented warning policy. Keep behavioral fixes separate from formatting-only diffs. Do not add automation, hide authored code through broad ignores, or enable a new rule set and suppress all resulting findings.

### F15 — Current-state documentation and release metadata contradict DP01

**P2 for release decisions; P3 for navigation · Source-confirmed · CA17**

[README](README.md) opens with the older Codex route and says conversation Send remains unavailable under CD03. Its schema overview still points to SQL 9. [The release-candidate record](docs/validation/release-candidate.md) and [manifest](docs/release/release-candidate-manifest.json) list SQL/minimum reader 9 and compilation 2.

The active [DP01 plan](chatgpt-plan-implementation.md), [format record](docs/formats/chatgpt-plan-v1.md), and current AGENTS checkpoint establish the owner-only direct conversation route, SQL/minimum reader 13, compilation 3, and AST/archive 1. Runtime acceptance remains pending. The discrepancy can send a maintainer to the wrong owner or attach incorrect formats to a future candidate.

Add one clear current-state entry point. Preserve dated decisions and old readers as history, label superseded checkpoints, and distinguish source contract values from values recorded for an actual built candidate. Keep all absent evidence and release approvals absent.

### F16 — Commerce has a process-wide bottleneck and shared admission limit

**P2 now; prerequisite before commerce activation · Source-confirmed design risk · CA18**

[`services/entitlements/server.mjs`](services/entitlements/server.mjs) sends customer routes and webhook reconciliation through one `serialQueue`. Provider reconciliation can make many network requests; [`Paddle.list`](services/entitlements/paddle.mjs) permits 200 pages with a 15-second deadline on each request. One slow customer can delay unrelated customers and event reconciliation.

The same process-wide 600-request/minute counter covers public assets, customer endpoints, and webhook intake. The queued-work limit is checked before reading a body but incremented only afterwards, so concurrent body readers are not reserved against that limit. These controls do not isolate customer workloads or protect webhook admission from unrelated traffic.

Introduce bounded admission at entry, workload-specific limits, and customer-scoped reconciliation ordering while preserving database transaction safety, webhook deduplication, and monotonic signed grants. Define the reverse-proxy trust boundary and graceful service shutdown. This is undeployed service engineering; it is not evidence of an observed outage, attack, or permission to deploy or take payments.

## Contracts every repair must preserve

- **Required code checks; runtime testing stays with Josh.** After code changes, run `npm run format`, `npm run lint` and `npm run typecheck`, fix reported issues including warnings, and rerun until clean. Follow the scope protections and truthful reporting requirements in [AGENTS.md](AGENTS.md#user-owned-manual-testing--standing-instruction). Documentation-only edits do not require those commands. No assistant-written or assistant-run automated tests, builds, app launches, browser work, benchmarks, testing infrastructure or CI substitutes. Existing test code remains historical and untouched unless its removal is explicitly requested.
- **Current formats:** SQL/minimum reader 13, AST/archive 1, compilation 3. Preserve historical readers, exact digests, retained migrations, original archives, independent-copy rekeying, and recovery records. A needed new persistent format requires its own consumer/migration decision; never silently change an existing digest.
- **Save semantics:** first Save asks for a destination; explicit Save retains the observed assigned file and writes local content; concurrent content changes still stop replacement. Keep 900 ms/five-second local protection, normal close's local protection, and unsaved status on reopen. Do not restore destination autosave or save-on-close.
- **Persistent ownership:** panel navigation must preserve the workspace, editor, drafts, selected revision, pending operation, and undo/selection lifecycle. Hidden/inert is intentional. Do not remount an owner merely to reduce rerenders.
- **AI scope:** DP01 is the active owner-only unpackaged direct conversation route. Keep separate encrypted credentials, explicit review, no automatic inference retries, no API-key/shared-billing fallback, and no direct proofreading activation. Historical Codex refusals stay with that route. Do not infer commercial approval or reopen the settled local architecture.
- **Security/UI:** retain sender and schema validation, native grants, sandbox/context isolation, protocol allowlists, strict production CSP, safe local paths, sanitized diagnostics, Mantine, semantic scoped CSS, and required attribution. Preserve the approved branding master.
- **Release:** existing signing, native-store, merchant, provider-commercial, output, accessibility, and scale gates remain separate. Null configuration and explicit unsupported-route refusals must not be replaced with invented credentials or bypasses.

## How to execute this plan

`CA` stages are a separate audit-repair sequence. They do not renumber MVP, I, CD, DP, or P stages, and approval of this document does not implement or authorize all stages at once. Request one stage, implement its bounded change, complete the required format/lint/typecheck work and record actual outcomes, then record **implementation complete — awaiting user testing**, provide its concrete manual guide, and wait for Josh's results. Required checks and their necessary fixes do not wait for CA16; any unsafe tool scope must be corrected narrowly before broad formatting. Report unresolved blockers instead of claiming completion.

The order below puts functional reliability first. CA16 and CA17 are small independent housekeeping stages that can be explicitly requested earlier. CA18 is on the commerce track and must finish before commerce activation; it need not delay local editor repairs.

| Stage   | Bounded result                                                       | Findings |
| ------- | -------------------------------------------------------------------- | -------- |
| CA01    | Correct new-file export publication                                  | F01      |
| CA02    | Preserve surviving draft owners during renderer recovery             | F02      |
| CA03    | Track actual worker settlement after a timeout                       | F03      |
| CA04    | Allow slow storage initialization to finish safely                   | F04      |
| CA05    | Recover exact import receipts independently of new file access       | F05      |
| CA06    | Retain source-inspection mutations through unknown outcomes          | F06      |
| CA07    | Recover the original export job after a lost start response          | F07      |
| CA08    | Retain and retry protection of terminal export results               | F08      |
| CA09    | Make native edit actions follow the focused control                  | F09      |
| CA10    | Clarify editor/workspace callback and effect lifetimes               | F10      |
| CA11    | Prevent stale research refreshes from replacing live workspace state | F11      |
| CA12    | Extract the workspace persistence owner                              | F12      |
| CA13a–d | Separate each research feature's draft owner and presentation        | F12      |
| CA14a–c | Clarify AI effects and native-only module ownership                  | F10, F12 |
| CA15a–c | Narrow repeated reads and bound presentation resources               | F13      |
| CA16    | Protect vendor artifacts and document formatting/warning policy      | F14      |
| CA17a–b | Align current documentation and candidate evidence                   | F15      |
| CA18a–b | Isolate commerce admission, reconciliation, and shutdown             | F16      |

Each stage should normally fit one focused review. If its scope expands into another state owner or a persistent format change, split it into separately requested substages before making those additional changes. Formatting-only changes should be separate from behavior changes. A refactor is complete when responsibility and invariants are clearer, not merely when a file becomes shorter.

The manual outcomes below are **targets for the proposed implementation**, not statements that current behavior passed. For each implementation handoff, supply exact visible labels and setup steps matching the resulting UI. Josh launches development with `npm run dev` using the documented Node/npm setup; packaged/native stages require owner-created artifacts. Use disposable projects and copies for file/migration/recovery scenarios. Do not ask Josh to run automated suites. Where a lost acknowledgment, crash, or disk failure cannot be safely reproduced through ordinary use, leave that observation pending; do not add fault-injection controls or ask for destructive experiments.

### CA01 — Correct export publication

**Finding:** F01. **Dependencies:** none. **Status:** implementation complete — awaiting user testing.

October 5, 2026: new-file publication now removes its owned temporary hard link before single-link integrity checking, preserves exclusive/no-overwrite publication, and reports retained output files and Markdown sidecar directories after partial failure. All required format/lint/typecheck scripts pass. See the [implementation and scope record](docs/validation/code-audit-CA01.md) and [manual guide](docs/manual-testing/code-audit-CA01.md).

The mandatory repository-wide checks initially exposed 538 lint diagnostics plus type errors. Resolving those under Josh's explicit October 5 instructions required broader formatting, hook/state, type-boundary and tool-scope corrections in this stage. These are described in the record; they do not establish completion or acceptance of later audit stages. In particular, CA07–CA08 export retry/recovery and CA10–CA13 ownership work remain separate.

Scope: `worker/exports/jobs.ts` and directly affected export result handling. Repair owned-temporary publication order, preserve no-clobber behavior, and accurately record files already published when a later step fails. Keep `fileHash` protections for untrusted files. Include Markdown sidecars in the same reasoning; do not change the compiler or file format.

As a user, after implementation:

1. Export a disposable document separately to DOCX, PDF, Markdown, and text using fresh names; each successful output is reported as complete and opens in its reader.
2. Export Markdown containing an image; the document and referenced local sidecar both exist and display together.
3. Select an existing output name; the documented retain/skip/confirmation behavior preserves the existing file.

### CA02 — Make renderer error recovery preserve available work

**Finding:** F02. **Dependencies:** none. **Status:** implementation complete — awaiting user testing.

October 5, 2026: presentation boundaries now sit below selected draft owners and outside editor/PDF hosts. Main owns guarded window recovery; root ownership loss refuses automatic restart. Required format, lint and typecheck scripts pass with no warnings or errors. See the [implementation and limits](docs/validation/code-audit-CA02.md) and [manual guide](docs/manual-testing/code-audit-CA02.md). Runtime/error-path acceptance remains pending. CA03–CA18 are not advanced.

Scope: error boundary placement, persistent workspace ownership, and the narrow recovery/lifecycle action. Keep a last-resort root boundary, but contain recoverable panel/render failures below draft owners. Replace raw reload with an honest main-owned recovery path. Distinguish recoverable live state from already-lost renderer memory; do not add a test-only crash switch.

As a user, after implementation:

1. Edit writing and an explicit form draft, then navigate normally; both retained owners continue to preserve their content.
2. If a naturally occurring panel error appears, follow the offered recovery action; the UI identifies protected versus uncertain work and preserves surviving owners.
3. Close and reopen a disposable project normally; local unsaved writing returns under the existing Save contract. Error-path acceptance stays pending if no safe reproduction exists.

### CA03 — Track worker settlement beyond caller timeouts

**Finding:** F03. **Dependencies:** none. **Status:** not started.

Scope: `main/storage-worker.ts`, worker completion protocol only if needed, and direct access/lifecycle consumers. Separate waiting callers from outstanding worker work. Retain bounded original request metadata, validate late results, and update the original observer without delivering to an unrelated caller. Keep unresolved work in busy/access/close decisions until its actual settlement. Do not add automatic mutation retries.

As a user, after implementation:

1. Perform a substantial ordinary import/save using disposable data; pending work remains visibly owned until its outcome is known.
2. Attempt an access/project transition during that work; it waits or refuses with an actionable explanation.
3. If an ordinary operation times out, retry its offered recovery action; the original outcome is reconciled without a duplicate mutation. Otherwise record that timeout observation as pending.

### CA04 — Distinguish slow storage startup from failed startup

**Finding:** F04. **Dependencies:** CA03. **Status:** not started.

Scope: storage startup status/progress, initial renderer presentation, and cooperative recovery. A notice deadline should explain delay, not invalidate an otherwise healthy initialization. Define behavior for worker exit, invalid messages, and a requested retry without two concurrent storage owners.

As a user, after implementation:

1. Launch with the usual local working folder; Projects becomes available after storage is ready.
2. If startup is slow, the app explains the delay and accepts eventual readiness without requesting a forced relaunch.
3. If the location is genuinely unavailable, the offered recovery remains explicit and never silently initializes a different library.

### CA05 — Make completed imports recoverable without rereading their original

**Finding:** F05. **Dependencies:** CA03. **Status:** not started.

Scope: picker grants and import receipts across main/shared/preload/worker and the affected pending UI. Separate receipt lookup from new file authorization. Reconcile exact original requests before mutable preconditions or source reads where their existing digest permits it. For attachment digests derived from bytes, design a protected original-intent binding rather than accepting an operation ID as sufficient authority. Preserve current readers/digests; explicitly split any required format migration.

As a user, after implementation:

1. Import text/Markdown, a bibliography, an image, and a source attachment into a disposable project; each deliberate action creates one result.
2. Leave an undispatched preview beyond its grant lifetime; the app requests fresh file selection without claiming that an import occurred.
3. When an unknown dispatched result is available, recover it after moving only the disposable original; the app finds the recorded result or preserves the unresolved identity, without silently starting a new import.

### CA06 — Retain every source-inspection mutation until settlement

**Finding:** F06. **Dependencies:** CA03; CA05 for reimport/attachment handoff. **Status:** not started.

Scope: SourceInspector operation/extraction owner and existing inspection receipts. Retain each exact ensure/choose/start/page/finish/excerpt request, register unresolved work with draft/close guards, and pause extraction on unknown storage outcomes. Keep parser failures and incomplete coverage distinct. Extract the operation owner from presentation only as needed for this state machine.

As a user, after implementation:

1. Inspect a disposable text/PDF source and save an excerpt; the correct original/version/page remains attached.
2. Stop extraction and resume; saved pages remain available and coverage remains honest.
3. If a write outcome is unknown, the UI names that operation and offers reconciliation before continuing or changing the target.

### CA07 — Give export starts an exact recoverable identity

**Finding:** F07. **Dependencies:** CA01, CA03. **Status:** not started.

Scope: export start contracts, native destination approval, worker identity, and session job registration. Freeze reviewed options and destination authority with one start operation. Return the original job for an exact retry and expose uncertain start state. Do not create a general restart job catalog or weaken destination confirmation.

As a user, after implementation:

1. Start an export and move to another panel; the same job remains visible and addressable.
2. Cancel the native picker; no export job or output is created.
3. If start acknowledgment is unavailable, use the recovery action; it retrieves the original job or honestly retains uncertainty, without another destination prompt or duplicate job.

### CA08 — Preserve export outcomes when report protection fails

**Finding:** F08. **Dependencies:** CA07. **Status:** not started.

Scope: worker terminal job state, report protection, status/cancel behavior, and results UI. Retain the precise outcome when writing its report fails. Implement a local-only report retry and bounded ownership of unresolved records. Keep report compatibility and already-published files; do not convert protection retry into rendering or inference work.

As a user, after implementation:

1. Complete an ordinary export, leave its panel, and return; its per-file result remains consistent.
2. Cancel a multi-file operation where that capability is available; completed files and unfinished formats remain separately identified.
3. If report protection fails during ordinary use, retry protection; existing output is retained and no new export is started. Leave this observation pending otherwise.

### CA09 — Route native edit commands by focus

**Finding:** F09. **Dependencies:** none. **Status:** not started.

Scope: native Edit dispatch and the focused editor/control boundary. Cover manuscript, footnote, note, ordinary text input, textarea, and dialogs. Keep a narrow native fallback, no generic renderer command bridge. Preserve read-only and IME guards.

As a user, after implementation:

1. Type in manuscript, note, project-title field, and conversation composer; Edit → Undo/Redo affects only the focused control.
2. Repeat with platform shortcuts and Paste as Plain Text; behavior matches the menu where supported.
3. Open a dialog or switch away from writing; a menu action never edits the hidden manuscript. Repeat native acceptance on macOS and Windows.

### CA10 — Make editor and workspace effect lifetimes explicit

**Finding:** F10. **Dependencies:** CA02, CA09. **Status:** not started.

Scope: RichDraft creation/subscriptions and workspace protection/native-event effects. Classify mount identity separately from changing callback inputs. Introduce stable callbacks/current-value access where justified, symmetric cleanup, and explicit scope checks. Record the dependency rationale beside non-obvious lifetime boundaries. Keep the existing editor identity and protection cadence.

As a user, after implementation:

1. Type, undo, select text, change theme/panel, and return; the editor retains selection, undo, and content.
2. Change section/project deliberately; the editor opens the intended document without callbacks writing into the prior owner.
3. Use a composing input method and close/reopen a disposable project; composition and local recovery retain their existing guards.

### CA11 — Constrain research refreshes to the current workspace

**Finding:** F11. **Dependencies:** CA03, CA10. **Status:** not started.

Scope: `afterNoteCommit`, metadata/head refresh, and direct research callbacks. Recheck scope/document/revision after awaiting reads and merge only fields the refresh owns. Handle older responses without replacing live manuscript state. Use a shared primitive only if research and conversation refresh genuinely have the same contract.

As a user, after implementation:

1. Save a note/source change while writing has a retained buffer; the updated research appears and the writing remains intact.
2. Navigate between sections as ordinary background reads complete; selection and document identity remain the user's latest choice.
3. Reopen the project; saved research and manuscript revisions agree without reverting details or unsaved writing.

### CA12 — Extract workspace persistence without moving its lifetime

**Finding:** F12. **Dependencies:** CA02–CA05, CA10–CA11. **Status:** not started.

Scope: one bounded extraction from `useWorkspaceController`: manuscript flush/retry and local-protection coordination. Leave navigation, onboarding, and broad UI decomposition for subsequent explicitly requested work. Define a typed persistence interface; reduce consumers' ability to mutate unrelated refs/setters. Keep the coordinator under the same persistent session provider and preserve existing serialized action/close behavior.

As a user, after implementation:

1. Edit, change panels, explicitly Save, then edit again; local protection and chosen-file status remain distinct.
2. Close normally with unsaved writing and reopen; the local revision returns without an automatic selected-file Save.
3. Exercise first Save cancellation and Save As on disposable copies; destination ownership and retained prior files remain correct.

### CA13 — Separate research draft/operation owners from presentation

**Finding:** F12. **Dependencies:** CA05–CA06, CA11. **Status:** not started.

Execute as individually requested substages, stopping for acceptance after each: **CA13a Notes**, **CA13b Sources**, **CA13c SourceInspector presentation**, and **CA13d Evidence**. Each extracts that feature's draft/operation owner and small semantic UI components only. Preserve original selection/bookmark/revision targets, explicit-save policy, unknown outcomes, merged identities, and source decision semantics. Keep CSS with its component/feature owner.

As a user, after each substage:

1. Start a draft in the affected feature, navigate away, and return; input and selection remain.
2. Save or explicitly cancel it; only the intended record changes and the draft guard clears appropriately.
3. Follow its link back to writing/source context; the exact target is preserved, and missing targets produce an explanation rather than a substitute.

### CA14 — Clarify AI lifecycle contracts and native module ownership

**Findings:** F10, F12. **Dependencies:** CA03, CA10–CA12. **Status:** not started.

Execute as individually requested substages: **CA14a conversation provider effects**, **CA14b proofreading history/review effects**, and **CA14c native infrastructure ownership**. The first two clarify event subscription, current scope, review invalidation, and retained request state without changing available features. The third moves generic native filesystem/digest helpers out of worker-specific ownership, moves the internal print transport type to a neutral contract owner, and separates Node-only helpers from browser-safe domain modules. Preserve every digest byte and route/version discriminator.

As a user, after the relevant substage:

1. Compose/review a conversation, navigate away, and return; draft/context and selected account/model state remain coherent.
2. If DP01 is eligible and manually accepted, send reviewed synthetic text, Stop when needed, and reopen history; partial/completed outcomes remain distinct without automatic resend.
3. Open proofreading history; local review remains available and the unsupported direct Run path remains unavailable. Ordinary Save/export still works after native-helper extraction.

### CA15 — Reduce repeated reads and bound presentation resources

**Finding:** F13. **Dependencies:** CA07–CA08, CA11, relevant CA13 substage. **Status:** not started.

Execute as individually requested substages: **CA15a lightweight search filters and batched note relationships**, **CA15b shared/coalesced research reads**, and **CA15c completed-job presentation/resource release**. Avoid format changes where read-only projections suffice. Preserve revision freshness, stable selections, retained drafts, active jobs, and all durable reports. Explicitly distinguish releasing reconstructible PDF/UI resources from clearing an unfinished operation. Do not add benchmark harnesses or speculative caches without invalidation contracts.

As a user, after each substage:

1. Use a representative disposable large library; filters and lists show the same saved records and remain responsive during writing.
2. Switch among retained panels while editing or receiving AI output; drafts remain, and saved usage/filter data updates correctly.
3. Dismiss a completed job from presentation if implemented; active work stays visible, files/reports stay retained, and remaining result access follows the documented session lifetime. Record responsiveness observations without claiming a measured budget from source alone.

### CA16 — Establish safe formatting and code-quality conventions

**Finding:** F14. **Dependencies:** none; keep separate from functional diffs. **Status:** not started.

Scope: `.prettierignore`, ESLint scope/policy, editor recommendations/settings, and short contributor guidance. Exclude exact vendor/generated outputs while continuing to include authored source/config/docs. Cover TSX editor formatting and distinguish correctness warnings from presentation warnings. Decide deliberately whether selected hook rules become errors; any type-aware expansion must be a separate bounded policy change, not a global suppression exercise.

The existing format/lint/typecheck scripts are required after code changes under the October 5 amendment. Fix their reported issues, including pre-existing issues and warnings, without suppressions or weakened rules. Keep formatting-only edits distinguishable from behavior edits. No new testing infrastructure, CI or test changes are authorized. Preserve vendored source byte-for-byte and do not regenerate manifests merely to bless accidental reformatting. This stage's broader editor/rule-policy work remains separate from the routine checks already required in every code stage.

As a user, after implementation:

1. Review the ignore/configuration diff; vendor and generated ownership is explicit while authored application files stay in scope.
2. Open an authored TSX file in the recommended editor setup; formatting support is available consistently with TS/JS.
3. Review a subsequent small formatting-only change; behavior edits and bundled upstream files are absent from that change.

### CA17 — Reconcile current documentation and release evidence

**Finding:** F15 and existing acceptance gaps. **Dependencies:** none for current-state corrections; relevant repairs before closing their release gates. **Status:** not started.

Execute as individually requested substages: **CA17a current-state documentation** and **CA17b candidate evidence handoff**. First align the README, current checkpoint index, format overview, and release placeholders with DP01/schema 13/compilation 3 and the current Save contract. Retain dated history and distinguish source metadata from actual candidate metadata. Then map implemented repairs to the existing owner manual guides and candidate gate register; never invent results or fill signing/account approvals.

As a user, after the relevant substage:

1. Follow the README to active AI, Save, format, and manual-guide records; they describe the same current implementation.
2. Review the candidate register; implemented, observed, blocked, and not-yet-observed states are separate, and this audit's unresolved P1 findings remain visible.
3. When real candidate artifacts exist, perform the applicable native/offline/recovery/export/accessibility journeys and supply observations for those exact artifacts. Release remains NO-GO until its existing gates are genuinely satisfied.

### CA18 — Isolate commerce workloads before activation

**Finding:** F16. **Dependencies:** existing commerce prerequisites remain; independent of local editor refactors. **Status:** not started.

Execute as individually requested substages: **CA18a admission and per-customer reconciliation** and **CA18b operational shutdown/recovery**. Reserve capacity before body ingestion, separate webhook/public/customer limits, and bound whole reconciliation work while preserving safe shared-database transactions. Keep webhook receipts/retries, grant ordering, checkout unknown outcomes, private data handling, and issuer protection. Document proxy identity trust and an orderly drain/close path.

This stage does not authorize merchant setup, deployment, external messages, purchases, or synthetic paid-unlock controls. Service behavior that needs a real configured environment remains pending the appropriate explicit owner authorization.

As a user, after implementation and authorized setup:

1. Use the supported provider sandbox flow; unrelated customer requests remain independently actionable during reconciliation.
2. Receive ordinary provider webhook updates; intake and durable reconciliation status remain distinct and retryable.
3. Restart the service through its supported operator procedure; protected receipts and grant revisions remain consistent. Capacity and interruption evidence stays pending where ordinary safe observation is unavailable.

## Completion and release tracking

For each stage/substage, record its implementation revision, exact source scope, actual format/lint/typecheck outcomes and blockers, manual guide, owner observations, and remaining limitations. Keep four states separate: **not started**, **implementation complete — awaiting user testing**, **user-confirmed acceptance**, and **blocked/incomplete**. Passing code checks does not establish runtime acceptance. If a later change affects an accepted invariant, reopen the corresponding manual observation.

The initial repair queue is CA01–CA08. CA09–CA15 address native polish, lifecycle clarity, and maintainability after the reliability gaps are contained. CA16–CA17 prevent repository drift; CA18 protects the separate commerce launch path. Existing output-fidelity, accessibility, secure distribution, current dependency/license review, and native platform gates remain mandatory owner work even when every audit finding has been repaired.

This audit delivers the requested plan. It does not implement any repair, advance another product stage, establish runtime acceptance, or change the release decision.
