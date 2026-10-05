# DP01 credentials, operations and project compatibility

October 3, 2026. Source contract only; migration, native storage and reopening have not been exercised by the assistant.

## Protected device-local state

`AiStorage` adds `ai/chatgpt-plan-credentials-v1.json` beneath the verified working root, using its existing encrypted atomic-write envelope and owner-only file handling. The stable host ID, issued registration, validated subject, label, ID-token hint, access/refresh tokens, scopes, expiry and pending rotation/sign-out intent remain main-only. Up to eight separate registrations are retained. A registration awaiting its first successful exchange has a null subject and no execution authority. Labels distinguish registrations even when emails match.

`credentials-v1.json` (registered commercial OAuth), managed `codex-local-session-v2.json`, older managed metadata, keyring profiles and default Codex credentials are not imported into this store. Explicit sign-out retains the app-client mapping and host ID, clears all tokens/hints, and reports remote revocation separately. An interrupted refresh invalidates reuse of the old rotating token; the registration remains available for browser reauthorization. Failed encrypted candidates remain protected and can only be retried locally.

Operation **v4** is a new exact journal variant for `local-chatgpt-plan`, conversation-only. It binds the frozen direct frame/instructions, policy, validated registration/subject fingerprint, session generation, catalog revision, capture digest and existing request identity. `operationDigestV4` has its own hash domain. It retains bounded text and a final text value only when completion was received. No credential enters an operation, portable transcript or diagnostic.

The original operation v1/v2/v3 readers, digests and meanings remain. Exact replay returns the original protected result without sending. Existing hot/cold receipt handoff accepts operation version 4 and checks its capture/result/portable receipt. The capacity remains 64 hot operations, with existing retained-record behavior. Local binding v4 is conversation-only; proofreading explicitly refuses it. Local `operations.sqlite` DDL remains version 2; no new journal owner is introduced.

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
