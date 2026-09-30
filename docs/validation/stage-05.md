# Stage 5 — Portable snapshot codec and large-library proof

September 29, 2026. **Implementation complete — awaiting user testing.** Archive acceptance, format freeze, native SQLite backup and large-library proof remain pending. “Complete” refers to implementation, not to those unobserved results.

Reviewed the plan's product scope, stage sequence, shared storage/command contracts, cross-stage release gates, current instructions and Stage 4 schema/migration evidence against a clean starting checkout. The explicit Stage 5 request authorizes this internal implementation checkpoint; it does not establish acceptance of Stages 1–4. No later-stage Save/Open UI, native path grants, source library, rich editor, cloud or commercial infrastructure was added.

## Implementation and changed paths

| Paths | Change |
| --- | --- |
| `src/worker/projects/{manifest,archive,streams}.ts` | Bounded manifest, streaming ZIP64 writer/reader, CRC/SHA validation, exact entry inventory, space preflight and isolated extraction |
| `src/worker/projects/{portable-db,citation-assets,blobs}.ts` | Exact portable SQL/content validation; captured asset graph; fixed offline citation profile/XML limits; immutable blob staging |
| `src/worker/projects/{snapshot,snapshot-jobs}.ts` | Coherent capture, durable provisional/exact leases, queued/coalesced/cancelled/interrupted jobs, retained candidates and trusted open/promotion adapter |
| `src/worker/projects/repository.ts` | Shared mutation/capture boundary, trusted snapshot entry points, migration-aware creation retry and managed-image ownership |
| `src/worker/storage/{schema,migrations,driver}.ts` | Working schema 2 and retained-copy 1→2 migration; chunked backup progress/cancellation |
| `src/main/storage-worker.ts`, `src/worker/index.ts` | Main-selected resource root, strict initialization contract and async job-aware shutdown |
| `package.json`, lockfile, `resources/licenses/`, asset manifest | Exact archive/XML dependencies and complete notice distribution |
| Plan, README, AGENTS, format/decision/manual/license records | Current status, implementation boundaries, migration and deferred acceptance |

[D6](../decisions/D6-portable-snapshots.md), [archive v1](../formats/collie-v1.md), [working schema 2](../formats/working-project-v2.md), [license inventory](../licenses/stage-05.md), and [manual guide](../manual-testing/stage-05.md) are the handoff contracts. Stable stage numbers and model/effort recommendations remain unchanged.

The single active snapshot holds the repository boundary only through backup and exact lease publication, then streams outside it. All registered asset rows are included, not only current image references. Source/history schemas do not yet exist; their consumers must extend this graph without deleting retained assets. Current DB validation intentionally matches the actual one-Draft schema instead of claiming the later 80-section library is already supported.

Snapshot jobs are callable only by trusted worker services. The renderer has no new archive/path/test capability. Stage 6 must connect the real native Save/Open, status/cancel and conflict flows. Same-ID archive promotion refuses collision rather than replacing recovery. Candidate completion cannot alter selected-file status. Original archives, migration originals and ambiguous completed candidates remain retained.

## Migrations and evidence limits

Schema 1→2 adds only the managed-asset inventory and version metadata to a separate copied database, retaining the original and pre-migration backup. AST v1, existing project/document IDs and local settings/operations schemas remain. Listing/reopening older local workspaces can perform the migration at runtime. **The assistant created no database or archive and executed no migration.** Format 1 is the first archive format, so no historical archive migration is invented.

Installed exact dependencies with the pinned toolchain using `--ignore-scripts --no-audit --no-fund`; installation completed. Read package APIs/notices, copied production notices and recorded resource hashes for provenance. These are implementation activities, not compatibility/security results.

**No test code, fixtures/generators, harnesses or testing-only UI were written or maintained. No tests, typecheck, lint, audit, formatter/check, build/package check, app/server/browser launch, screenshot, fault injection, benchmark or validation script was run.** Ordinary source/Git inspection is not a passed check. Existing historical tests and disabled CI were left untouched. No personal data, selected destination, external app/account, publication or Git commit/push was touched.

| Gate | Status / next owner |
| --- | --- |
| Type/build compatibility, native backup, platform packaging | Unverified; user-owned native build/launch, D2 remains pending |
| Existing drafts through schema 1→2, new schema-2 drafts, close/reopen | Pending user; current manual guide |
| Portable file alone restores exact captured content/assets | Unverified; Stage 6 native Open/Save, asset-owning stages |
| Same-operation/coalesced minimum-head capture, GC leases, crash discovery | Implemented internally; no user acceptance inferred |
| Malformed archive/schema/XML and extraction containment | Production rejection paths implemented; no adversarial inputs executed |
| Large library timing/memory/space/cancel behavior | No sample, machine measurement, distribution, failure or artifact exists; D6 budget gate pending |
| History asset retention | All registered assets retained; Stage 9 must integrate real history references and migration |
| Native destination conflicts, lineage mapping, selected-file acknowledgment | Stage 6, not started |
| Interrupted-job inspection/retention UI and GC | Stage 7; unreconciled leases/candidates retained conservatively |

Known limits: synchronous SQLite integrity/semantic scans cannot be preempted immediately; no responsiveness result is claimed for those scans. Validation currently extracts another complete copy, increasing disk and I/O costs; estimates do not reserve space. Windows directory durability remains a native gate. Supported citation bytes are fixed, assets are metadata/inventory primitives until their owning product stages, and current-project switching waits for active snapshot completion/cancellation. These constraints are explicit implementation choices, not measured successes.

User-reported Stage 5 results: **none**. No current target or performance budget is accepted. Follow the manual guide, retain user findings separately, and stop before Stage 6.
