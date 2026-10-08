# R2-02 — Compact commands and removal of routine status clutter

October 7, 2026. **Implementation complete — awaiting user testing.** Scope: R2-02 only from the [Round 2 plan](../../uat-round-2-implementation-plan.md).

## Implemented changes and source evidence

- `App.tsx` hides Return to work only on the Write destination, replaces Settings with a named Tabler gear, and uses the existing `ActionMenu` icon trigger for the hamburger. Menu contents, guarded navigation and retained session/provider owners stay in place.
- `WritingWorkspace.tsx` removes the Manuscript eyebrow, entire Save and local protection disclosure and entire Project dropdown. Research uses a named book `IconButton`; Export remains labeled. Title/subtitle, editor identity, outline/companion ownership and R2-01 focus changes remain. Unused disclosure/eyebrow CSS and imports were removed; layout width and outline behavior remain R2-03 work.
- `SaveMenu.tsx` uses the shared icon target for the primary Save half and keeps the separate chevron. `SaveMenu.module.css` removes the 9rem reservation and adds static hourglass/warning badges for saving/unconfirmed states. Accessible names are Save, Saving project and Retry pending Save, with descriptions for progress and exact retry. Static shapes do not depend on motion or color alone.
- `IconButton.tsx` accepts `pending`, combines it with its existing unavailable-command guards, exposes `aria-busy`, and remains focusable for discovery. `Controls.tsx` preserves caller-supplied `aria-busy` when native pending behavior is not used. Ref/event forwarding, hover/focus descriptions, command callbacks and ordinary `AppButton` pending behavior remain.
- Save retains its existing scope/busy/access/close guards and `run(() => save(false))` callback. Save As/Backup/Locate retain their unresolved-request refusals. The options trigger stays usable while the primary action is unavailable. Its existing details item changes to View file progress and actions during file work or Save preparation, using the same guarded details route.
- Existing `WorkspaceViews`/`ProjectFileActions`/`FilePanel` provide details, actual progress and Cancel. `WorkspaceStatus` retains file-attention presentation for consent/choices, failures, unavailable files and unconfirmed Save, plus all storage/export/access/draft notices. It now offers a direct Retry local protection action when the existing manuscript retry is retained and not currently committing, using the existing flush/refresh owner. No healthy local-protection banner replaces the removed disclosure.
- `.session-status:empty` hides only the empty wrapper, deriving layout directly from rendered children. Real notices/results keep their space. Normal header/content padding remains.
- Shared `default`/`subtle` button styles and legacy project buttons are transparent at rest; filled primary actions retain their existing colors. Selected/pressed/current/expanded states remain styled, including a forced-color distinction. Research/Settings navigation now declares `aria-current` so selection stays visible and semantic. Menu/dialog/tooltip surfaces keep their existing opaque theme styles.

## Scope and compatibility

Renderer presentation only. No main/preload/worker, dependency, persistence, database/archive, Save request, outcome reconciliation, access/close owner or stored preference changes. No new history shortcut or toolbar framework. Prior R2-01 work and user-supplied notes/screenshots were preserved. R2-03 remains unstarted.

The React best-practices skill's source review covered derived presentation, stable retained ownership, shared event/ref forwarding, accessible state/name propagation and narrowly scoped styles. Source inspection is not runtime acceptance.

## Required checks

Inspected package scripts and exclusions before broad formatting. Format/lint exclude bundled vendor/generated files, `.tools`, and historical testing infrastructure. Used the repository-local Node 24.21.0 / npm 11.19.0 toolchain.

The first typecheck identified two removed bindings still required by the outline's existing disabled guard; both were restored. The final `npm run format` → `npm run lint` → `npm run typecheck` pass completed with exit 0 and no warnings/errors, including node and web targets. Code-check outcomes do not establish runtime acceptance.

No test code, test harnesses, automated suites, audits, builds, packaging, app launches, browser automation, screenshots, failure injection or runtime probes were added/run.

## Acceptance and remaining work

Follow the [manual guide](../manual-testing/uat-round-2-R2-02.md). No new user/runtime acceptance is recorded. Native Save/progress/Cancel, pending/retry rendering, keyboard/screen-reader behavior, narrow/zoom layouts, themes/contrast and naturally occurring recovery cases remain unobserved. Release remains NO-GO. Stop after this stage for Josh's results before R2-03.
