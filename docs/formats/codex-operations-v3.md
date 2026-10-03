# CD06 device-local mechanics operation v3

October 3, 2026. Independent implementation delivered — awaiting user testing; full CD06 remains engineering partial. This extends the [frozen v1/v2 operation contract](codex-operations-v2.md). It does not migrate portable projects or enable inference while CD03 refuses execution.

## Version boundary

`main/ai/local-operation.ts` owns the exact union. `AiStorage` keeps the existing OS-encrypted `{version:1,encrypted}` envelope, 4 MiB bound and paths under `ai/operations/`. V1 and v2 retain their original exact readers, canonical digests and interpretation. V3 is accepted only for `input.action: 'proofread'`. New local conversation requests remain v2; registered OAuth remains v1. New live managed mechanics authorization requires v3, but reading/reconciling a genuine old mechanics record requires its original version. Journals never reconstruct live authority or trigger inference.

V3 payload has exactly `version:3`, `input`, `execution`, `view`, `output`. Input/view and output channel shapes retain v2 semantics. Execution retains all frozen v2 route, runtime, policy, frame, account/profile/workspace/session/catalog, effort and capture fields, with these exact mechanics fields:

| Field | Required value |
| --- | --- |
| `template` | `mechanics-v1` |
| `outputContract` | `mechanics-schema-json-v1` |
| `schemaId` | `collie-mechanics-result-v1` |
| `schemaDigest` | Lowercase SHA-256 of UTF-8 `JSON.stringify(mechanicsOutputSchemaV1())`, using the schema factory's frozen property order |

The descriptor stores an identity, not a caller-supplied schema. Main derives a fresh schema only after matching the fixed ID/digest. Unknown keys, versions, schema identity or inconsistent action/template/digest fail closed while retaining files. No eager migration, expiry, cleanup or v1/v2 rewrite is introduced. A future change to schema bytes or semantics needs its own preserved version boundary.

## Canonical identity

V3's SHA-256 input is UTF-8 JSON with this exact key order:

1. `domain: 'collie-codex-operation'`
2. `version: 3`
3. `executionDigestV2`: the unchanged `operationDigestV2` over this input and execution projected to the historical `mechanics-final-json-v1` contract, omitting only `schemaId` and `schemaDigest`
4. `outputContract: 'mechanics-schema-json-v1'`
5. `schemaId`
6. `schemaDigest`

The v2 digest is an inner hash only; no journal is converted to that projection. It still binds the exact original input, route, account/workspace/session/catalog, runtime, effort, capture, frame and instruction strings. The separate v3 domain/version and schema fields distinguish requests that use native schema constraints. Review, prepare, binding, start, protected output and recovery all retain this identity.

## Result schema and validation

`MECHANICS_RESULT_V1` and `mechanicsOutputSchemaV1()` own the canonical schema. Root/finding objects forbid extra keys and require every supported field. Root values are `version:1`, `mode:'mechanics'`, and a `findings` array capped at 100. Each finding has exactly `targetId`, `from`, `to`, `before`, `replacement`, `reason`, `kind`. Kinds are spelling, grammar and punctuation. Numeric offsets are integral and bounded to the 64,000-unit context ceiling. Before/replacement are capped at 4,000; before is nonempty; reason is nonempty and capped at 1,000. An empty array and an empty replacement are allowed.

Schema matching alone cannot authorize a correction. The existing complete parser checks UTF-16 span lengths, safe text, distinct replacement, nonblank explanation, exact captured target/substrings, grapheme boundaries and pairwise nonoverlap. JSON Schema length uses code points, so the stricter UTF-16 validator remains necessary. The complete result is validated before creating any findings; no partial salvage or automatic repair request exists.

The complete serialized frame plus frozen instruction strings plus serialized v1 schema must fit 80,000 UTF-16 units, alongside existing prompt/context and run bounds. V2 reads keep their original budget without retroactively adding schema size.

`view.text` keeps actual raw displayable output; `output` keeps commentary and nullable final text under existing limits. Only one completed final item is eligible. Protected proofreading projection uses that final text, or failed/raw text if no unambiguous final exists. Other terminal/interrupted outcomes never become applicable findings. This is the v2 channel policy extended to v3, not a portable format change.

## Consumer matrix

| Consumer | V3 treatment |
| --- | --- |
| `AiService`, `AiStorage` | Choose/read exact v1/v2/v3, bind the version's digest, protect before publishing. Active records become unknown on restart with their actual output; recovery never replays inference. Same combined 64-operation cap. |
| `LocalCodexSession`, `CodexAccountRuntime` | Main-only v3 descriptor for new mechanics calls; fixed derived `outputSchema` on the existing `turn/start`. Fresh threads, same guards and CD03 refusal. No schema IPC. |
| `AiContentService` and both adapters | Bind exact prepared version; recovery checks record/binding version, input, scope, capture/template and digest. Protected projections only, with the original write retry ordering. |
| Shared/local binding readers | Legacy versionless and v2 fields unchanged. A v3 mechanics binding adds only `version:3` to the same six identity fields. `isContentBinding` accepts all three; `isConversationBinding` still rejects v3. The historical shared type name remains `ConversationBinding`. |
| Proofreading worker | Reads/binds/settles v3 through the shared exact reader, retaining scope/action/operation/sequence checks. Conversation worker remains v1/v2 only. `operations.sqlite` DDL/job kinds do not change. |
| Status/main/preload/renderer | Required opaque `proofreadReviewRevision` invalidates stale review approval; exact validators and all status branches agree. No persistent grant, schema or runtime identity is exposed. |
| Portable project/archive/copy/export consumers | No new field, enum, prompt, template, capture digest or SQL migration. Local bindings and journals do not travel. Independent copies keep reviews but acquire no execution authority. |

Account metadata stays v2 with its existing 2 MiB bound. SQL/minimum reader **12**, AST/archive **1** and frozen compilation **3** are unchanged. Compilation, journal compatibility, native schema behavior and recovery are unobserved; this is a source contract, not passed testing.
