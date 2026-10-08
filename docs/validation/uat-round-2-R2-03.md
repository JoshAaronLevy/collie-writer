# R2-03 — More writing space and a clearer outline

October 7, 2026. **Implementation complete — awaiting user testing.** Scope: R2-03 from the [Round 2 plan](../../uat-round-2-implementation-plan.md).

## Implemented changes and source evidence

- `useWritingPreferences.ts` adds session-only `outlineVisible` state, initially true, under the existing retained controller. The exact `collie.writing-view.v1` reader/writer, saved outline/companion widths, focus preference and companion choice are unchanged. Page navigation does not reset the session choice; a fresh renderer session starts expanded outside the existing focus-mode override.
- `WritingWorkspace.tsx` adds a named desktop Show outline/Hide outline icon before companion controls, with a stable generated `aria-controls` target and actual `aria-expanded` state. The narrow Outline/Manuscript switch stays the only narrow pane control. The desktop toggle remains available in focus mode; explicitly showing the outline exits that override. Normal focus-mode entry/exit does not overwrite the independent outline choice.
- The outline stays mounted under `hidden`/`inert`, including its existing `OutlinePanel` key, branch/filter/form state and explicit draft owner. Its resize handle is omitted when hidden or narrow. The same editor key/payload and companion owners remain. Toggling dispatches no document selection, project Save or draft mutation; existing editor-blur local protection remains intact. Pointer toggling preserves an already focused editor, and hiding an outline that holds focus transfers focus to the toggle with `preventScroll`.
- The existing media-query listener handles returning from a narrow, open outline to a collapsed desktop layout. A one-commit focus return checks current destination visibility, close/navigation, dialogs, composition, background state and newer focus before focusing the surviving toggle. It does not queue a later focus retry. View-change actions also refuse modal/background/close/navigation or composition conflicts.
- `PaneResizeHandle.tsx` only gains a forwarded DOM ref so the outline's existing separator participates in that focus protection. Pointer capture, keyboard sizing, bounds and width persistence are unchanged; omitting the handle removes it from the tab order.
- `WritingWorkspace.module.css` derives desktop columns from actual outline/companion visibility, covering both shown, either shown, and neither shown. Hidden panes release their resize tracks. Narrow layout remains a single block. The manuscript's 56rem cap and centering are removed. `App.module.css` removes only Write's outer 112rem ceiling; non-writing page caps, padding, responsive wrapping, `min-width: 0` and existing image/table containment remain.
- `OutlinePanel.tsx` uses a flexible labeled Add item `AppButton` with a plus icon and the existing create/disabled guards. The separate Outline view action menu uses a named adjustments icon and retains its commands. Read-only unavailability is explained visibly; transient disabled explanations use the control's title and linked description without adding routine layout shifts.
- `OutlinePanel.css` gives Add item the remaining command-row width and increases row-title/metadata inset equally for selected and unselected rows. Forced-color selection changes border color without changing its width. Row drag/title actions, reserved ellipses, branch controls, nesting and long-title wrapping remain.
- Routine row metadata omits editorial status while preserving kind and effective archived/trashed/merged state. Stored editorial status and both existing Details forms remain unchanged. No outline operation semantics or form targeting changed.

## Scope and compatibility

Renderer presentation only. No dependency, main/preload/worker, project format, stored preference shape, Save/retry/outcome, access/close owner, editor schema or native integration change. Prior R2-01/R2-02 work and supplied notes/screenshots were preserved. No automated acceptance evidence was created.

The React best-practices skill's source checklist was applied to retained ownership, derived visibility, event/listener cleanup, one-commit focus handling, accessible names/relationships and scoped styles. This is source review, not a passed runtime test.

## Final Round 2 implementation coverage

| Feedback                                                                                                                                                                        | Implemented stage             | Acceptance            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------- |
| Quiet ChatGPT startup; no automatic editor focus; ordinary navigation at page top with deliberate resume/targets                                                                | [R2-01](uat-round-2-R2-01.md) | Awaiting user testing |
| Compact header/Save/Research controls; remove redundant writing disclosures/menu/label and empty status spacing; transparent idle controls with opaque menus; preserve recovery | [R2-02](uat-round-2-R2-02.md) | Awaiting user testing |
| Independently collapsible outline; wider manuscript; wide Add item and compact view control; comfortable row inset; no editorial-status suffix                                  | R2-03                         | Awaiting user testing |

## Required checks

Inspected package scripts and ignore scope before formatting. Existing format/lint exclusions protect vendored/generated files, `.tools` and historical testing infrastructure. Used the repository-local Node 24.21.0 / npm 11.19.0 toolchain. After the final disabled-description refinement, `npm run format`, `npm run lint` and `npm run typecheck` completed in that order with exit 0 and no warnings/errors. Typecheck included both node and web targets. These outcomes establish code-check completion, not runtime acceptance.

No tests/test code, harnesses, audits, builds, packages, app launches, browser automation, screenshots, failure injection or runtime probes were added/run.

## Acceptance and remaining work

Follow the [manual guide](../manual-testing/uat-round-2-R2-03.md). No new runtime or user acceptance is recorded. Actual grid/width behavior, resizing, retained undo/forms, native focus, IME, narrow/zoom layouts and keyboard/screen-reader/contrast observations remain pending. All three Round 2 stages require user acceptance, and release remains NO-GO. Stop for Josh's results; no further feature work is included.
