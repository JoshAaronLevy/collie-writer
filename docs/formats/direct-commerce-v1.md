# Direct purchase service contract, version 1

The desktop schema stays SQL/minimum reader 9 and AST/archive 1. Stage 18 signed grant/cache formats stay version 1. The service and OS-encrypted connection file are separate new stores, with no manuscript-format migration.

## Desktop boundary

`src/main/entitlements/direct/config.ts` is build-owned public configuration: exact HTTPS origin, issuer, sandbox/live environment, and checkout approval. It is currently null. `keys.ts` is the separately bundled authentic public keyring; it remains empty. Both must match. Never configure either from a renderer, environment override, imported project, checkout redirect or received grant. Sandbox and live use distinct issuers, signing keys, databases and desktop profiles; a live build must not trust sandbox keys.

Named preload commands: read connection; begin monthly/lifetime/restore; reopen pending browser session; check completion; refresh signed access; open authenticated merchant management; disconnect. Inputs are only the finite offer/restore choice. Output is a bounded `DirectView` containing availability, connection/encryption flags, pending kind/expiry, subscription-exists flag and an app-owned message. Service response text, raw errors, customer IDs, tokens and URLs never enter the renderer.

Main uses Node HTTPS fetch to the configured origin and a fixed route list, denies redirects, bounds response size and applies a timeout. This intentional purchase transport does not relax the renderer's offline CSP/request filter. All service requests follow explicit user actions; there is no background desktop purchase polling. Browser links must be the configured service `/connect` with main-owned session fragment, or the exact Paddle portal host matching the selected environment.

`<app profile>/purchase-credentials/connection-v1.json` holds `{version:1, encrypted:<base64>}` or a null encrypted value after disconnection. The decrypted, main-only object contains service origin/issuer, optional bearer credential, subscription flag and optional pending session with ID, three independent secrets, kind and expiry. It is encrypted by Electron safeStorage and written atomically with private file permissions. Unreadable/unknown data blocks connections and is preserved until the user's explicit Disconnect action. It never enters working-project SQL, a `.collie` archive or a support preview. There is no plaintext fallback. Signed grant documents are not encrypted bearer credentials and keep their existing separate replay ledger.

## HTTPS protocol

Every action is POST JSON with an exact input shape and small bounded body; request/response bodies are never logged. App actions reject an Origin header. Browser actions require the exact configured Origin and a session-specific browser bearer secret. CORS is not enabled. No arbitrary user metadata is accepted.

| Route                  | Authority/input                                                                                              | Result                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `/v1/sessions`         | App-generated UUID, SHA-256 claim/browser/device-secret digests, finite kind; optional current device bearer | Twenty-minute expiry; repeated identical ID/digests reuse the session                                           |
| `/v1/browser/read`     | Browser secret + session ID                                                                                  | Kind, sandbox/live environment, public checkout token                                                           |
| `/v1/browser/checkout` | Browser secret + session ID; both checkout/configuration gates                                               | Exact server-created transaction ID; no grant                                                                   |
| `/v1/browser/restore`  | Browser secret + session ID + recovery code                                                                  | Binds the session to the purchase customer after canonical reconciliation                                       |
| `/v1/browser/recovery` | Browser secret + paid session ID                                                                             | New recovery code, shown only to purchaser; prior code invalidated                                              |
| `/v1/session/claim`    | App-only claim secret + session ID                                                                           | Pending or authenticated signed-grant batch and subscription flag; one device authority with idempotent retries |
| `/v1/access`           | Device bearer, empty body                                                                                    | Current authenticated grant batch; connection lifetime renewed                                                  |
| `/v1/manage`           | Device bearer, empty body                                                                                    | Short-lived provider portal URL, consumed only by main                                                          |
| `/v1/disconnect`       | Device bearer, empty body                                                                                    | Deletes that credential and its claimed session                                                                 |
| `/webhooks/paddle`     | Paddle-Signature over timestamp/raw bytes                                                                    | Durable receipt acknowledgment; asynchronous canonical reconciliation                                           |

A claim response does not carry a new bearer token: main generated and securely retained the credential before beginning, and the server stores its hash upon verified claim. A lost claim response can therefore be retried without losing the authority. Ambiguous transaction-creation failures are not retried under a new hidden idempotency key: the session reports an unknown outcome. The user starts a new session; an unreturned draft transaction cannot charge by itself. An actual paid receipt remains recoverable through support.

## Service schema 1 and retention

SQLite tables contain only: environment/issuer identity, immutable signing-key-ID/public-key associations, temporary sessions, hashed device credentials, hashed recovery codes, customer/purchase references with monotonic signed grant envelopes, and minimal event ID/customer/time/status/retry rows. No emails, addresses, cards, raw webhook/API payloads, request IP logs, device fingerprints or project identifiers are persisted. Paddle still receives the billing data entered directly by the purchaser.

Session expiry: 20 minutes. Device connection expiry: one year since successful refresh. Expired session/connection rows are removed during background queue maintenance. Recovery codes remain until replacement. Event IDs, purchase/revocation revisions and public key history remain durable to prevent replay and support restores. Service operators need a reviewed deletion/retention policy before live deployment, without resetting purchase revision counters.

There is one local-disk SQLite owner and a serialized provider-read/commit queue. API lists are fully paged, bounded to 200 pages per request and 1,000 grants per customer; oversized/ambiguous histories fail explicitly and require support. These are service operational limits, not personal project/device ceilings. Webhooks acknowledge after receipt persistence, retry reconciliation with capped backoff, and do not apply historical payload state. Explicit refresh always reads the current provider record. Offline access is never inferred from an unsigned absence or network error.

There is no service migration yet: schema 1 initialization is implemented, other versions are preserved and refused. The runbook requires a private, consistent backup before any future migration and keeps revision high-water marks during disaster recovery. Do not copy an active SQLite main file without its journal or roll the signing revision ledger backward.
