# CD08 implementation record

October 3, 2026. **Implementation complete — awaiting user testing.** C07's shared retention contract is covered by this implementation; other C stages and CD09 remain unimplemented. User observations: none. Live repeated-use acceptance is blocked by CD03 isolation. Release: **NO-GO**.

Repeated-request review, October 3: retained the existing implementation and corrected the acknowledgment retry path in `AiContentService`. Retrying the same acknowledgment now finishes its exact scope-owned failed worker write before the next handoff step, including a retirement whose earlier reply was lost. Worker binding/receipt queries now bound selected text within SQLite and validate the receipt row's operation ID. These are source changes only; no runtime result or acceptance is claimed.

| Owner | Delivered work |
| --- | --- |
| `shared/ai-handoff.ts`, `worker/ai/handoff.ts` | Exact shared receipt, original binding identity, bounded indexed reads and protected binding retirement. |
| Conversation/proofreading worker owners | Committed result comparison and frozen post-receipt settlement; original captures, outputs, findings and human decisions retained. |
| `worker/projects/repository.ts` | Local operations database v2 index with retained pre-upgrade backup; unchanged portable formats. |
| `main/ai/storage.ts`, `handoff.ts` | Encrypted v1 per-ID index, intact cold originals, bounded lazy reads, fail-closed compatibility marker and exact digest checks. |
| `main/ai/service.ts` | Serialized receipt-driven hot-slot release, no-dispatch cold replay/read/protect, shared capacity status. |
| `main/ai/local-operation.ts` | State-only projection for work notices without repeatedly cloning output; frozen operation readers/digests and result interpretation unchanged. |
| `main/ai/content-service.ts` | One shared completed/acknowledged transfer path, exact write retries, missing-record recovery, original-scope deferral and restart reconciliation. |
| `main/entitlements/service.ts` | Read-only accessor for the worker-observed active scope; no new editing or provider grant. |
| Shared requests/status and existing preload validators | Narrow acknowledgment, private receipt actions, exact capacity/work response contracts. |
| Shared capacity display, global work notice and retained feature providers | Original-project links, local handoff/protection controls, explicit retention confirmation, exact uncertain acknowledgment and honest idle status. |
| Both plans, AGENTS, README, provider runbook, decision/format/manual records | CD08/C07 overlap, current local versions, compatibility limits and separate acceptance status. |

Ordinary source/Git inspection informed the implementation; it is not passed testing. No test code was created or maintained. No automated tests, typecheck, lint, format/audit/build/package checks, app/dev-server/browser/runtime launch, sign-in/inference, fault injection, generated fixtures, stress requests or delegated verification occurred. Dependencies and provider configuration were not changed.

Unobserved: compilation, original v1 database upgrade/backup, native encryption and file/directory durability, receipt loss/interruption windows, automatic release across both limits, exact cold replay, readonly/closed/copy recovery, original-project navigation, close/account/draft guards, keyboard/focus/IME/CSP and all live behavior. Missing original records remain conservatively reserved; retained disk usage has no automatic expiration. No user acceptance is claimed from the source design.

Portable SQL/minimum reader **12**, AST/archive **1**, compilation **3**, operation records **v1/v2/v3** and account metadata **v2** stay unchanged. Local `operations.sqlite` becomes **v2**, with the new encrypted handoff index **v1**; pre-CD08 app readers refuse this local layout. Commercial approval, funding, packaging and signing gates remain independent and unresolved.

Use the [manual guide](../manual-testing/codex-CD08.md). Do not advance to CD09 or silently finish CD03.
