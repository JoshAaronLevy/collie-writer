# Stage 4 — Durable working projects and migrations

September 29, 2026. **Implementation complete — awaiting user testing.** No current acceptance, native durability or release gate is marked passed.

The implementation plan, applicable instructions, storage/command/editor contracts, prior stage records and actual source/Git state informed this stage. The checkout was clean at the start. Stages 1–3 are implementation prerequisites; their pending native/fidelity acceptance is not inferred from this request. Only Stage 4 and necessary shell/bridge changes were implemented.

## Changed paths

| Paths | Change |
| --- | --- |
| `src/main/paths/working-root.ts` | Native local-root selection, redirection/cloud checks, required-location state and native fallback picker |
| `src/shared/projects.ts`, `src/shared/commands.ts`, `src/preload/index.ts`, `src/main/projects-ipc.ts`, `src/main/ipc.ts` | Narrow typed project capabilities; input/result/frame validation; bounded errors and dirty notification |
| `src/main/storage-worker.ts`, `src/worker/index.ts` | Serialized project transport, bounded pending requests/timeouts, uncertain-outcome handling and orderly worker shutdown |
| `src/worker/projects/repository.ts`, `src/domain/projects/errors.ts` | Local catalog/jobs, owner lock, idempotent project creation, database-backed discovery, revision CAS and atomic commits |
| `src/worker/storage/{schema,digest,files,migrations}.ts`, `driver.ts` | Versioned portable SQL, canonical operation digest, trusted path boundaries, staged retained-copy migration service and macOS fullfsync |
| `src/renderer/src/features/projects/Projects.tsx`, `App.tsx`, shell CSS | Real project list and plain-text drafting/protection, immutable retry snapshot, preserved newer typing and emergency copy action |
| `src/main/index.ts`, `menus.ts` | Single-instance focus, dirty close/quit prompt and accurate local-recovery descriptions |
| Plan, README, AGENTS and Stage 4 documents | Current status, format/decision ownership, manual guide and explicit pending gates |

No dependency, lockfile, test file, CI or packaging pipeline was changed. Existing CPAL initial-session attribution remains visible above the project screen, with Help notices/source intact.

## Decisions and persistent adoption

[Local-storage decision](../decisions/stage-04-local-storage.md) and [working schema/command contract](../formats/working-project-v1.md) record root rules, exact schema ownership, transaction/retry behavior and limitations. App-owned schema/minimum-reader/editor version 1 is the first persistent adoption. No database was created or migrated by the assistant. The production migration service retains originals/backups and publishes a validated candidate pointer, but its real migration registry is empty until a genuine older supported format exists. Unknown/newer formats are refused; no fixture migration or fabricated historical version is claimed.

The basic screen uses explicit Protect locally rather than autosave. All projects start without a selected destination. Acknowledged commits contain complete AST/footnote state and ID-only operation receipts; device-local paths/jobs/locks remain separate. Sources/blobs and rich editing await their owning repositories/UI. Commit lineage is not full historical snapshot materialization.

## Evidence limits and pending work

**No test code, fixtures, generators, harnesses or testing-only UI were added. No tests, typecheck, lint, audit, formatting check, build/package command, app/dev-server/browser launch, screenshot, benchmark, probe or fault injection was run.** Work consisted of source/documentation inspection and edits, plus primary documentation research. Source review is not a passed check. No produced artifact, hash, live runtime result or user data inspection is claimed.

| Gate | Status / owner |
| --- | --- |
| Build/type compatibility; native SQLite binding and worker lifecycle | Unverified; user-built native app observations |
| Two-project isolation, explicit commits, normal restart and close prompts | Pending user; [Stage 4 manual guide](../manual-testing/stage-04.md) |
| Acknowledged-write durability, unknown-outcome replay and revision conflicts | Implemented; internal failure/power-loss behavior remains unverified |
| macOS arm64/x64 local-volume metadata and Windows x64 LocalAppData/reparse detection | Unverified on every current target; blocked native helper yields location-required state |
| Unknown mirroring tools and Windows physical media classification | Detection limitation; user must select unsynced local storage; OS drive type alone is not physical proof |
| Directory/file durability and native locking | macOS directory flush + SQLite file sync implemented; Windows directory durability remains a native gate |
| Newer/corrupt format refusal, metadata repair, migration preservation | Implemented paths, unverified behavior; no actual older supported migration exists |
| Portable archive, snapshot backup/native backup proof, capture/blob leases | Stage 5; D2 backup/native acceptance remains pending |
| Native Save/Open/destination conflicts; full recovery/autosave; rich editor | Stages 6–8; not exposed by Stage 4 |

User-reported results: **none supplied for Stage 4**. No native target is accepted, and historical Stage 1 results are not current Stage 4 evidence. No publication, commit/push, account, personal-data or cloud-service action was performed. Stop after the manual guide and wait for user feedback; Stage 5 is not started.
