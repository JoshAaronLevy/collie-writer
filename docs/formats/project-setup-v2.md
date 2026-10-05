# Device-local project setup v2

UI05, October 5, 2026. This replaces active writes to `collie.project-setup.v1`. It is app-profile data, never a portable `.collie` project or an access grant. Project SQL/minimum reader 13, AST/archive 1, compilation 3, and main capability-settings v1 are unchanged.

## Exact record

The key is `collie.project-setup.v2`. Reads and writes are bounded to 40,000 UTF-16 units of serialized JSON. Unknown fields, unsupported versions, invalid IDs, invalid templates/requests, and inconsistent state combinations are rejected.

| Field                            | Value                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `version`                        | `2`                                                                                                     |
| `step`                           | `type`, `details`, `creating`, `opening`, or `completed`                                                |
| `template`                       | Existing project-template enum, or null before selection                                                |
| `title`, `byline`, `description` | Existing bounded setup text; submitted copies must match the exact validated create request             |
| `rememberAuthor`                 | Boolean; existing author-preference behavior                                                            |
| `request`                        | Null before dispatch preparation; otherwise the exact existing `CreateInput`, including operation UUID  |
| `receipt`                        | Null until confirmed; otherwise exact project/workspace/document IDs                                    |
| `editingIntent`                  | Null before creation or on legacy conversion; otherwise exact `{ mode, expectedRevision, freeProject }` |
| `completion`                     | Null until opening succeeds; `write` or `read` only with `completed`                                    |

Intent mode is `keep` for observed paid access, or `designate` for observed free access. The revision is the existing access UUID and freeProject is null or an exact project/workspace scope. Main still owns all permission, revision, storage, and work checks. Paid access expiring cannot turn a saved `keep` intent into consent to switch a free project. If the exact target is already editable, no designation is necessary.

Type/details have no request, receipt, intent, or completion. Creating has a frozen request and no receipt. Opening/completed have both request and receipt; completed additionally records the confirmed opening outcome. Internal progress/recovery states are not numbered user-facing wizard steps.

## Compatibility and write order

1. Read v2 first. If present but invalid/unreadable, show the existing explicit recovery/discard choice; never fall back to a conflicting older request.
2. Only when v2 is absent, validate v1 under its exact original field/state rules. Preserve all text, author choice, request identity, and receipt. Convert `connection`, or `details` with a receipt, to `opening`. Keep `creating` as the original request to replay. Set intent and completion to null; no past switch consent is inferred.
3. Before further creation dispatch, designation, or opening, successfully write v2 and then remove the active v1 key. If either operation fails, stop that continuation with the in-memory record retained. A written v2 remains authoritative if v1 removal failed. A read alone does not remove v1.
4. Persist a successful create receipt before access/opening. If that write fails, the stored exact creating request can still reconcile the original identity. Access failure never makes a new create identity.
5. Only after the intended access outcome and destination are confirmed, write `completed`. Remove v1 before removing v2. On cleanup failure retain the completed record; its restart action opens the same project without reapplying an old free-slot decision. If writing completion itself failed, retain the prior opening record and explain the failure.
6. Cancel before dispatch clears setup only, with legacy-first removal. Leaving after a dispatched request or receipt keeps it resumable. Explicit discard of unreadable setup removes only the two setup keys, never projects or the author preference.

Uncertain designation replies are reconciled with `readAccess` before another mutation. Already-editable targets proceed; changed revisions/scopes require a fresh deliberate recovery choice. An unavailable access read clears stale renderer access. Missing/archived projects retain the receipt for explicit Projects/recovery actions. No migration or deletion of project contents occurs.
