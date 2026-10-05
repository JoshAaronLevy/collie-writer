# DP01 credentials, operations and project compatibility

October 3, 2026. Source contract only; migration, native storage and reopening have not been exercised by the assistant.

## Protected device-local state

`AiStorage` adds `ai/chatgpt-plan-credentials-v1.json` beneath the verified working root, using its existing encrypted atomic-write envelope and owner-only file handling. The stable host ID, issued registration, validated subject, label, ID-token hint, access/refresh tokens, scopes, expiry and pending rotation/sign-out intent remain main-only. Up to eight separate registrations are retained. A registration awaiting its first successful exchange has a null subject and no execution authority. Labels distinguish registrations even when emails match.

`credentials-v1.json` (registered commercial OAuth), managed `codex-local-session-v2.json`, older managed metadata, keyring profiles and default Codex credentials are not imported into this store. Explicit sign-out retains the app-client mapping and host ID, clears all tokens/hints, and reports remote revocation separately. An interrupted refresh invalidates reuse of the old rotating token; the registration remains available for browser reauthorization. Failed encrypted candidates remain protected and can only be retried locally.

Operation **v4** is a new exact journal variant for `local-chatgpt-plan`, conversation-only. It binds the frozen direct frame/instructions, policy, validated registration/subject fingerprint, session generation, catalog revision, capture digest and existing request identity. `operationDigestV4` has its own hash domain. It retains bounded text and a final text value only when completion was received. No credential enters an operation, portable transcript or diagnostic.

The original operation v1/v2/v3 readers, digests and meanings remain. Exact replay returns the original protected result without sending. Existing hot/cold receipt handoff accepts operation version 4 and checks its capture/result/portable receipt. The capacity remains 64 hot operations, with existing retained-record behavior. Local binding v4 is conversation-only; proofreading explicitly refuses it. Local `operations.sqlite` DDL remains version 2; no new journal owner is introduced.

## UI02 model preferences addendum — October 5, 2026

`ai/chatgpt-plan-preferences-v1.json` is a separate device-local encrypted record. The exact decrypted payload is `{ version: 1, accounts: [{ connectionId, modelId }] }`. Its reader accepts at most 16 KiB of encrypted-envelope file data and eight unique saved registration IDs; each model uses the existing 1–100-character catalog ID contract. The session checks references against known saved accounts. It contains no credential, email, project identity, writing, or inference result. It is not exported, copied with projects, or placed in operation journals.

Missing records start empty. Malformed/unreadable records or unknown account references preserve credentials and require a local read retry; they are not silently replaced. Failed writes retain the exact intended record for local-only protection retry. Successful sign-out retains preferences for deliberate reauthorization of the same registration. The credentials v1 reader/writer and all existing portable formats remain unchanged.

Selection is applied only against a fresh supported catalog: restore a valid saved choice; for an account with none, select a unique genuine provider default or the first returned supported visible text model. A missing or session-refused saved choice requires a replacement. The current direct adapter has no provider-default signal. Catalogs and refusal evidence remain transient. See the [UI02 implementation record](../validation/ui-improvements-UI02.md) for lifecycle and health semantics.

## Portable working schema 13

SQL schema/minimum reader changes **12 → 13** because older readers cannot understand direct-provider provenance. Table definitions are unchanged. The retained migration copies and preserves the prior database, validates the conversation graph, changes only format markers on the candidate, and validates the candidate before publishing its active pointer. No old attempt is rewritten during migration.

Conversation attempt v1 still means `openai-codex` or unbound/null. New direct-bound attempts use **attempt v2**, provider `openai-chatgpt-plan`, and a concrete model. New locally saved, unsent requests stay unbound v1; binding establishes provenance. Recovery of an interrupted direct bind preserves that provenance even if no response was obtained. A later binding cannot convert an already established provider. Captures, conversations and messages retain their existing versions. Account/client/workspace credentials never travel with them.

| Consumer                                     | Required behavior                                                                                                             |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| New projects and working opens               | Create schema 13; migrate older working databases through the retained path                                                   |
| Strict SQL validation                        | Same exact tables for 12 and 13; exact format/minimum-reader pairing                                                          |
| Manifest/archive reader                      | Accept supported legacy pairs and 13/13; reject newer formats; no archive container change                                    |
| Portable graph/conversation readers          | Read v1 and v2 attempts; refuse direct attempts in schema ≤12                                                                 |
| Snapshot, Save, Backup                       | Emit current 13/13 manifest through the existing schema constant; retain old outputs                                          |
| Duplicate, independent Open, Restore-as-copy | Existing four conversation tables rekey through the ≥11 path; preserve text/provenance; no local binding or credential copied |
| Recovery and receipt handoff                 | Match journal/binding v4; interrupted active requests become unknown, never resubmitted                                       |
| Renderer/IPC and transcript export           | Accept/display direct provenance; retain historical Codex labels; export existing saved text                                  |
| Proofreading                                 | Existing v1 run/record contracts and v1/v2/v3 bindings remain; direct v4 refused                                              |
| Manuscript/editor/export compilation         | AST/editor 1, archive container 1, frozen compilation 3 unchanged; conversations remain outside manuscript compilation        |

Old builds must not be used to write schema-13 working data or direct journals. Their strict readers refuse the new records rather than treating them as Codex. Original projects, archives and migration backups remain available; no downgrade or automatic expiry is implemented.

## UI04 prompt preference and launch coordination

`collie.chatgpt-prompt.v1` is a renderer app-profile preference: exact `{ version: 1, suppressAutomatic: boolean }`, bounded to 128 UTF-16 units before parsing. It contains no account, project, credential, path, or content. Missing records default to automatic prompting. Invalid/unreadable records remain untouched until an explicit checkbox change and produce dialog feedback; a write failure preserves the chosen value for the current renderer and acknowledges this main-process launch. This record never enters portable projects.

The exact `ai.startup` IPC accepts only `{ action: 'prepare' | 'claim-prompt' | 'acknowledge' }` and returns validated preparation/prompt markers plus a sanitized status. Main consumes preparation once and reserves a prompt before reply; acknowledgment and reservation last until the main process exits. They are not persisted and are not permission or inference grants. Suppression controls presentation, not metadata maintenance. No SQL, credential, operation, archive, or model-preference format changes in UI04.

## UI06 presentation ownership

UI06 adds no persistent format or channel. Shared account/model ownership, the UI02 encrypted model preference and UI04 prompt preference remain unchanged. Project setup uses [setup v2](project-setup-v2.md), including retained v1 conversion. The current [UI walkthrough](../manual-testing/ui-improvements-UI06.md) supersedes DP01's routine manual-refresh instructions: ordinary model preparation is automatic, replacement of an unavailable remembered model remains explicit. Feature request captures, exact provenance, journals and local protection contracts are unchanged. Capacity details/original-project links now live in AI work, separate from the connection dialog.
