# UI05 implementation record — Two-step project creation

October 5, 2026. **Implementation complete — awaiting user testing.** Source implementation is separate from runtime acceptance. UI06 has not been implemented.

## Delivered changes

- The wizard presents Project type and Project details, with no AI panel, third numbered step, or Continue without AI action. Successful creation proceeds through access confirmation into writing. Its existing seven templates, required title/byline validation, optional description, remembered author, and first-Save behavior remain.
- Free creation with no prior designation includes designation of the exact confirmed project. Switching from another free project is explained before **Create and write here**. Back/Cancel before dispatch leaves the previous editing choice intact. Paid or already-editable targets bypass designation.
- `prepareSetupCreation` and `completeSetupProject` return explicit success/blocked outcomes. The create helper returns its receipt before selection or follow-up work can fail. Existing flush/replace protection, unresolved outline/proofreading/navigation/composition guards, and main work checks remain authoritative. The completion helper avoids the former busy-state navigation conflict by protecting and validating the exact target before selecting/showing it directly.
- Main's existing designation operation still checks the access revision before and after inventory lookup. It now also rejects an archived target. Renderer intent captures the observed revision and exact prior free scope; changed choices stop for confirmation. A paid `keep` intent cannot silently switch a free slot after paid access disappears. Designation replies, including uncertain replies, are followed by authoritative access reads. Final writing access is rechecked after opening. Failed access reads clear stale renderer access.
- Setup v2 preserves request/receipt identity and internal opening/completion state. Legacy creating requests replay unchanged; legacy committed connection/details records become same-project recovery without assumed switch consent. v2 is saved before v1 retirement and further dispatch. Invalid v2 never falls back to v1. Completion cleanup retires v1 before deleting the completed v2 record. See the [format and restart contract](../formats/project-setup-v2.md).
- Recovery can continue writing with a fresh displayed choice, open for reading without designation, or visit Projects while retaining setup. Missing/archived projects require explicit recovery. A retained completed record reopens without replaying designation. Storage cleanup failures are reported while the project remains available. Setup focus no longer moves behind another modal or during composition.

## Changed owners and scope

`OnboardingWizard.tsx`, its scoped semantic CSS, `setup-draft.ts`, setup-specific helpers in `useWorkspaceController.ts`, and the archived-target check in `main/entitlements/service.ts`. Main/shared access IPC, the one-free-project rule, paid/sample rights, project/AI formats, Save/local recovery, and persistent editor ownership remain unchanged. Existing UI01–UI04 working-tree changes were preserved. No AI transport, account behavior, dependency, or global CSS change was introduced.

## Required checks and acceptance

Script and ignore scopes were reviewed before formatting; vendor/generated artifacts and historical tests remain excluded. An initial format/lint/node-and-web-typecheck sequence passed without diagnostics. The final production code passed the required sequence after the remaining source review changes:

| Command             | Actual outcome                       |
| ------------------- | ------------------------------------ |
| `npm run format`    | Exit 0; no warnings/errors.          |
| `npm run lint`      | Exit 0; no warnings/errors.          |
| `npm run typecheck` | Exit 0; node and web targets passed. |

The subsequent documentation-only status updates were formatted; production code was unchanged.

No tests or test infrastructure were added/modified. No automated tests, builds, app/browser launches, screenshots, fault injection, provider/account actions, or runtime verification were performed. No UI05 user observations have been recorded. Creation, access switching, old-profile conversion, uncertain-reply/cleanup recovery, native Save, focus, and retained-draft behavior await the [user manual guide](../manual-testing/ui-improvements-UI05.md). Release remains NO-GO.
