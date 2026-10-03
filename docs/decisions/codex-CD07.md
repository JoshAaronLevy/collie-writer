# CD07 account, close, stop and recovery lifecycle

October 3, 2026. **Lifecycle implementation complete — awaiting user testing.** CD03, CD05 and CD06 remain engineering partial: missing tool isolation and protected/suppressed runtime content logging still prevent Send/Run. CD07 completes independent lifecycle integration; live request lifecycle acceptance is blocked by those prerequisites. It adds no activation bypass, provider call, capacity handoff or CD08/CD09 work.

## Plan review and owners

The complete Codex plan and CD06 decision/record/manual guide were reviewed against the main AI/account/content services, native close/update/suspend owner, access/storage guards, retained feature providers and draft registry. Existing durable bindings, output protection, copied-project recovery and I13 Apply safeguards remain the owners of their data. CD07 changes no persistent format.

The source review identified gaps relevant to this stage: account mutation guards did not consistently include pending feature writes; native close could tear down the account child before deciding what to do with live inference; feature notices could inherit unrelated account work; dropped notifications lacked an unconditional local status recovery path; an inference authentication failure did not always retire cached account authority.

The repeated CD07 request prompted another full-plan/source review on October 3. It corrected three additional ordering problems: a status read begun before an uncertain account reply could clear that newer acknowledgment; wake/renderer reload could release a native close barrier still in use; provider-child shutdown after possible dispatch could retain a cancellation explanation without provider confirmation. These are source changes, with no runtime observation or acceptance claimed.

## Account identity and work settlement

Main account replacement, disconnect, explicit renewal/resume, cleanup and model changes wait for provider and feature protection work. The shared content adapter's own reserved prepare/start remains allowed through its existing main-only authorization; it does not mistake its committed intent for competing work. The registered route's internal renewal stays distinct from a renderer account action. Both routes keep their existing deployment/funding refusals.

Renderer account actions also refuse while a retained conversation/proofreading/correction or global Stop/protection acknowledgment is unresolved. Unsent text/captures alone do not block changing the account; their approval is invalidated by the existing review revisions, with drafts preserved. An account action with an unknown reply remains registered in the session draft registry until local status reconciliation. It cannot be discarded by a hidden panel or project replacement.

The exact uncertain account action now remains registered until a local status read started after that uncertainty returns. An older in-flight read or unsolicited account completion cannot clear it or hide its notice. This reconciliation reads status only; it does not replay the account action.

An actual authentication failure on the managed dispatch owner invalidates its account generation/catalog and publishes reconnect-required. A model refusal clears the selected model, without selecting a replacement. Outcomes remain bound to the original scope/account/request; reconnect, model refresh and status reads never send a fresh turn. Runtime-managed authentication inside an authorized operation is unchanged. No new protocol method, auth route or dependency was introduced.

## Native close, update and suspend

`ProjectLifecycle` establishes a main close barrier before showing a native dialog. It blocks new account/content/project/access transitions while allowing the already-running request to continue. **Keep window open** releases that barrier without implicitly stopping the active request. If provider/account work is active, **Stop AI work and continue closing** explicitly requests interruption/cancellation. This is shared with the existing update-restart handshake.

After explicit Stop, main waits for actual provider settlement and output retention, then closes the idle account child and drains queued feature writes. Failed exact writes still require their existing explicit disk-only protection retry. The renderer's normal manuscript/file/draft handshake remains required, followed by a final AI/content settlement read before close is approved. Unsaved drafts, unconfirmed corrections and file conflicts keep the window open; no Save/Clear choice is invented on the user's behalf.

Each native wait for provider/account teardown is bounded to 25 seconds. Expiry pauses close and leaves its original owner running; it is not cancellation confirmation, an output discard or authority to spawn a replacement child. `LocalCodexSession` retains the child reference until actual exit, counts teardown as pending work, and exposes a connection-only stopping explanation. Existing runtime termination targets only the provider child. The storage worker is never terminated to meet that timeout; pending writes and exact protection failures remain owned.

Suspend or renderer loss closes the dispatch barrier, cancels account work and requests interruption, then tears down the managed child. Possible dispatch still produces unknown/partial output under the existing transport semantics. Power resume or a loaded replacement renderer releases only the suspension barrier; the account needs explicit Resume/reconnect and no provider thread/request is resumed. In-memory unsaved text cannot be promised to survive an actual renderer/process crash; ordinary close preserves its existing draft safeguards and protected recovery remains authoritative.

Suspension and native close have separate ownership. Wake/reload clears suspension only; an in-progress native close keeps its barrier until its own outcome. Conversely, cancelling close cannot undo a still-active suspension. A child shutdown after possible dispatch produces both unknown state and an uncertain-outcome explanation; only an actual provider terminal interruption reports confirmed cancellation. Pre-dispatch cancellation remains distinct.

## Global work and local recovery

`AiStatus.work` is a bounded exact transient array from the two existing main content owners. Each item contains only the original project/workspace IDs, feature, attempt ID and one of running, stopping, protecting or protection-required. No prompt/output, credential, account namespace or runtime handle is added. All main status branches and the shared main/preload validator agree. There is no new IPC command or persistent job/retention index.

The always-mounted `AiWorkNotice` exposes the original saved request, Stop and disk-only output protection through the existing feature IPC. An uncertain action keeps the exact scope/attempt/action in its own registered session owner, even after the main work item disappears. Returning to a request does not switch projects or replace another retained composer. Per-feature events scope their pending state to actual work, so unrelated login work no longer makes old transcripts appear active.

The persistent account provider reads only sanitized local status every five seconds while local storage is available. Both feature owners use these snapshots to recover missed progress/terminal notifications, read the actual protected outcome, and refresh the project head without replacing the mounted manuscript. Focus return retains its original destination/visibility/IME guards. Polling does not call account/read, model/list, login, refresh, prepare/start or a provider thread resume.

Existing local reopening recovery still reads each journal with its original v1/v2/v3 identity, marks interrupted work unknown, and settles its original feature binding. Missing records retain readable history and cannot dispatch. Independent project copies retain portable output/decisions but no original execution bindings; unknown-outcome copy explains this limitation without claiming every unknown record came from a copy. The ordinary exact-pending-request retry path remains intact.

SQL/minimum reader **12**, AST/archive **1**, compilation **3**, local operation **v1/v2/v3**, account metadata **v2**, envelope bounds and the shared **64-operation** ceiling remain unchanged. Main-derived status is not a portable format or send grant. Commercial registrations remain null and release remains **NO-GO**.

No tests/checks/builds/launches, login, inference or user observations occurred. Native close/update/suspend, provider timeouts, local recovery, keyboard/IME/focus/CSP and all runtime behavior are unobserved. Use the [manual guide](../manual-testing/codex-CD07.md), then stop for Josh's results.
