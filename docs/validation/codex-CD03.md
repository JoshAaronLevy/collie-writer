# CD03 implementation record

October 2, 2026. **Engineering partial.** Delivered account/model controls await user testing; CD03's isolated execution completion criterion is **not met**. User observations: none. Release: **NO-GO**.

The full plan and CD01/CD02 records were read. The [decision](../decisions/codex-CD03.md) records pinned source findings, implemented behavior and exact remaining work.

| Owner | Delivered source changes |
| --- | --- |
| `main/ai/codex-account-runtime.ts` | Same-session bounded model pagination; stricter UTF-8/framing/request handling; managed main-only fresh-thread execution and interruption methods behind the unresolved isolation gate. No renderer dispatch path. |
| `main/ai/codex-text-turn.ts` | Correlated early/acknowledged events, bounded item text, delta/final deduplication, separate commentary/final output, terminal/interrupt/error/unknown handling. Not exercised or reachable past the current gate. |
| `main/ai/codex-local-policy.ts` | Named tool and content-log blockers and authoritative local per-feature unavailable status. Commercial refusals unchanged. |
| `main/ai/local-codex-session.ts`, `service.ts` | Explicit model refresh, account/process generation correlation, serialized actions/close, exact catalog-revision selection, no automatic fallback; old feature catalog remains empty. |
| Shared AI/catalog/route contracts, main IPC and preload | Exact transient catalog/execution fields and named refresh/select-model operations. Portable reasons and persisted records unchanged. |
| Existing connection provider/panel plus `AiModelSelection` | Normal Refresh models/select UI, actual runtime metadata, clear feature/transport refusals, local-only polling and shared progress/focus ownership. |

The source review identified independent model-driven tools that the established flags cannot fully suppress, and a mandatory SQLite log sink with content-bearing paths not disabled by stderr filtering or ephemeral threads. No suitable replacement pin/control was established. These are engineering blockers, not a commercial-approval veto. The current binary remains 0.160.0; no package installation or dependency change occurred.

No tests, test code, fixtures, harnesses, probes, typechecks, lint, formatting/audit/build/package checks, app/dev-server/runtime/browser launches, account access, login or inference were performed. Ordinary source/Git reading is not a passed test. No SDK, credential collection, registration, provider outreach or publication was introduced.

Unobserved: all native/keyring/account flows inherited from CD02; actual model pagination/defaults/error responses; selection/focus/IME/navigation; account expiry during discovery; close/suspend while discovery is pending; Windows; all text transport/streaming/stop/error behavior. No model-quality or structured-output success is claimed. No source trace constitutes live acceptance.

SQL/minimum reader 12, AST/archive 1, compilation 3, encrypted metadata v2 and operational journal v1/digests remain. Capacity remains 64. CD04–CD09 are not started. Use the [manual guide](../manual-testing/codex-CD03.md), then report non-secret observations; finishing CD03 still requires the engineering in its decision.
