# Multipart import analysis — IM08

Implemented October 9, 2026; runtime acceptance pending. This extends the [v1 analysis contract](import-analysis-v1.md) and [project import contract](project-import-v1.md). It does not enable accepted domain writes.

## Versions and ownership

SQL/minimum reader **27** adds `import_analysis_plans`, `import_analysis_parts`, `import_analysis_proposals` and `import_analysis_plan_state`. Schema 26 DDL and its readers remain frozen. Migration 26→27 validates the retained source copy and adds empty strict tables. Snapshots, portable graph admission, full-table retention comparison and independent-copy rekey include these tables. Plans/results travel with the project; provider authorization does not.

New packet/capture/proposal/run **2**, template `project-import-analysis-v2`, direct operation/binding **8**, framing **5**, and handoff **3** have distinct validators and digests. V1 import analysis/v7 execution/v2 handoff remain readable and recoverable. Conversation/proofreading formats and provider transport are unchanged. Only the existing direct own-account ChatGPT route is eligible. No API key, upload endpoint, tool access, reconciliation request, hidden context, external fetch or automatic inference probe is introduced.

`ImportAnalysisService` coordinates a finite grant over the existing `AiContentService`/`AiService` owner. The serial worker owns immutable plans/captures, output settlement and proposal selection. The retained renderer owner presents progress independently of either dialog. It has no authority to append proposals or dispatch individual v2 requests.

## Exact partition

A local preparation reads only the admitted graph and its protected selected originals. Every eligible candidate record contributes its metadata and every original text part. Metadata omits the old graph's redundant fragment list, while preserving text descriptors, locators and facts. Relationships touching eligible records contribute separate witnessed fragments; excluded endpoint bodies are not included.

Metadata/text/relationship strings are split at **12,000 UTF-16 units**, never through a surrogate pair. Fragments identify the graph, original record/identity/digest, file, kind, original text part, exact start/end/total, and hash. Empty original text retains an explicit empty fragment. A record spanning requests keeps its original identity. A body reference is never evidence of coverage beyond the supplied fragment.

Graph order, fragment boundaries and stable part IDs determine greedy packing. Each packet has **1–16 fragments**, at most 16 witnessed relationships and the selected-file manifest/settings. It must fit **60,000 UTF-16 units / 240,000 UTF-8 bytes**. The complete wire body, including instructions, escaped input and model, must fit **80,000 units / 320,000 bytes**. The same check runs again in the provider adapter. No whole-file or message prefix truncation occurs.

The plan has at most **1,024 parts** and a 64,000-unit descriptor. Each part is a separately bounded SQL row; no huge packet is passed to the renderer. There is one immutable plan per graph. Repeating local preparation reads the existing plan. Changed selection produces a different graph/plan and invalidates use of the older plan. Portable validation checks graph/file/settings identities, deterministic part/fragment identities and order, exact text hashes/ranges, relationship witnesses, manifest counts and digests.

## Output and local consolidation

Terminal v2 output is limited to **32,000 units / 128,000 bytes**. The HTTP reader enforces the smaller limit while streaming and at terminal completion; v7 and other features retain their old limits. This is a local output limit, not an unsupported new provider request parameter.

Strict JSON validation requires exact part/digest echo and one coverage entry per supplied fragment. Coverage, entities, links and issues each have at most 16 entries; an entity has at most four fields; explanations and suggested titles have at most 500 units. Stable candidate IDs equal the supplied original record IDs. Original title/body/role/order fields use exact references. Only a title can be suggested, explicitly inferred. All other original facts remain authoritative in the graph. Identified records need matching entities; identified relationship fragments need matching witnessed links. Partial, malformed, mismatched or over-limit results are retained as unsuccessful analysis, without repair requests.

A valid terminal settlement atomically appends one immutable proposal-selection revision and advances the explicit current selector. Each revision selects a successful attempt for one part and points to its predecessor. Exact repeat settlement cannot advance the selector again. Reanalysis retains the prior selected result until a new valid result replaces that part's selection; prior proposals and raw results remain readable.

The local summary combines repeated fragments by stable identity and graph-proven equivalence. Same-identity variants lacking equivalence proof and divergent title suggestions remain conflicts. No title/URL heuristic silently merges content. Summary pages contain at most 50 groups and show up to two suggestion variants; full results retain every suggestion, coverage reason and issue. This summary is not the editable review/confirmation manifest planned for IM09.

## Finite authorization and recovery

1. **Review remaining analysis** selects never-attempted parts only, up to the user-selected ceiling (1, 4, 16, 32 or **64**). **Review reanalysis of part N** selects exactly that part and requires new explicit consent. Failed/invalid/stopped/unknown attempts are never in ordinary Resume remaining.
2. Main retains a five-minute review bound to exact project/working copy, plan digest, current proposal revision, ordered part IDs, account/model and the existing account/catalog/session review stamp. The renderer discloses the selected part numbers, input totals, output bound and absence of additional requests before consent.
3. Explicit **Analyze authorized parts** creates a main-memory-only grant. Its operation identity makes exact repeats observational; another start requires a new review. Main reserves each slot before append/prepare/bind or possible HTTP dispatch. Never-attempted parts alone may advance within that grant.
4. There is one active request. Every successful part must finish portable settlement, encrypted-result handoff and local binding retirement before the next request. This reuses the existing 64 retained-operation capacity rather than accumulating a separate import queue.
5. Stop latches pause before awaiting cancellation. Dispatch rechecks that latch at the existing before-send boundary. Errors, invalid output, unavailable/uncertain writes, capacity refusal, account/model/session invalidation, renderer reload/loss, scope loss and native close pause continuation. An already received result can still finish local protection. No pause resets successful selections or grants automatic retries.
6. Restart and independent copies retain plans/results without a live grant. Reconcile/Check saved progress/Retry local protection never send inference. Explicit continuation reviews only never-attempted parts; reanalysis of an uncertain attempt may consume allowance again and remains a separate choice. No AI reconciliation requests are currently generated.

Maximum lifetime analysis attempts remain **1,024 per batch**, across all plans and legacy attempts. Batch derived storage remains **256 MiB**. Pending v2 attempts reserve **1 MiB** for capture, raw result, proposal and bookkeeping; finalized v2 attempts count actual capture/run bytes plus 8 KiB of settlement overhead. Legacy attempts keep their v1 2 MiB reservation. Actual plan/part/proposal rows also count. Existing intake/graph admission includes these bytes. Database and disk headroom are checked before new writes. A capacity refusal preserves completed work and pauses; it does not evict anything.

## Presentation and scope

Local preparation opens a separate progress dialog after intake exits. Dismissing progress leaves a live authorized run under main ownership; Import → Review analysis plan / progress reopens it. The Import entry stays reachable while selection mutations are locked. Completion never forces a modal open. Part lists use 50-row pages; exact packet/result text uses 12,000-unit pages. Per-file identified/unresolved/missing fragment counts and per-part states distinguish partial coverage from completion. Valid protected results are not a claim that every fragment is identified or that the material is accepted.

Check saved progress is read-only; uncertain starts retain their exact request. Known pre-start refusals clear consent for a new review. Existing global AI recovery remains available, including older single-request analyses. Shared account management, active manuscript/draft ownership and Save remain with their existing owners. Final import stays visibly unavailable; IM09 and IM10 require separate implementation requests.
