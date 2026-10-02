# I12 — durable conversations beside the manuscript

October 2, 2026. **Implementation complete — awaiting user testing.** I10 remains partial. This decision implements only the I12 foundation, not C01–C08/C04A/C04B, I13, or TE01–TE04.

## Product surface

The existing optional Write → AI companion now owns a compact local conversation library, title search, Active/Archived filters, creation, rename, archive/restore, a plain-text transcript and composer. Native transcript export lives in Conversation actions. The global notice makes unsent drafts, pending work and local protection errors discoverable from other destinations. Mantine controls use feature-owned semantic CSS Modules and the existing static theme/CSP arrangement. There is no new column, provider library, remote asset, stylesheet injection or advertising surface.

The session-level `ConversationProvider` remains above routed/hidden views. The panel remains mounted inside the writing companion. Selected conversation, list filter, message page, scroll, text, explicit context/history choices and reviewed captures survive ordinary panel/navigation changes. Up to 20 nonempty composer drafts are retained in memory; each must be saved as a local request or explicitly cleared before leaving the project or closing. Drafts do not secretly persist to browser storage. They are not crash-durable until **Save request locally** or **Send reviewed request** receives a stored intent receipt. The retained draft registry now includes retained unsent input in native dirty/close/access protection. Save of a project file is separate from saving a request locally.

Reading and exporting history work offline/read-only. Creating, metadata changes and appending new requests require editable project scope. On access loss, visible text stays available for copying/clearing; no new inference is authorized as a grace operation. Internal bind/settle operations protect an already stored/authorized intent under main ownership and are not renderer mutation APIs.

## Explicit sharing

Default context is none and default history selection is empty. The author can attach the current saved text section or an exact selected passage. The renderer captures block offsets from the retained editor; protection must finish with the same editor document/section. The worker derives text from the specified saved revision, never trusts renderer-supplied manuscript text and refuses stale targets. Context is a disclosed plain-text projection: visible text, paragraph breaks, labelled citation/footnote references; section capture also includes stored footnote bodies. Images and formatting are omitted. No URL, source attachment or remote content is fetched.

The review shows the exact prompt and each attached text item, excluded-message count, account/model choice, template and capture digest. Selected prior messages remain in transcript order and are re-read at review/append. Active/unknown response messages cannot enter history context. Both prompt and context have visible bounds; oversized contexts require a smaller passage/fewer messages. No trimming, chunking, automatic summary, manuscript rewrite or research-source capture is added.

Save locally creates a durable `not-sent` attempt and no assistant message. There is no queue for eventual provider activation. Changing an account/model clears review and requires a fresh decision. A new inference attempt copies only the old prompt into a new draft; writing/history must be chosen and reviewed again.

## Durable intent and actual execution

Schema 11 separates conversation metadata, messages, immutable captures and attempts. See the [format/consumer matrix](../formats/working-project-v11.md). Unknown write acknowledgments retain the original request and operation identity. Exact replay observes the original intent, never dispatches a second provider call. Conversation metadata uses existing domain-operation receipts. Stable attempt/submission digests protect append idempotence.

`main/conversations/ConversationService` owns dispatch and coalesced output protection independently of renderer visibility. It uses the actual I10 service methods underlying prepare/start/cancel/operations/record/protect IPC. The worker commits the request/capture/attempt before main prepares or dispatches. Main then persists the device-local binding before Start. Incoming events match project, workspace, attempt and operation, with monotonic sequence. A 250 ms main write coalescer bounds partial writes; the renderer throttles its transcript reads. Account/runtime identifiers never enter portable content or transcript export.

Reconciliation reads only retained local I10 records, comparing the captured input and binding digest before applying output. It never refreshes OAuth, loads models or starts inference. Missing execution records and independent-copy interruptions preserve text and report uncertainty. An uncertain local write retries its exact input. **Retry local protection** invokes the existing disk-only protection method where an actual retained operation exists; it cannot resend inference. Deliberate inference retry requires a new capture and attempt.

Main access/project replacement and native close/update guards include unfinished conversation protection. The writing editor stays retained while transcript commits refresh only the project head/save status. Stop records a request to stop; it does not assert a completed cancellation or refund. Failed/unknown/cancelled attempts retain real partial output. A refusal never invents assistant text.

## Current provider boundary and limits

All I10 registrations remain null; its included-only funding, text-only isolation, eligible-model readiness and packaged runtime work remains unresolved. The UI exposes the actual unavailable reason, local saving and history. It does not advertise an invented model or ready state. Future I10 activation must adapt its authoritative status/eligibility contracts before enabling the already wired Send path. There is no API-key/paid-credit fallback, provider invocation, sign-in or activation in this stage.

The current I10 retained journal has a global 64-operation ceiling. A busy/capacity refusal is shown honestly. Nothing deletes journals or raises this limit; C07 owns sustained-use retention. Title lists page by 20; transcripts page by five requests. Source promotion into Research remains the explicitly approved C04A/C04B work, not an automatic side effect of a chat reply.

## Export, privacy and observations

A trusted native picker grants one transcript destination. The worker validates the conversation revision again and exclusively creates a new UTF-8 file. Existing files survive even if the picker offers replacement; choose another filename. Ordered roles, UTC dates, known provider/model and outcome are included. The optional context appendix is off by default. Export contains no implicit account/workspace identifiers, runtime handles or grants and does not affect manuscript exports.

Portable context/transcripts intentionally contain the writing the author approved for the conversation. They follow the user's project files and backups, never vendor hosting or diagnostics. The new profile-local execution mapping contains identifiers but no tokens; protected I10 account/input/output records retain their existing encrypted owner. No retention expiry was introduced.

Source/configuration inspection is not runtime validation. Native migration/round trips/copy behavior, selection/IME, focus/keyboard/screen reader/zoom/CSP, streaming/recovery and actual provider outcomes remain unobserved. No tests, checks, build, app launch or provider execution occurred. User observations belong in the [manual guide](../manual-testing/improvement-I12.md) and [record](../validation/improvement-I12.md).
