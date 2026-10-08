# AC08 implementation and acceptance record

October 8, 2026. Scope: finish the integrated chat → Research → writing experience and consolidate user acceptance. **Implementation complete — awaiting user testing.** See the [plan](../../ai-conversations-implementation-plan.md) and [current integrated manual guide](../manual-testing/ai-conversations-AC08.md). All implementation stages are covered; feature/release acceptance remains pending.

## Changes

- Routine pending work no longer displays a disabled retry action; failed/uncertain actions retain Retry saved action. Local recovery stays in the chat menu when an issue exists. Historical message context is labeled Captured, avoiding a false assertion that a locally retained request was sent.
- Active project responses remain reachable through Open response/Stop when the displayed transcript page or selected chat does not contain the running turn. Running work no longer produces a misleading account-attention prompt in that state. The existing main-owned work status and exact cancel action remain authoritative.
- Source provenance and recovery links now load a bounded transcript page containing the exact original exchange and present that exchange. A presentation generation prevents late replies from replacing a newer chat choice. The handoff preserves other drafts and avoids focusing the composer; no saved request is resent.
- Safe Markdown text spans carry canonical offsets. A selected reference can span supported formatting/link labels while storing the exact retained answer substring and prefilling a plain-text title. Generated badges/images do not establish selected-text provenance. The existing 2,000-unit bound, worker origin check, compact review, duplicate logic and explicit verification remain.
- Compact-height layouts bound composer height and allow overflow rather than losing controls. The transcript remains the ordinary scrolling region. Copy failures now retain a clear manual-copy fallback instead of leaving an unhandled rejection.

## Source review and unchanged owners

Reviewed normal Send/stream/Stop, retained drafts and history paging, automatic summaries, bounded project/prior-chat/research selection, source matching/save receipts, citation handoff, and portable validation/rekey/retention/export consumers. Existing exact operation identities, draft/access/close guards and project-head-only refresh remain the owners. AC08 does not introduce provider calls, account setup, a second queue, new persistence or an inference retry policy.

SQL/minimum reader remains **21**, archive/editor 1, conversation 2, capture 5, direct execution/binding 6 and reference-save receipt 1. Full database copies and the AC07 provenance graph remain unchanged. The source findings above are not runtime test results. The React best-practices skill informed review of effects, bounded rendering, stale asynchronous presentation, semantic controls and retained state.

`npm run format`, `npm run lint` and `npm run typecheck` (node and web) passed cleanly on the final code, in that order, using the pinned Node 24.21.0 toolchain. No warnings, errors or diagnostic suppressions remain from these checks. No automated tests or testing infrastructure were added or run. No build, app launch, browser automation, screenshot, network probe, fault injection or benchmark was performed.

## Acceptance ledger

| Area                                             | Implementation / available evidence                                                                        | Runtime acceptance                                                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| New chat, models, one Send, streaming, follow-up | Implemented. Josh observed streaming text earlier; finalization correction is in source.                   | Pending successful completed reply and follow-up retest.                                                   |
| Context, summaries, prior chats, known sources   | Implemented with bounded selection and inspectable provenance.                                             | Pending relevance, exclusions, long-chat memory and cross-project observations.                            |
| Web research                                     | Explicit supported-route request and durable references implemented.                                       | Pending an actual permitted search and reference inspection. A refusal is not research acceptance.         |
| Research, duplicates, citation and export        | Ordinary source/citation owners, retained review and atomic receipts implemented.                          | Pending save/reuse/formatting-selection/citation-placement/export observations.                            |
| Drafts, Save, Backup/Restore, independent copies | Existing protected owners and portable graph implemented. Josh previously confirmed Save/close correction. | Pending integrated native persistence, rekey, recovery and no-replay observations.                         |
| Everyday usability                               | Compact header/composer, contextual tools, scroll/Stop/focus guards implemented.                           | Pending actual narrow/zoomed, IME, keyboard and screen-reader observations.                                |
| Provider and delivery                            | Own-account/no-key fallback policy retained; no new eligibility claim.                                     | Commercial, included-only, installed adapter, signed-platform and broader release gates remain unresolved. |

Do not promote “Thanks” or authorization for another stage to acceptance. The combined guide is ready for Josh; record only results he actually supplies. A mandatory capability that remains blocked prevents feature delivery. Release remains NO-GO under the existing gates.
