# Conversation web research v1

October 8, 2026. AC06 adds explicit web research to the existing development ChatGPT-plan route. [Implementation plan](../../ai-conversations-implementation-plan.md).

## Request and capability

Search the web is off initially. Its explicit chat-scoped choice is session-only; reopening the application resets it. Send freezes that choice with the existing project context, account, selected model, catalog/session and capture digest. Changing context or models does not send a request. Context summaries always use text-only capture 4/execution 5, even when preparing a research message. The current route does not expose validated effort choices.

The new capture 5 uses `conversation-research-v1` and purpose `chat`, with AC05's context/knowledge and AC04's memory semantics. Review delegates context assembly to the frozen capture-4 builder, then changes the version/template and computes a new digest. It never converts a saved capture. Main execution/binding 6 has framing 3, `responses-research-v1`, frozen research instructions and an explicit `researchPolicy` containing only the provider web-search tool, required tool choice and source inclusion. Its digest covers the exact policy and account/model/session/capture. Capture 1–4 and execution 1–5 readers/digests remain supported.

Capability envelope 2 means available to **attempt**, not confirmed ongoing eligibility. No probe is sent. An actual success/refusal observation belongs only to the current account/model/catalog/session. Search-specific unsupported/model refusals do not clear the text model or invalidate ordinary conversation availability. Credential, quota and account-wide failures keep their existing handling. Failed attempts retain the prompt; Try without web search copies it into an empty composer with search off and requires another explicit Send.

The official [ChatGPT-plan route limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations) document conditional web access and require streamed, stateless HTTP input. AC06 omits unsupported output-token/tool-call limits, previous-response IDs and background mode. It keeps the user's existing OAuth credentials, fixed endpoint and no automatic retry/fallback. The [web-search guide](https://developers.openai.com/api/docs/guides/tools-web-search) describes tool output, URL annotations and optional retrieved-source inclusion. These documents establish a contract; account access and live compatibility require user observation.

## Response

`WebResearch` v1 separates a confirmed search flag, up to 64 citations, up to 32 other retrieved references and a source-warning flag. Combined serialized metadata is at most 64,000 UTF-16 units. URLs are HTTP(S), at most 2,048 units, without credentials, whitespace or control characters; titles are at most 300 units. Reference metadata remains untrusted evidence, never a source-save command or proof of verification.

The research parser correlates output/content slots and item identities, accumulates ordered text/refusal deltas, and accepts only assistant messages, provider web-search calls and discarded reasoning items. It validates completion against the streamed answer. An explicit completed event is necessary; EOF and `[DONE]` are insufficient. Completed item events and associated deltas support terminal events that omit duplicate output. Failed/incomplete tools or invalid primary output stay failed/incomplete; interruption retains partial text and an uncertain outcome.

Citation offsets address the exact canonical assistant string, with part-local indices translated into whole-answer offsets. They must be ordered valid UTF-16 boundaries within that part, including zero-width citation markers, without splitting a surrogate pair. Invalid ancillary annotations/URLs and metadata beyond the reference budget are omitted with a warning; useful text remains. Missing terminal source details are disclosed. Reasoning, signatures, raw provider events, queries and tool bodies never enter the retained result. Existing bounds remain: 128,000 answer units, 8 MiB total wire data, 1 MiB SSE event/buffer, 5-minute response deadline and 90-second idle timeout. Stop closes local HTTP; it cannot establish remote cancellation or restored usage.

Only execution 6 operations have a `research` field: null before/non-completion, validated metadata on completion. The encrypted retained snapshot carries both text and metadata through the existing protection owner. No citation is surfaced as durable from an unprotected transient stream.

## Portable ownership

SQL/minimum reader **20** adds `conversation_research(project_id, attempt_id, body)` with a foreign key to the attempt. The retained-copy 19→20 migration adds an empty table without changing historical content. Schema-19 DDL remains frozen. Research results are inserted in the same portable settlement transaction as the assistant text and final attempt. Capture-5 turns require metadata on completion and none on other outcomes; older turns retain their exact shape. Validation rejects extra, foreign-project, unassociated or malformed research rows.

Handoff compares structured references as well as text/state/model/sequence; the existing operation and portable-turn digests cover metadata. Replays/recovery never search again. Manifest admission, full database capture, copy/rekey, full-data retention comparison and working-copy protection include the new table. Transcript export includes the retained public source metadata and canonical ranges even when sent context is excluded. Credentials and account identity remain device-local.

## Presentation and limits

Before initially displaying retained citation badges/source cards, the worker matches each returned URL/title against AC05's canonical project Research. Exact URL/DOI identifiers reuse normalization; title suggestions require review. Matches follow existing merge handling; removed sources are labeled and never restored. Failure to check Research is explicitly shown with Check again; unmatched references are never advertised as new discoveries.

Safe Markdown retains the original text. Clickable numbered badges are placed at the end of the enclosing paragraph/list item using canonical offsets before formatting removes delimiters. Tooltips include the cited passage. Cited pages appear by the answer, matching records say In Research with Open source, and other retrieved pages stay collapsed. Explicit links use the existing native external-link confirmation. No embedded content is fetched.

AC06 does not add sources, fetch their full documents, create excerpts or insert manuscript citations. Those remain AC07. Actual provider success, reference accuracy, Unicode/Markdown placement, project portability and accessibility are awaiting user testing. Distribution/funding/installed-route gates are unchanged.
