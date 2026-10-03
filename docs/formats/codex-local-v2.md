# CD02 local account metadata and compatibility

October 2, 2026. **Implementation complete — awaiting user testing.** No portable format change: SQL/minimum reader **12**, AST/archive **1**, compilation **3**. `AiReason`, registered OAuth v1, retained operation v1 and `operationDigestV1` remain unchanged.

`ai/codex-local-session-v2.json` uses `AiStorage`'s existing exact outer envelope `{version:1,encrypted:<OS-encrypted bytes as base64>}`. The decrypted payload has exactly:

| Field | Meaning |
| --- | --- |
| `version: 2` | Distinct from CD01's reserved metadata v1 and from future operation v2. |
| `route: local-codex-chatgpt`, `policyRevision: 1` | Trusted route/policy identity, never supplied by a portable project. |
| `active` | Null or `{profileId,account:{connectionId,label}}`. IDs are UUIDs. Label is nonempty trimmed account display text, bounded to 200 UTF-16 units without controls. It does not grant live authentication. |
| `retired` | Up to eight unique profile UUIDs, excluding active. These can only be logged out, never resumed or adopted. Includes candidate login namespaces from before dispatch and incomplete disconnects. |
| `lastAttempt` | Null or exact `{attemptId,connectionId}` from the most recently protected sign-in, where connectionId may be null. A repeated attempt does not restart login. |

No tokens, client IDs, provider subjects/workspaces, runtime IDs, authorization URLs, arbitrary paths or project content are serialized. The profile path is derived beneath the verified working-root AI directory. Browser completion creates a fresh Collie connection UUID even when reconnecting the same label; old records are not rebound.

The reader tries v2 first and refuses malformed/unsupported values without fallback or provider work. If absent, it accepts the exact CD01 [v1 declaration](codex-local-v1.md), retaining that original encrypted file. A v1 account becomes a saved active hint; a profile without an account becomes retired. Ordinary reads do not write migration output or create a runtime profile. The first explicit mutation writes v2 through retained-candidate atomic persistence. Registered account/token records are never converted into local Codex metadata.

Before sign-in, the candidate is durably retired and the attempt recorded. Successful matching login/read atomically selects it and retires the former active profile. Failed or accepted-cancelled login preserves the old pointer. Cancellation closes before the final adoption write starts; a delayed Cancel waits for and reports the actual completion instead of claiming cancellation. A failed adoption write restores the old pointer and retains any uncertain desired envelope for protection. Before disconnect, active becomes null and its profile joins retired. Successful runtime logout removes only that retired metadata entry, not its directory or other retained artifacts. Unknown metadata writes keep an exact in-memory envelope; the disk-only protection action never performs account/network work. On restart, only the last complete valid envelope is read; no failed candidate is guessed or promoted.

Transient `AiStatus` adds `local: null | {issue,cleanupCount,protectionPending,cancellable}`, the `resuming` session state and named `resume`, `cleanup`, `protectConnection` action permissions. New IPC methods accept only an existing connection UUID for resume, or no input for cleanup/protection. Main/preload/events share the exact status/result validation. Connection-only errors stay out of portable conversations/proofreading. Account labels can appear in the app's saved account UI; credentials and runtime URLs cannot.

CD04 still owns the separate execution v2 format, provider identity/session generation and digest. CD08/C07 still owns operation handoff/capacity. Runtime account files and keyring behavior are described in the [CD02 decision](../decisions/codex-CD02.md). Native storage/migration/cancellation outcomes have not been observed.
