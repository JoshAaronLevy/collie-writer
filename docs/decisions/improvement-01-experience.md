# I01 decision — experience, navigation, and ownership

October 1, 2026. **Implementation complete — awaiting user testing (document review for I01).** Applies to improvement stages I01–I15, not MVP stage numbering. The [screen specification](../design/app-experience.md) and [provider record](../ai/provider-eligibility.md) are the stage outputs. This decision creates no runtime, dependency, or persistent-format change.

## Context and decision

Josh wants a calm, professionally designed nonfiction writing app whose first task is choosing a project type, then entering project details, optionally connecting a personal AI subscription, and writing. The current source exposes most implemented features together. The redesign will reorganize those capabilities while retaining their existing storage, access, and recovery behavior.

Use Mantine, bundled Lucide icons, semantic CSS Modules, and the warm editorial light/dark/system design specified in the improvement plan. Organize around explicit local destinations rather than scroll anchors. Give durable session state and drafts lifetimes independent of screen components. Preserve Electron/React/TypeScript, the current editor, native file pickers, and validated main/worker contracts.

Study critique is a primary category and an empty starter outline. Existing source tools can hold a publication link or managed original. Dedicated PDF/link intake, central-study relationships, and critique analysis remain deferred; no such schema or workflow is introduced by this decision.

## Full-plan review and resolutions

All I01–I15 briefs and their shared rules were read before producing these specifications. These are source/design conclusions, not passed checks.

| Finding | Resolution / handoff |
| --- | --- |
| The local stages do not require a qualified provider. | I01 design completion unblocks the specification prerequisite for I02. I10 still has separate commercial/authentication/funding gates. No dormant adapter belongs in I02–I09. |
| I03 moves the most coupled renderer behavior. `Projects.tsx` owns editor state, retries, timers, file events, and access/close handling. | Extract one persistent owner before tab/navigation changes. Preserve 900ms debounce, 5-second local protection fallback, and 30-second selected-file autosave; do not introduce a second state tree. |
| `RichDraft.tsx` creates an editor on mount and destroys it on unmount. | Keeping only serialized text is insufficient for ordinary navigation: retain the active editor instance, undo, selection, and composition state. Stage I03 establishes lifetime; I07 changes presentation. |
| Settings applies existing display preferences from mount effects. | I02 moves preference application to the app root and preserves `collie.visual-settings.v1`. Opening Settings becomes unnecessary for preferences to apply. |
| Author/category/description cannot be renderer-only fields. Current create input contains only operation ID/template; exports freeze model 2 without the new metadata. | I04 changes all command, storage, portable, copy, and export consumers together before I05's wizard. I01 specifies fields but allocates no schema version. |
| A basic book template has text sections, not necessarily chapter containers. | Use actual outline identities for proofreading; offer current section if no chapter container exists. See S05 and I13. |
| Local conversation organization must work while disconnected. | Clarify I12: local rename/archive and Save as note require Collie editing rights, while new inference additionally requires provider eligibility. Applying an already generated proposal requires edit rights and revision checks, not a new provider request. |
| I10 provides a service; I11/I12 provide observable sign-in/generation. | Keep I10 native observations pending those production flows. Do not add a testing UI or SDK probe to make a background stage appear accepted. |
| A nonce for generated style elements does not settle every Mantine styling requirement. | I02 must account separately for theme initialization, generated style elements, positioning styles, and portals under the real production CSP. No blanket security relaxation or assumed compatibility. |
| The plan prefers Codex SDK, but current subscription-token documentation gives an app-server execution path. | Select Sign in with ChatGPT plus app-server as the documented conditional route; retain SDK preference only if the eventual approved route supports it explicitly. Authentication eligibility and funding remain unresolved; no invented SDK login/token bridge. |
| Existing source/lifecycle/export features could disappear behind simplified navigation. | The relocation table below names an entry point, owner, and transition rule for each group. Hidden old panels do not constitute a completed relocation. |

## Navigation contract

Use a typed, in-memory destination model owned by the persistent renderer shell. Do not use URL/hash routing: `trustedDocument()` in `src/main/security.ts` accepts exact trusted documents, and `protectWindow()` prevents navigation. No router package is required for these destinations.

