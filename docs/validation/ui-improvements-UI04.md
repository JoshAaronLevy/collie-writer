# UI04 implementation record — Startup ChatGPT prompting

October 5, 2026. **Implementation complete — awaiting user testing.** This record describes source changes, not observed app behavior. UI05–UI06 remain separate requests.

## Delivered behavior and ownership

- `AiService.startup` owns preparation and prompt markers for the main-process lifetime. The validated `ai.startup` channel accepts only prepare, claim-prompt, and acknowledge. Renderer recovery, status polling, view changes, and focus returns cannot reset these markers. Main also consumes prompting when a prepared startup reaches healthy status, even if the renderer disappears before acknowledging it. The claim is consumed before replying; a lost reply or renderer loss between reservation and display may skip that launch's automatic prompt, rather than duplicate it. The header remains available.
- `useChatGptStartup` starts coordination only after local storage is available and ordinary destination initialization finishes. It never changes or awaits `resolveInitialDestination`, opens a project, or remounts a draft owner. The selected saved direct account uses UI02's coalesced preparation and 45-second metadata deadline; no sign-in, inference, account switching, or retry loop is introduced. Existing successful/manual preparation is reused. No selected account means no metadata request.
- Preparation is independent of suppression. Once settled, healthy or suppressed outcomes acknowledge the launch silently. Otherwise presentation waits behind unavailable storage, local startup, recovery inventory issues, Data & recovery, errors/conflicts, workspace operations, navigation/close guards, another modal, IME composition, and background focus. A pending prompt is rechecked after status/state updates, modal removal, composition end, and focus return. The main claim also rechecks health and account preparation. A healthy result drops a deferred grant.
- Manual opening, ordinary dismissal, and preference changes acknowledge the current launch. Opening the header remains available regardless of suppression. Later connection problems update existing status/notices without automatically reopening the dialog. Closing leaves account work and exact uncertain actions intact.
- `promptPreference.ts` strictly parses the exact versioned, bounded `collie.chatgpt-prompt.v1` record. The checkbox saves immediately and can be unchecked in the manually opened dialog. Invalid/read failures appear in the dialog without deleting records; write failures retain the desired value in memory and explain that future launches were not updated. Unchecking never re-prompts this launch.
- Automatic opening has no fabricated invoking element. Dismissal returns to a still-visible manual opener, otherwise the current visible destination heading/region. UI03's modal-aware retained-region focus and OAuth origin guards remain. No navigation, editor selection, draft ownership, Save, or editing-access contract changes.

## Scope

New renderer modules: `promptPreference.ts` and `useChatGptStartup.ts`. Existing owners changed: shared AI channel/types/validation, main AI IPC/service, preload AI methods, connection controller, dialog and scoped CSS, and a semantic destination marker in `RetainedRegion`. No new dependencies, CSP relaxation, provider route, project schema, credential format, model-preference format, operation/binding format, or portable archive format. UI01–UI03 working-tree changes were preserved. The React best-practices review informed hook ownership, lazy preference loading, event cleanup, retained component identity, and accessibility.

## Required checks and acceptance

Script and ignore scope was inspected before formatting. Vendor/generated files and historical test infrastructure stay excluded. The first lint run reported one hook dependency warning; it was fixed without suppression. A subsequent format/lint/typecheck sequence passed. After the final main-owned healthy-startup acknowledgment safeguard, the final sequence passed as follows:

| Command             | Actual outcome                       |
| ------------------- | ------------------------------------ |
| `npm run format`    | Exit 0; no warnings/errors.          |
| `npm run lint`      | Exit 0; no warnings/errors.          |
| `npm run typecheck` | Exit 0; node and web targets passed. |

No automated tests, test infrastructure, builds, app/browser launches, screenshots, provider/account actions, or runtime verification were performed. No test code was changed. Actual launch timing, preparation/account outcomes, preference persistence/failure paths, focus/IME/accessibility, native close, and renderer recovery remain user-owned observations. See the [manual guide](../manual-testing/ui-improvements-UI04.md). No UI04 user results are recorded; release remains NO-GO.
