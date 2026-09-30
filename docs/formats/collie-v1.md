# Collie archive format 1

Stage 5 implementation contract. **Provisional pending native, round-trip and scale acceptance.** Files use `.collie`, are unencrypted ZIP64, and contain exactly:

```text
manifest.json
project.sqlite
blobs/<lowercase SHA-256>
citation-assets/<lowercase SHA-256>
```

There are no directory entries. The writer stores entries without compression, mode 0100600, no archive/file comments. The reader also permits deflate, but never encryption. Only ZIP64 and extended-timestamp extra fields are supported. Paths are ASCII and exact; absolute paths, traversal, backslashes, links, alternate streams, executable entries and aliases are rejected. Archive names never choose user filesystem locations.

## Manifest

UTF-8 JSON with exactly these fields, validated in `src/worker/projects/manifest.ts`:

| Field | Contract |
| --- | --- |
| `format`, `formatVersion`, `minimumReader` | `collie`, `1`, `1` |
| `schemaVersion`, `editorVersion` | Working SQL `2`, document AST `1`; independent version domains |
| `projectId`, `snapshotId`, `headCommitId` | UUIDs; head read from the actual copied database |
| `parentSnapshotId` | Previous destination snapshot UUID or null; never inferred from timestamps |
| `createdAt` | UTC ISO timestamp with milliseconds |
| `database` | `{sha256, bytes}` for the closed, independent `project.sqlite` |
| `blobs` | Unique `{sha256, bytes}` entries matching the captured managed-asset inventory exactly |
| `citationAssets` | Unique `{id, kind, sha256, bytes}` entries for the supported offline citation profile |

No machine ID, selected path, license grant, account secret, local job, owner lock or destination receipt is permitted. Portable mutation receipts contain IDs/revisions only. Authors' manuscript/source text is preserved; this restriction does not attempt to censor strings inside user-authored content.

The fixed citation profile contains `apa-7`, `chicago-18-notes-bibliography`, `en-US`, `csl-style-notices` and `csl-locale-notices`. `src/worker/projects/citation-assets.ts` owns exact IDs, kinds, sizes and hashes from `resources/asset-manifest.json`. Resources are loaded from bundled or extracted bytes, never fetched based on XML URLs. Unknown profiles fail closed. Styles/locales are parsed without DTD/entity resolution; supported hashes and existing copyright/license notices travel together.

## Reader limits and validation

- At most 100,000 entries and 100 GiB actual expanded data, including metadata.
- At most 1 GiB per blob, 4 GiB SQLite database, 32 MiB manifest, and 2 MiB per citation asset.
- Metadata permits at most 64 extra-field bytes per entry; no comments. File lengths must be safe integers.
- Both declared and streamed sizes are enforced. CRC32 is checked for every entry; SHA-256/size are checked against the manifest for database/assets. Hashes establish consistency, not authenticity.
- Preflight available space with a 64 MiB margin before extraction. Use exclusive new files under a fresh app-owned staging directory; no output may overwrite an existing workspace.
- Reject unknown/newer manifest, SQL and editor formats. Inspect app-owned SQL before querying domain tables; integrity/foreign-key checks and semantic validation follow. Schema 2 currently supports exactly one blank-project Draft, a connected commit chain, ID-only operation receipts and managed assets. Row/node bounds prevent an unbounded JSON or index load.
- Extracted asset inventory must match the manifest exactly, including unused registered assets. Referenced images must belong to this project. Source references remain unsupported until their owning schema exists.

Opening leaves the archive untouched, validates before promotion and creates a new workspace UUID. The codec refuses same-project-ID promotion collisions. Stage 6 layers an inspected existing-local/independent-copy choice over isolated extraction; it never replaces an existing workspace. The source snapshot's lineage is retained in local `origin.json` and returned to the caller for destination mapping. Native path grants, chosen-file overwrite and Save acknowledgments are outside this codec.

## Capture and jobs

`ProjectRepository.queueSnapshot(scope, {operationId, minimumHeadCommitId, parentSnapshotId})` is a trusted-worker API, not a renderer IPC capability. The parent must match the repository's local destination lineage. Capture holds the repository mutation/GC boundary through SQLite backup, copied-head/reference discovery and exact lease publication. Pending requests with the same lineage coalesce, retaining each operation ID and minimum head. The copied head must descend from every requested minimum. Subsequent writing never changes an already captured archive.

Per-workspace `snapshots/<job UUID>/job.json` is the device-local job/lease journal, separate from portable SQL and the reserved generic operations store. It records states, captured head, operations, byte progress and blob leases. Files include `capture.sqlite`, `candidate.partial`, `inspection/`, and finally `candidate.collie`. Stage 6 exposes IDs, phase, captured head and byte progress through its bounded file bridge; journals, paths and complete manifests must not be blindly sent as progress events.

Interrupted/corrupt journals and complete candidates survive restart. GC must run under the repository boundary, retain current/history references, and consult `mayCollect` for provisional/exact leases. No GC exists yet. Normal completion removes only the job's capture/inspection copies. `discardTransferredCandidate` may be called only after durable, verified destination acknowledgment; an unsuccessful or uncertain transfer retains the candidate. This format does not encode local save success or cloud upload.

Stage 6 selected-file metadata and reconciliation are defined in the [native-location decision](../decisions/stage-06-file-locations.md). Its per-workspace `destination-v1.json` supplies the snapshot parent after successful file acknowledgment; picker hints and the legacy catalog destination rows do not. Archive v1 itself remains unchanged.