| Destination | Identity / return state | Session behavior |
| --- | --- | --- |
| Setup | Wizard ID, current step, uncommitted details or reconciled create receipt, origin | Before dispatch, cancel discards only this draft. After dispatch, reconcile the exact operation; retain any created project. |
| Projects | Active/archived/recent filter, query, focused row | Does not close the active session until a guarded project transition succeeds. |
| Workspace Write | Project + workspace + text-document ID; valid editor selection | Keeps active editor/draft ownership independent of visible panels. |
| Workspace Research | Subsection + source/version/page/excerpt, note, question or claim IDs | Resolves exact entities; unavailable/orphaned targets remain explicit. |
| Search | Project scope, query/page/result position, return target | Results navigate through the same guard; closing search returns to its origin. |
| Export | Project scope, selected section IDs/options, captured head, job ID, return target | Editing options invalidates review as required; job survives closing the view. |
| Project details / History | Project scope, draft or checkpoint ID, origin | Explicit metadata save; history remains revision-aware and reversible. |
| Settings / Help | Named page and origin | Keep workspace, jobs, preferences, access, and recovery state alive. |

Keep provider/account identity separate from project navigation. Stable domain IDs, never paths, grant tokens, DOM selectors, or opaque provider handles, identify destinations. DOM focus targets are presentation metadata only. If a requested section is missing/inactive, automatic resume may choose an active text section; explicit evidence/search navigation must explain the missing exact target instead of silently substituting one.

Local last-project preference stores project/workspace/section IDs and view choices. It conveys no filesystem authority or guarantee of destination availability. Reopen through existing ownership/storage/access paths, falling back to Projects on unsafe/unavailable/archived state. A project with only local recovery remains discoverable. A new installation reaches Setup; an existing installation is never forced through new-project onboarding.

## Proposed module responsibilities

These are implementation destinations for later stages, not files created in I01. Keep useful current modules during extraction; do not recreate foundations or move unrelated code just to match a folder diagram.

| Owner / proposed module | Responsibility | Must not own | Stage |
| --- | --- | --- | --- |
| `App.tsx` / `app/AppShell.tsx` | Persistent providers, app destinations, global status and attribution, Settings/Help return | Manuscript SQL or provider secrets | I02–I03 |
| `theme/` + visual preferences module | Mantine theme/defaults; semantic tokens; startup system theme/zoom/contrast/motion | Feature layout selectors or portable author metadata | I02 |
| `features/workspace/WorkspaceSession.tsx` | Active project/head/section, editor bridge, dirty aggregate, exact pending operations, access transition orchestration | Direct files, licensing authority, duplicate panel content stores | I03 |
| `features/workspace/drafts.ts` | Draft registration, flush policy, explicit-save blockers, composition and focus return | Generic permission to auto-save all forms | I03 |
| `app/navigation.ts` | Typed targets, guarded transitions, origin/focus restoration | URL loading or filesystem grants | I03 |
| `features/onboarding/` | Seven choices, form state, resumable creation, optional connection presentation | Second create transaction or auth implementation | I05 |
| `features/library/` | Trusted project list, archived/recent views, resume and lifecycle entry points | Inferring selected-file reachability from a row | I06 |
| Existing editor / outline modules | Supported rich content, selection/undo, outline actions, references, contextual toolbar | Provider writes or schema changes for appearance | I07 |
| `features/research/` plus existing panels | Focused sources/notes/evidence/search/inspection views | Parallel note/source repositories | I08 |
| Existing export/file/settings/help modules | Focused task flows over retained commands, reports, recovery and support | Reinterpreting export as Save, or cleanup as recovery deletion | I06/I09 |
| `src/main/ai/` | Qualified registry, browser auth orchestration, protected account lifecycle, operation authorization, isolated runtime | Renderer networking, storing portable chat as secret session files | I10 |
| `src/shared/ai.ts` / named preload methods | Bounded inputs/results/events; exact operation/context identity | Generic spawn, generic HTTP, arbitrary config/path execution | I10–I13 |
| Worker conversation/proposal repositories | Durable human-readable content, revisions/decisions, snapshots/copies | Credentials, active process handles, provider networking | I12–I13 |

`src/main/lifecycle.ts`, main file services, update handling, capability enforcement, and the storage worker remain authoritative for their existing operations. New renderer abstractions wrap them; they do not bypass or duplicate them. In-memory dirty state cannot authorize a worker mutation by itself.

