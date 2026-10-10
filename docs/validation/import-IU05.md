# IU05 integrated import implementation and acceptance record

October 10, 2026. **IU01–IU05 implementation complete — awaiting user testing.** Josh explicitly requested IU05 after IU04. The revised flow is **Import → files/categories/instructions/model → Submit → short summary → Accept**. The original October 10 walkthrough rejected the earlier UX; no acceptance of this replacement, earlier stages or live import accuracy is inferred. Use the [final user guide](../manual-testing/import-IU05.md) for observations. Release remains **NO-GO** under the existing broader gates.

## IU05 changes

- Setup/results retain the existing 38rem Mantine dialog. Its height now matches the actual shared modal viewport offsets, the header/footer do not shrink, and the body is the single scrolling region. Long filenames/titles wrap, file removal controls retain their width, footer actions wrap at narrow sizes, and scrollable/fallback focus targets have visible keyboard focus. Sharing copy moved into the setup body so it does not crowd the stable footer. Textarea scrolling remains ordinary field behavior; no nested import inventory/summary box was added.
- A stable polite live region inside the dialog announces preparation, analysis, stopping, local checking and importing, followed by actual requested-category summary totals. Existing inline errors remain alerts. Results use an instance-specific accessible Coming later description for disabled Re-Analyze; it still has no handler. Reduced motion uses the existing preference and removes the processing spinner; shared dialog/tooltip transitions already honor it.
- The retained presentation owns focus across processing, results, setup and file removal. It moves focus only when the recorded control disappeared or became unavailable, and no newer focus, scope, destination, composition, hidden/inert surface or other dialog owns it. Initial setup uses the existing autofocus convention. Results entry also checks the original workspace destination. Existing after-exit return and account-dialog transfer owners remain unchanged.
- Healthy saved results return to a clean setup after Cancel: unchanged Submit reopens them. Check status is contextual, and View available results remains available for interrupted, stale or disconnected recovery. Continue analysis and Start new import remain deliberate recovery actions. File-intake recovery takes precedence over findings actions, avoiding duplicate Check status controls. A missing category has a short local helper; picker cancellation no longer creates a routine alert. Actual local-write failures name the relevant retry/restoration action.

## Integrated source review

This table records source ownership, not passed runtime checks. Refer to IU01–IU04 records and format extensions for the durable contracts; this stage does not duplicate their architecture.

| Requirement                                                            | Current owner                                                                                               | User acceptance |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------- |
| Compact setup, actual catalog/model, one explicit Submit               | ImportProvider, shared connection owner, main finite coordinator                                            | Pending         |
| Full prepared totals, best-effort automatic choices, no per-item gate  | Worker automatic review/manifest; useImportFlow complete summary reads                                      | Pending         |
| One atomic Accept, exact unknown-outcome recovery, no automatic resend | Existing import commit/receipt, retained flow and AI-work owners                                            | Pending         |
| Retained originals, older decisions, Save/reopen/independent copies    | IU04 compatibility readers, existing project migration/copy/retention owners                                | Pending         |
| Inspect originals and source links after acceptance                    | Ordinary ConversationPanel Read / Find original history, ImportedMessageLinks, SourcesPanel ImportedOrigins | Pending         |
| Literal imported notes remain editable                                 | Ordinary NotesPanel editor/save owner and ImportedOrigins                                                   | Pending         |
| Keyboard, screen-reader announcements, narrow/zoom, reduced motion     | Import presentation CSS/focus and existing shared controls/preferences                                      | Pending         |

The normal destinations remain the way to inspect/edit accepted content; no completed-report screen, per-item review, raw packet view or automatic workspace navigation returns. Account/model preference changes retain saved findings as in IU04 and bind only a later explicit provider submission. No new provider, tools, API-key fallback, dependency, channel, schema or durable format was introduced. SQL/minimum reader remains **32**. Acceptance still does not perform selected-file Save or replace manuscript/unrelated form ownership.

## Cleanup and checks

Removed the results component's separate focus effect/ref and duplicate progress/status announcements, the fixed-instance Re-Analyze description ID, routine picker-cancellation copy and repeated recovery visibility expressions. Healthy summaries no longer produce redundant recovery controls or an empty recovery row. Existing transcript CSS, protected old result/review readers, receipt lookup, portable validators and migration/copy/retention code remain active dependencies documented in IU04. No unused import dependency/asset/configuration or unresolved cleanup removal was identified. No original/history, vendored/generated artifact or historical test code was removed or rewritten.

With pinned Node **24.21.0**, final `npm run format`, `npm run lint`, then `npm run typecheck` completed cleanly; typecheck covered node and web. Scripts/ignore scope were inspected and preserve vendor/generated artifacts and historical testing infrastructure. No rules were weakened or diagnostics suppressed. Source reading is not a passed runtime test.

No tests, builds, app launches, provider requests, sample imports, browser automation, screenshots or runtime verification were performed. Native migration/Save/copy, extraction quality, supported relationships, actual interruption/recovery, appearance and accessibility remain unverified until Josh reports observations. Record those observations here before claiming acceptance. Fix observed defects within this revision; do not infer acceptance from advancing through its stages.

## Deferred scope

Active Re-Analyze, file reformatting assistance, new formats and extraction improvements based on actually missed material remain deferred. Re-Analyze has no hidden authoring/dispatch support. Accuracy percentages are not measured guarantees. No further implementation stage is started automatically; stop after the final guide for Josh's observations.
