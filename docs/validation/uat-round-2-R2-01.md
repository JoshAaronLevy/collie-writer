# R2-01 — Quiet startup and deliberate navigation

October 7, 2026. **Implementation complete — awaiting user testing.** Scope: R2-01 only from the [Round 2 plan](../../uat-round-2-implementation-plan.md).

## Implemented changes and source evidence

- `useChatGptStartup.ts` now coordinates only prepare and acknowledgment with the existing main-process launch owner. It never claims a prompt or opens a dialog. Thrown/refused coordination results report uncertainty rather than becoming unhandled rejections. A main close/suspend refusal waits for a status sequence newer than that refusal before retrying, so applying the refusal itself cannot cause a preparation loop. No inference is added.
- `AiConnectionNotice.tsx` no longer treats aggregate account `busy` as sufficient reason for a global banner. Explicit account actions/sign-in retain progress and Cancel. Actual local/direct/controller issues, unavailable status, cleanup and actionable connection health remain visible. Only health-only resume/reconnect/permission/model setup requests wait for startup coordination and idle preparation, preventing intermediate setup state from becoming a routine warning. Other health failures and reported operation issues remain visible even while busy. Intentional signed-out health is not an error.
- `connectionState.ts` and `ChatGptConnectionDialog.tsx` retain the shared manually opened dialog, attempts, unconfirmed outcomes, account actions, origin focus and retained operation registration. Automatic-prompt UI and its active preference wiring were removed. The existing `collie.chatgpt-prompt.v1` record is neither read by the active controller nor rewritten/deleted; no migration or new preference was added. Unused prompt-control CSS was removed.
- `app/navigation.ts` and `useWorkspaceController.ts` distinguish transient page-top, saved-position and exact-target presentation. Return to work and generic Back remove captured writing anchors from the navigation request. Ordinary navigation keeps the manuscript item/caret while opening at the top. Project acquisition/reopening and outline item changes restore the saved position without typing focus. Exact passage links and Return to pending draft keep their deliberate target behavior. Clicking the same ordinary destination does not start another presentation transition.
- `RetainedRegion.tsx` focuses a visible heading/landmark with `preventScroll` for ordinary page navigation and resets the actual document scroll container, instead of scrolling a lower section into view. Resume presentation never focuses the writing region. Each request is handled once, waits behind dialogs/composition/inert or background content, and is cancelled by newer pointer/key/wheel input. Frames, observers and listeners are released on completion, interruption and cleanup. Retained children are not remounted.
- `writing-positions.ts` preserves its original bounded storage/readers and revision/block fallbacks. Initial selection restoration consults the current presentation before restoring scroll. A new transition cancels queued resume scrolling; an exact target cancels pending hint restoration. Window-focus/visibility guards prevent background restoration. The narrow writing-pane effect no longer automatically focuses the manuscript. Ordinary navigation clears old reference-navigation presentation so a later editor mount cannot replay an old passage request.

## Scope and compatibility

Renderer changes only. No main/preload/worker, dependency, Save request/outcome, close/access owner, portable format or stored writing-position shape changed. The retained editor/provider/draft owners remain. Existing native Save, account protection, explicit passage checks and recovery authority remain in charge. R2-02 and R2-03 are not implemented.

The React best-practices skill's source checklist was applied to hook lifetimes, frame/listener cleanup, retained ownership, derived account presentation, accessible focus, and narrowly scoped styles. This is source review, not a passed runtime test.

## Required checks

Inspected package scripts, format/lint exclusions and toolchain metadata. The existing exclusions protect vendor/generated content and historical testing infrastructure. Used the repository-local Node 24.21.0 / npm 11.19.0 toolchain.

After the final source refinements, `npm run format`, `npm run lint` and `npm run typecheck` completed in that order with exit 0 and no warnings/errors. Typecheck included both node and web targets. These are code-check outcomes, not runtime acceptance.

No tests/test code, test tooling, dependency audits, builds, packages, app launches, browser automation, screenshots, failure injection or runtime probes were added/run. The supplied notes and screenshot files remain user-owned inputs.

## Acceptance and remaining work

Follow the [manual guide](../manual-testing/uat-round-2-R2-01.md). No new runtime or user acceptance is recorded. Native account timing, actual layout and scroll behavior, explicit reference/footnote navigation, keyboard/IME/zoom/accessibility and naturally occurring failure paths remain unobserved. Release remains NO-GO. Stop after this stage for Josh's results.