## Draft and transition ownership

Register each draft by project/workspace/entity and draft kind. A registration exposes whether it is dirty, whether IME composition is active, its exact pending operation, whether a normal/access flush is supported, whether explicit Save/Clear is required, its current issue, and a focus/return target. Owner state must exist before a view unmounts. A registration cannot disappear merely because the control that registered it becomes hidden.

| Draft / operation | Preservation rule |
| --- | --- |
| Manuscript and section metadata | Preserve current editor, revision and pending operations; flush using existing serialization/commit semantics. Composition blocks unsafe serialization. Failed flush keeps visible text. |
| Notes, inline annotations, sources | Move full draft/revision/retry ownership above view lifetime or retain its instance. Keep note access-drain behavior and source flush semantics distinct. |
| Questions, claims, evidence decisions, transcription | Retain full input and explicit Save/Clear state. Do not change existing blocking forms into implicit commits. |
| Wizard details | Bounded local draft before create; immutable dispatched payload and receipt reconciliation afterward. No fake project identity or destination. |
| File/export jobs | Main/worker own durable progress. Renderer subscriptions and operation summaries survive navigation; closing a view does not cancel a job. |
| Future conversation composer | Local draft separate from sent messages; sending captures immutable approved context. Streamed message checkpoints belong to I12. |

For a transition: capture origin/target → assess affected drafts and active operations → wait for existing required boundaries → flush supported drafts in the established order → resolve explicit-save blockers → commit the destination change → restore meaningful focus. If anything fails, preserve the origin and exact retry payload. A return-to-draft action may reveal the resolution surface without destroying the blocked draft. Switching companion panels within a preserved session does not needlessly restart the editor.

Closing/update installation follows the existing main handshake and drains accepted buffers. Entitlement loss freezes new edits and preserves the bounded previously authorized drain; explicit-save drafts retain the option to designate that same project for free editing. Do not infer that view navigation grants extra drain rights or permits discarding drafts. Persisted manuscripts and source originals are never caches.

## Capability relocation map

| Existing capability | New reachable home | Preservation / focus boundary |
| --- | --- | --- |
| Create/Open/recent | Setup and Projects; native File actions | Guard current session, retain create receipt and native grants |
| Rename/project metadata | Project menu → Project details | Explicit transactional save; return to title/menu |
| Sections, outline, archive/trash | Write → Outline and Section details | Keyboard move alternatives; exact revisions and checkpoints |
| Rich editor, images/tables, find/replace | Compact toolbar, Insert/More, contextual controls | Preserve supported schema and valid selection before dialogs |
| Inline annotations | Selection action → Notes companion | Exact captured quote/anchor, orphan state, same notes store |
| Citation/footnote insertion | Editor Insert → Citation/Footnote | Restore valid selection; no prose flattening |
| Sources/import/originals/version history | Research → Sources → detail/inspector | Keep bibliography preview/report, managed original/version, exact excerpts |
| Notes/labels/inbox | Research → Notes; Notes companion | One draft owner; explicit labels and focus targets |
| Questions/claims/evidence | Research → Questions & claims | Save/Clear draft guard; exact supporting/challenging links |
| Search | Workspace Search action | Retain query/results; resolve IDs and origin through guard |
| Citation style/bibliography preview | Export → References | Source correction returns to captured export flow, invalidating stale review |
| DOCX/PDF/Markdown/text, recipes | Export destination | Frozen head, native output picker, per-file outcomes, capability policy |
| Text/Markdown import | Project menu → Import writing | Existing preview/loss report and additive fresh document IDs |
| History/restore | Project menu → History | Checkpoint identity and restore semantics, not arbitrary historical heads |
| Save/Save As/Locate | Header Save/status details and Project menu | Local protection and selected-file acknowledgment remain distinct |
| Backup/Move/Duplicate/archive | Project menu; matching library row actions | Existing journals and independent identities; Move retains old file |
| Retained/interrupted/reset recovery | Settings → Data & recovery; urgent contextual banner | Trusted discovered artifacts only; independent restore, no expiry/deletion |
| Free designation/purchase restore | Settings → Collie access; contextual read-only banner | Existing main policy and flush; no provider-based unlock |
| Appearance/zoom/contrast/motion | Settings → Appearance & accessibility | Persistent startup owner; preserve existing preference values |
| Provider connections/models | Settings → AI connections and contextual AI panel | Qualified registry; account/model/context changes explicit |
| Tutorial/orientation | Help → Explore an example; optional first workspace orientation | Trusted sample slot, old sample retained, separate from personal work |
| Versions/licenses/support/updates | Help/About and Settings sections | Initial citeproc attribution also remains visible; content-free support, explicit updates |

