# I13 implementation record

October 2, 2026. **Implementation complete — awaiting user testing.** Initial Git state was clean. I13 mechanics review is delivered; provider generation remains unavailable under I10's existing unresolved gates. No user results have been supplied.

## Delivered owners

| Paths | Change |
| --- | --- |
| `src/shared/proofreading.ts`, `src/domain/ai/proofreading.ts` | Versioned mechanics captures/results/findings/decisions, supported rich-document ranges, coverage, grapheme/mark checks, exact result validation and bounded replacement |
| `src/worker/projects/proofreading.ts` | Durable capture/run/finding/decision storage, local intents, actual output settlement, current/stale/missing states, Ignore/Undo ignore, atomic checkpointed Apply and portable graph validation |
| Storage `schema.ts`, `migrations.ts`; project `repository.ts`, `manifest.ts`, `portable-db.ts`, `incoming.ts`; worker index | SQL/minimum reader 12 and all migration/snapshot/read/copy/rekey consumers; originals/candidates retained |
| `src/main/ai/content-service.ts`; main conversation/proofreading services and proofreading IPC; main index | I12 coordinator extracted for both features; same real I10 dispatch/recovery/sequence/protection path, mutually guarded new dispatch, lifecycle/access integration |
| Preload proofreading/index; shared projects/commands; domain capabilities | Narrow validated public methods/events and separate internal output commands; decisions/new intent require edit access |
| `features/ai/proofreading/`, shared `features/ai/selection.ts` | Persistent review owner, semantic Mantine UI, exact context/coverage, paged saved reviews/findings, truthful unavailable/local save, result/decision/stale/history presentation |
| Workspace controller/side panel/preferences, editor adapter, HistoryPanel, App and conversation provider | One retained AI companion, global status, application lock/exact retry, normal editor undo transaction, selected-checkpoint route; conversation behavior retained over shared coordinator |
| Plan/AGENTS, proofreading and conversation baselines, decision/format/manual guide, privacy/accessibility/navigation/runtime documents | Current status, changed ownership, limits and pending user observations; stale I12 plan rows reconciled from its delivered record |

SQL/minimum reader **12**; AST/archive **1**, compilation **3** unchanged. No dependency/lockfile, test code, runtime registration, provider endpoint, commerce/build pipeline, license assets or persistent view-preference schema changed. [Format 12](../formats/working-project-v12.md) contains the migration/consumer matrix; [the decision](../decisions/improvement-13-proofreading-foundation.md) defines the targeting and undo contracts.

## Limits and remaining work

Only en-US spelling, grammar and punctuation are implemented, for a disclosed selection/current section fitting one request. Supported replacements stay within a compatible-mark text run; unsupported rich content and scope limits are visible. One accepted correction makes other findings from the old document revision stale. No source review, inline flags, occurrence suppression, grouped application, chapter/book batching or dedicated review-report export is claimed. These remain P01–P09.

All registrations remain null; authoritative funding/isolation, eligible-model readiness and packaged provider distribution remain unfinished I10 work. The current catalog is explicitly unverified, so Run remains disabled. The real run/validation/application code is present without fake findings, injected results or testing controls. Future activation needs I10's authoritative readiness adaptation and authentic access/funding evidence. No new blanket approval gate was imposed on independent local work.

The main journal still permits at most 64 provider operations globally. No retention deletion, cap increase or API-key/paid-credit fallback was added. Review records travel with project files; only explicit accepted corrections enter clean manuscript exports. Local unsubmitted captures remain in session memory until saved or cleared; crash survival is claimed only for acknowledged durable records. Exact pending operations remain protected at normal close/navigation/access boundaries.

## Basis and observations

The full improvement plan, preserved I12/I13 Important notes, proofreading shared contracts/catalog, I12 source/storage/runtime contracts and Stage 9/10/15 history/annotation/citation decisions guided the implementation. Source and Git inspection are not executed tests. React best-practices skill guidance informed retained state, stable subscriptions and asynchronous scope handling.

No tests or test maintenance, fixtures/mocks/harnesses, checks, typecheck, lint, formatter, audit, build/package, app/dev-server/browser launch, screenshot, probe, benchmark, SDK/runtime invocation, login/inference, account registration, outreach or publication occurred. No private project/profile data was read. User results: **none**. Migration, Save/Open/Backup/copies, editor selection/IME/rich-content/undo, keyboard/focus/screen-reader/zoom/CSP, native close/update and actual model output/quality remain unobserved. Existing release readiness stays **NO-GO**.

Use the [I13 manual guide](../manual-testing/improvement-I13.md), then record Josh's supplied outcomes here. Stop before I14/P01 or any other stage without an explicit request.
