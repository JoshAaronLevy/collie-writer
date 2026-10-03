# CD07 implementation record

October 3, 2026. **Lifecycle implementation complete — awaiting user testing.** User observations: none. Live Send/Run lifecycle acceptance remains blocked by unfinished CD03 isolation; CD03/CD05/CD06 remain engineering partial. Release: **NO-GO**.

The full Codex plan and CD06 handoff were reviewed before this implementation. The [decision](../decisions/codex-CD07.md) records source findings, lifecycle ordering and preservation boundaries.

Repeated-request review, October 3: retained all existing CD07 work and corrected stale status acknowledgment, suspension/native-close ownership and unconfirmed shutdown cancellation copy. `AiConnectionsProvider` retains the exact uncertain action until a later-started local status read; main separates suspension release from close cancellation; `codex-text-turn.ts` maps local termination after possible dispatch to an unknown outcome. All three corrections remain unobserved.

| Owner | Delivered change |
| --- | --- |
| `main/ai/service.ts` | Account mutation waits for content settlement; separate close barrier and explicit Stop; bounded native provider waits; queued content drain; accurate cancelled/unknown outcomes. Original prepare/start identity and registered renewal ownership retained. |
| `main/ai/local-codex-session.ts`, `codex-account-runtime.ts` | Hold teardown ownership through actual child exit; expose stopping state; invalidate exact active account/catalog after real auth/model failure. No new RPC or network path. |
| `main/lifecycle.ts`, `main/index.ts` | Native Keep open/Stop choice, shared update handshake, project/access/close barrier, final settlement, suspend/renderer-loss handling and local-only resume. Storage worker shutdown rules retained. |
| `main/ai/content-service.ts` | Main-only work inventory and queued-write drain; scope-specific pending notices; read/protect/reconcile remain available while new content mutation is barred. Existing failed exact writes retain priority. |
| `shared/ai.ts`, `shared/ai-route.ts` | Exact transient work array and connection-only stopping reason, consumed by main/preload together. No portable reason, operation digest or persistence change. |
| `AiConnectionsProvider.tsx` | Unconditional local status recovery cadence, exact pending/unknown account acknowledgment reconciled only by a later-started read, account-change guard over feature pending work. Existing focus/IME rules retained. |
| `codex-text-turn.ts` | Provider-child shutdown after possible dispatch remains unknown in both state and explanation; confirmed provider interruption and pre-dispatch cancellation remain separate. |
| `AiWorkNotice.tsx` and its CSS Module, `App.tsx` | Always-mounted global work actions targeting original feature/scope/attempt; exact uncertain Stop/protection retry and close/project guard. Semantic styles remain with their owner. |
| Conversation/proofreading providers and panels | Read protected snapshots after missed events; original-request navigation, preserved drafts/editor, honest missing-record/copy explanations. Apply/Ignore/checkpoint/undo owners unchanged. |
| Connection panel/indicator/copy | Discoverable pending-work explanation, reconnect and stopping presentation. |

No tests or test code, harnesses, fixtures, mocks, probes, verification scripts, typecheck, lint, formatting/audit/build/package checks, app/dev-server/runtime/browser launches, sign-in, inference or delegated verification were performed. Ordinary source/Git inspection is not passed testing. No dependency installation, credentials, API keys, registration, outreach or publication was used.

Unobserved: compilation; native dialog/close/update/suspend and provider-child exit; browser cancellation/adoption races; real auth/model/quota/transport failures; late or missed notifications; exact retry/protection and renderer replacement; project/access/draft/IME/focus/CSP behavior; journal recovery and copied-history behavior. Live inference outcomes remain blocked by missing CD03 enforcement, separately from these manual observations.

No format migration: SQL/minimum reader **12**, AST/archive **1**, frozen compilation **3**, operation **v1/v2/v3**, account metadata **v2**, existing encrypted envelope bounds and combined **64-operation** cap remain. CD08 capacity/handoff and CD09 runbook are not implemented. Use the [manual guide](../manual-testing/codex-CD07.md) and stop for user results.
