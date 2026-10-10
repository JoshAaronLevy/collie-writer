# IM01 implementation and review record

October 9, 2026. **Implementation complete — awaiting user testing (document review for this stage).** Scope: review the [import implementation plan](../../import-implementation-plan.md) and implement IM01's documentation deliverables. No application behavior or persistent format changed. Use the [manual review guide](../manual-testing/import-IM01.md).

## Delivered

- [Decision](../decisions/import-IM01.md): preserves all seven approved choices, selects the existing direct ChatGPT owner, distinguishes intake/analysis/confirmation authority, records source findings and separates current development feasibility from unresolved release gates.
- [Project import v1 contract](../formats/project-import-v1.md): freezes bounds, identity/offset/digest rules, logical records, metadata disposition, typed commands, exact packet/proposal fields, lifecycle/recovery, accepted transaction, copy/rekey and migration/consumer requirements.
- Updated plan: marks only IM01 complete, links its artifacts, resolves provisional v1 choices and records the receipt/history compatibility work in its assigned later stages.
- Reconciled `ai-import-design.md`: the active direction now imports into an already-created project using the approved formats/categories and ChatGPT integration. It no longer directs a future implementer to create a project or require a Codex process.
- Added the IM01 repository checkpoint. IM02–IM12 remain unimplemented and require separate requests.

## Source review findings addressed by the contract

1. `DirectPlanSession.execution()` accepts conversation templates and `AiContentService` handles conversation/proofreading unions. IM07 must add an explicit import branch through prepare/protect/bind/start/settle/handoff and preserve frozen old versions.
2. `AiHandoffReceipt` v1 purposes exclude import and retained operation versions stop at 6. Imported historical messages must never get fabricated provider bindings; real import analysis gets its own versioned execution evidence.
3. `conversation_messages` has attempt/role uniqueness and `readContextHistory`/memory coverage enforce paired messages. The imported prefix and later context versions must preserve actual repeated roles.
4. `conversation_sources` validates a completed native attempt. Imported source occurrences need their own provenance, including origins without an accepted visible chat.
5. Notes expose human-only origin and restricted AST nodes. Imported origin, authorship and conversion losses need explicit consumers.
6. `readPortableGraph` currently admits only document-shaped `domain_operations.result`. The new import-session/import-commit variants avoid fake manuscript targets and retain strict validation.
7. Managed blobs/snapshot leases, rekey in `incoming.ts`, and full-content/working-copy proof readers need complete import coverage. Existing retention proof caps are narrower than general archive limits and remain explicit safety refusals.
8. Existing picker grants expire before legacy import dispatch. The new staged-file/receipt design removes source-path dependence for import recovery without rewriting the existing importer in IM01.

These are source observations, not runtime test outcomes. The referenced Cultural Analysis data inventory remains the original planning snapshot; IM01 did not run a new data audit, copy private input or call that application's code.

## Official documentation used

The decision cites the fetched official plan-use [inference guide](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference), [preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations) and [overview](https://developers.openai.com/siwc/token-sharing-open-source). The OpenAI Docs skill informed those lookups. No account, token, model inference, capability probe, upload or provider registration was exercised. Documentation establishes a contract direction, not access for this installation/account.

## Checks and unchanged formats

| Item                                                                                                    | Outcome                                                                                  |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Source/document inspection and Git status/diff                                                          | Used to review owners and requested documentation changes; not described as passed tests |
| `npm run format`                                                                                        | Not run: documentation-only changes; not required by standing policy                     |
| `npm run lint`                                                                                          | Not run: documentation-only changes; not required by standing policy                     |
| `npm run typecheck`                                                                                     | Not run: documentation-only changes; not required by standing policy                     |
| Automated tests, builds, app/browser launches, runtime probes, screenshots, benchmarks, fault injection | Not added or run                                                                         |
| SQL/minimum reader                                                                                      | Unchanged at 21                                                                          |
| Archive/editor; conversation/live message; capture/direct operation                                     | Unchanged at 1/1; 2/1; 5/6                                                               |
| Import contract                                                                                         | Documentation v1 only; no runtime schema/table/IPC feature enabled                       |

## Acceptance and next boundary

Josh's seven product choices are approved. Review of the new detailed IM01 contracts is pending; no new approval is requested for those settled product choices. No import, live provider, native persistence, context, visual or accessibility acceptance is claimed. The documentation-only manual guide requires no launch or disposable data mutation.

Current code does not perform import analysis or accept these candidate graphs. IM02 local foundations may be implemented only on a separate request. Commercial/installed/funding/packaging and broader release gates remain unchanged; release stays NO-GO. Stop after IM01's review guide.