## Mantine and CSS ownership

App-authored classes use descriptive lowercase hyphenated selectors such as `project-type-card`, `project-details-form`, `workspace-outline`, and `save-status-summary`. Prefer CSS Modules and bracket access for hyphenated names. Generated suffixes/internal library classes are acceptable. Do not introduce utility stacks, cryptic abbreviations, Tailwind, generic spacing classes, or broad `.mantine-*` overrides.

Onboarding selection styles belong beside `ProjectSelection`; project detail styles beside their form; workspace layout beside its layout component. If the same real product component is shared, move its styles with that component to the smallest common owner. Root CSS contains tokens, font setup, resets, and base defaults only. Existing feature rules migrate when their owning stage changes them, not through a whole-app I02 rewrite.

Mantine's documented `classNames` slots and theme component defaults provide the connection to semantic classes. Its provider supports generated-style nonces and optional externally managed CSS variables. These mechanisms inform I02; neither proves compatibility with Collie's packaged CSP. [Styles API](https://mantine.dev/styles/styles-api/), [MantineProvider](https://mantine.dev/theming/mantine-provider/), read October 1, 2026.

**CSP handoff to I02:** prefer bundled static package/theme CSS and startup preferences applied by bundled code. If dynamic style elements remain necessary, bind their nonce to the actual document response, never a constant. Review positioning/inline style attributes separately: a style-element nonce does not authorize attributes. Record the narrow component-specific solution and any necessary production policy change; do not broadly enable inline scripts/styles, remote assets, or renderer network access. Portals stay in the trusted document with semantic labels/focus handling. Choose compatible Mantine/Lucide versions from then-current official metadata during I02; I01 does not install or pin speculative dependencies.

Retain bundled Source Serif assets and notices. Keep citeproc's uncollapsed initial-session attribution with the prominence required by D4 plus bundled source/license access. No legal certification or visual/accessibility pass is claimed.

## AI architecture decision

The desired UX remains user-selected provider → default-browser sign-in → authenticated/eligible account → explicit-context request → local transcript/proposal. Local writing never depends on that sequence. The [provider record](../ai/provider-eligibility.md) owns the dated external evidence and exact gate IDs; do not duplicate assumptions in UI code.

Current conditional OpenAI selection is permitted Sign in with ChatGPT orchestration followed by isolated Codex app-server execution using its documented OAuth-token configuration. SDK execution remains preferred if a supported bridge for the approved route is established before I10; none is asserted here. Merely running legacy login through the SDK/CLI is not a commercial-permission workaround. A generic API-key client is not an accepted fallback.

Runtime content is only the immutable captured context, with tools/ambient configuration disabled under the supported runtime contract. Provider sessions and credentials remain device-local. The renderer receives sanitized state and visible messages through named IPC. All accounts/providers must satisfy included-only enforcement for every internal call; no provider is eligible to enable today on the evidence collected.

Local rename/archive of saved conversations and proposal review do not contact a provider. Current Collie editing rights apply to mutations; inference separately requires a qualified live connection. Portable copies carry transcripts/proposals and provenance, never a permission to resume another installation's provider session. A provider switch starts a fresh thread and selected history is explicitly reviewed before transfer.

## Boundaries and consequences

Working SQL/minimum reader remains 9; editor AST/archive container remain 1; compilation model remains 2. I04, I12, and I13 own future complete copy migrations and all affected readers/writers. Do not allocate version numbers from this design document or change old accepted format histories.

I02's specification prerequisite is delivered. I10 commercial authentication/funding prerequisites remain open; I14 remains conditional/deferred. Existing MVP commerce/value/signing/native/MAS/release gates remain unchanged. I01 does not authorize provider correspondence, registration, account access, purchases, deployment, or publication. No application behavior was exercised, and no implementation stage beyond I01 has begun.

Review through the [manual guide](../manual-testing/improvement-I01.md); record supplied outcomes in [I01 evidence](../validation/improvement-I01.md).
