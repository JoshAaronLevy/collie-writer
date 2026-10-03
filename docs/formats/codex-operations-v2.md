# CD04 device-local operation format

October 2, 2026. Implementation complete — awaiting user testing. This is **operation journal v2**, independent of CD02's account metadata v2. Portable SQL/minimum reader **12**, AST/archive **1** and compilation **3** remain unchanged. Live execution is still refused by CD03.

## Compatibility and owners

`main/ai/local-operation.ts` owns the exact journal union, v2 digest, framing and protected feature projection. `storage.ts` reads/writes both versions in `ai/operations/<operation UUID>.json`, inside the existing `{version:1,encrypted}` OS-encrypted envelope. There is no eager migration, renaming, expiry, cleanup or v1-to-v2 rewrite. Unsupported versions or inconsistent identities fail closed and retain their files. Interrupted atomic-write candidates remain retained.

The encrypted operation envelope is bounded to 4 MiB on read and before write, accommodating v2's separately retained channels and framing, including JSON escaping/base64 overhead. Account metadata keeps its 2 MiB bound. Decoded input/output limits still apply independently. The directory has one combined **64-operation cap**, checked at prepare and start; both existing worker binding caps remain. CD08 owns capacity handoff.

| Version | Exact payload | Identity |
| --- | --- | --- |
| 1 | `version`, `input`, `view` | Original `operationDigestV1(input)`. Canonical keys/order, omission semantics and bytes are unchanged. No route, session or output defaults are inserted. |
| 2 | `version`, `input`, `execution`, `view`, `output` | Separate SHA-256 domain described below. Only a main content adapter can prepare this route; raw renderer prepare remains registered-only. |

Both readers check operation ID, scope, connection, model, action and the correct version's digest. Active retained states become unknown with their actual output and a higher sequence on startup. This is a local journal write, never a provider call. A v1 record remains v1 throughout recovery/protection, even while the app's selected route is local Codex.

## Exact v2 fields and digest

`input` and `view` retain their existing exact shared AI shapes. `execution` has exactly:

- `route: 'local-codex-chatgpt'`, `policyRevision: 1`, `runtimeVersion: '0.160.0'`, `framingVersion: 1`.
- `profileId`, `sessionGeneration`, `catalogRevision`: bounded UUIDs established by the main account/process/catalog owners.
- `accountFingerprint`: SHA-256 of canonical `{label,workspaceId}`, using the sanitized authenticated label and actual account-read workspace ID. It is an account consistency check within a protected profile, not a claimed provider user-subject ID.
- `workspaceId`: the bounded opaque `workspaceRouting.chatgptAccountId` returned by the pinned protocol. It is distinct from the **project workspace ID** in `input.scope`. Missing identity cannot be replaced with a label, project ID or random ID to authorize dispatch.
- `defaultReasoningEffort`: the selected model's validated catalog default, passed explicitly as the supported `turn/start.effort`; no extra effort picker is added.
- `template`: `conversation-v1` or `mechanics-v1`, matched to the committed capture/action.
- `outputContract`: respectively `conversation-text-v1` or `mechanics-final-json-v1`.
- `captureDigest`: the exact committed capture digest.
- `framedText`: canonical JSON `{request,context}`; ordered context objects use `kind,id,revision,label,text`. No context is trimmed or batched.

The v2 digest hashes UTF-8 JSON with keys in this order: `domain: 'collie-codex-operation'`, `version: 2`, `inputDigest` (the frozen v1 function used as an inner content hash), `route`, `policyRevision`, `profileId`, `accountFingerprint`, `workspaceId`, `sessionGeneration`, `catalogRevision`, `runtimeVersion`, `defaultReasoningEffort`, `template`, `outputContract`, `captureDigest`, `framingVersion`, `baseInstructions`, `developerInstructions`, `framedText`. Instruction strings are the immutable `LOCAL_DISPATCH_V2` constants used by the runtime itself. Prompt/context limits remain 16,000/64,000 UTF-16 units; the serialized frame **plus both instruction strings** must fit 80,000 units.

`output` has exactly `commentary` and nullable `finalText`. Raw ordered visible output remains in `view.text`. Combined commentary/final text is bounded to 128,000 units, as is raw visible output. A non-null final is permitted only for a completed operation and must occur in the raw output. The transport's single-completed-final-item rule remains authoritative; hidden reasoning and runtime handles are not retained here.

For conversations, the protected projection uses raw visible text. For local v2 proofreading, a completed single final response supplies the existing worker's strict whole-result parser. Missing/ambiguous final output projects as failed with actual raw text, producing no findings. Other non-completed states retain raw text and cannot authorize corrections. The encrypted record retains all channels; the portable proofreading output field contains the projected response. Native output-schema constraints and additional feature presentation remain CD06 work. Adding a schema, changing framing/instructions or changing this output contract requires a separately versioned identity and preserved old reader, not edits to frozen v2 defaults.

## Local bindings and consumers

Legacy `ConversationBinding` retains exactly `attemptId,operationId,connectionId,model,digest,captureDigest`, with no version key. A new local binding has those same fields plus **`version:2`**. `shared/conversations.ts` validates the exact union for **both** workers; `operations.sqlite` DDL and job kinds `conversation-binding` / `proofreading-binding` are unchanged. Bindings contain no profile/provider workspace/session handle and never enter project archives.

| Consumer | Treatment |
| --- | --- |
| `AiService` / `AiStorage` | Exact versioned reads, same combined cap, separate live/unprotected and protected snapshots. No journal can reconstruct a live session. |
| `AiContentService`, both feature adapters | Main-only protected reader checks binding version/digest, original scope/input and capture/template. Exact legacy records use legacy semantics. |
| Worker binding readers / bind / settle | Shared exact binding union; exact request equality, scope/action/operation/digest and sequence checks remain. |
| Renderer/preload/public AI record | Existing sanitized operation/input only; no new runtime/config/schema/account-identity IPC. Only protected operation snapshots cross this boundary. |
| Portable validators, archive, migration, copy/rekey, transcript and manuscript exports | No new portable fields or enum changes. Copies carry saved history, not local execution authority. No SQL migration is needed. |

An in-memory main review stamp binds the selected route/generation and action/template to the exact worker review/capture digest. It expires after five minutes, is bounded to 64 reviews per adapter, and is checked before new sent-intent commit and again during prepare. Local saves remain available without a working AI store. Restart, account/model/catalog changes and close/suspend invalidate unsent dispatch authority; already submitted receipts remain exact and immutable. Review stamps never enter portable requests or alter existing request digests.
