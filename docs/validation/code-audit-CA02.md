# CA02 — Renderer error containment and guarded recovery

Date: October 5, 2026. **Implementation complete — awaiting user testing.** Runtime acceptance remains pending. Release remains **NO-GO**.

The complete [audit plan](../../code-audit.md) was reviewed against the current CA01 baseline (`e15c553`). This change implements F02/CA02 only. CA03–CA18 remain separately requested work, including worker settlement, effect lifetimes and broader owner extraction.

## Ownership and containment

`PresentationBoundary` executes a render callback in a child component below an error boundary. Hooks, draft registrations, controlled form values and exact pending operations stay in the calling owner. Retrying reconstructs presentation only, without replacing that owner or requesting an operation replay. Boundaries add no wrapper element during successful rendering. Most of the large TSX diff is formatter indentation around these callbacks.

The bounded placements are:

- Project details, Sources, Evidence, manuscript outline, export options/results, citation preview and document import presentation, inside their respective owners.
- Conversation presentation inside `ConversationPanel`, below the persistent conversation/provider state.
- Comments/labels inside Notes, with its note editor outside the boundary.
- Selected excerpt/correction presentation inside SourceInspector, with the original/PDF reader outside the boundary.
- Writing tools and find/link/image dialog presentation inside RichDraft, with the ProseMirror host and independently owned reference/footnote tools outside both boundaries.

WorkspaceSessionProvider, ResearchDataProvider, conversation/proofreading providers, retained regions and draft registrations have not moved. No boundary wraps WorkspaceViews, WritingWorkspace, an editor host or a subtree containing additional draft owners. This is deliberately not the broad research decomposition reserved for CA13.

Presentation fallback explains that retained input is not necessarily protected on disk and that composing text can be uncertain. It offers **Retry panel** first and **Restart after protecting work** separately. Previously protected writing and currently retained input are not described as interchangeable. A native HTML fallback uses scoped semantic CSS and no Mantine dependency, so a failed UI-library component is not required to render recovery controls.

## Main-owned recovery

The narrow `app.windowRecovery` IPC accepts only an exact request envelope and one of `owner-lost` or `restart`, from the trusted main frame of the current window. It carries no exception text, content, path or URL. Preload validates its correlated boolean result. No generic reload/navigation bridge is exposed.

A restart reuses ProjectLifecycle's existing close handshake: explicit forms, IME composition, unresolved operations, manuscript protection, file work and AI settlement retain their current guards. Active AI retains the native **Keep window open** / **Stop AI work and continue closing** choice; restart does not bypass that decision. This does not require a project-file Save. Only after the normal handshake approves does main reload the same trusted WebContents. Close/update and restart intents cannot share permission to perform two transitions. The outgoing renderer and AI close barrier stay locked until the replacement finishes loading; a failed replacement load records lost ownership.

The root ErrorBoundary remains the last resort and reports `owner-lost` after its subtree fails. Main latches that state for the WebContents, resolves an outstanding close reply as failed, and rechecks ownership before approving a transition. `render-process-gone` also records ownership loss. Draft unregistration or a later clean dirty flag cannot erase that fact. **Review recovery with Collie** opens native guidance and refuses automatic close/restart after owner loss. The latch cannot be cleared by a renderer request.

## Limits and pending observations

A root failure has already unmounted its children. CA02 cannot reconstruct renderer-only drafts, guarantee preservation of in-progress composition, or claim that a previously acknowledged revision includes the latest keystroke. Root recovery intentionally has no force-close, discard or reload override; retaining the working folder and repairing the underlying failure can require owner intervention. A persistent panel failure can likewise leave an explicit draft blocked until its presentation is repaired. Retrying it never implicitly clears the draft.

Boundaries catch React render/commit failures in the covered presentation, not every owner-hook computation, event callback, asynchronous rejection, native crash or imperative editor/PDF operation. Failures outside those boundaries can still reach the root. The surviving owner may continue its already-authorized operation; retry does not start another one. Existing worker timeout/settlement limitations are still CA03, and this stage makes no claim to fix them or establish release readiness.

No schemas, portable formats, digests, migrations, credentials, provider eligibility, Save cadence, destination authority or release gates changed. No test code, crash control, fault injection, automated tests, build, app launch or runtime experiment was added or run.

## Required code checks

The formatter's vendor/generated/historical-test exclusions and package script bodies were inspected before execution. Initial format passed; initial lint found one fast-refresh component-placement error in the new helper, which was corrected without weakening rules; initial node/web typecheck passed. Final commands ran in order using the repository-pinned Node 24.21.0/npm 11.19.0 toolchain:

- `npm run format`: exit 0.
- `npm run lint`: exit 0, no warnings or errors.
- `npm run typecheck`: exit 0; both node and web targets passed.

Only documentation completion status changed afterward; the format script was run again for those final documents. Source inspection and these code checks are not runtime acceptance.

Owner observations: **not yet supplied**. Use the [manual guide](../manual-testing/code-audit-CA02.md). Normal and error-path runtime behavior, native dialog ordering and accessibility remain unverified. Stop before CA03.
