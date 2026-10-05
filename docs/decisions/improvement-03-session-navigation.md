# I03 — Persistent session and typed navigation

**October 3 correction:** The [Save/local-recovery decision](save-and-local-recovery.md) removes the 30-second selected-file autosave and Save-on-close behavior recorded below. Persistent session ownership, draft guards and 900 ms/5-second local protection remain.

October 1, 2026. **Implementation complete — awaiting user testing.** This decision describes source changes, not observed runtime behavior. I04 was expressly requested while the I03 handoff was being completed; its separate format changes are recorded in its own decision.

## Ownership

`App.tsx` mounts one `WorkspaceSessionProvider`, outside destination visibility. `useWorkspaceController.ts` owns the active project/section, editor reference, manuscript and section metadata revisions, exact retry requests, image imports, file jobs, local protection, selected-file autosave, access events, close/update flushing and navigation. `Projects.tsx` delegates presentation to `WorkspaceViews.tsx`; there is no second project/session state tree.

`WorkspaceViews` retains editor and panel instances in `RetainedRegion` containers. Hidden regions are `hidden` and `inert`; switching views does not remove their React children. Notes, sources, evidence, inspection and export preparation keep their existing buffers, selection, operations and subscriptions in these retained owners. This is intentional retention, not a reliance on whichever tab happens to be mounted. Replacing the project or inspected source uses the transition guard before the old owner can be removed. A real section change may construct a new manuscript editor after protection; ordinary destination changes and local commits preserve the current editor. Notes no longer key their editor by each saved revision.

`useExportOperations` owns export polling/results at session level. Export status/cancel resolve the validated project/workspace IDs against an app-owned directory and the matching job, independent of the active project. This is a necessary lifecycle correction using the same commands; it adds no renderer filesystem grant. `WorkspaceStatus` retains global errors, actionable draft blockers, export progress/results/cancel and the existing FilePanel above destination content. Native file-job and close/update interfaces remain intact.

## Transition contract for later stages

Use `navigate(AppDestination)` or the session's typed helpers. Destinations cover setup, library, settings pages, help pages, Write, Research, Search, Export, History and Project actions. Entity targets carry stable project/workspace/document/anchor/source/version/page/excerpt/note/question/claim IDs. Neither a URL/hash change nor a DOM selector conveys domain identity. Exact trusted-document security checks remain unchanged.

Transitions serialize, prevent competing input during a bounded flush, reject active composition and unresolved structural operations, and resolve explicit research targets. Missing targets produce an error. A manuscript anchor is resolved against the actual editor. Retained regions restore their previous focus or receive an explicit focus request; hidden content is not a keyboard destination. Return to work remembers the prior workspace destination. Review Collie access and Return to pending draft are non-destructive resolution paths and do not discard the retained instance.

`DraftRegistry` holds live handles into each owner, not copies of its content. Each registration supplies scope/entity/kind/label, dirty/composing/busy state, its exact pending operation, a destination/focus target, a policy and optional flush callback. The registry records untouched/protecting/protected/blocked/failed outcomes. Policies are:

| Policy      | Behavior                                                                                                                                                                                                 |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `flush`     | Protect sources, notes, manuscript/section details using the existing commands and idempotent requests. Sources precede notes; the controller then protects the manuscript.                              |
| `explicit`  | Questions/claims/decisions, human transcriptions/corrections and project detail edits require their own Save or explicit clear action. Navigation never treats them as automatically approved mutations. |
| `operation` | Jobs and pending retries survive visibility changes; active/unknown work blocks scope replacement and close/access transitions when reconciliation is needed.                                            |
| `retain`    | A future owner may retain a buffer on ordinary navigation, but must resolve it before scope replacement. No independent persistence promise is implied.                                                  |

Annotation commentary keeps its existing bounded access-drain behavior. Main remains authoritative for capabilities. An unresolved image import retains its exact operation and original section; it must reconcile before section replacement or close. Inspector page/version changes cannot move a pending human transcription to a different source location.

The original 900 ms manuscript debounce, 5-second fallback and 30-second selected-file autosave remain. Local protection is distinct from project-file save. Close/update waits for in-flight actions and registered drafts through the existing main handshake. Source/note failures retain exact requests; explicit drafts remain visible for resolution. No forced worker termination, new storage expiry or automatic discard is introduced.

## Boundaries and pending observations

I03 itself changes no SQL, AST, archive or compilation format. It retains the existing panel presentations behind usable destinations; final library, writing and research composition remain I05–I09. Unsaved setup input and last-project return are not yet a restart-resumable wizard/library contract. Operation history is retained for the current window; native recovery remains the existing stored recovery UI.

No tests, typechecking, linting, builds, app/browser launches or screenshots were run. Native close/update, IME, undo/selection, access changes, polling and keyboard behavior require the [manual guide](../manual-testing/improvement-I03.md). Prior release and provider gates remain unresolved.
