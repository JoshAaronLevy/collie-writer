# Stage 7 — Recovery and project lifecycle

**October 3 correction:** [Explicit Save and local recovery](save-and-local-recovery.md) supersedes the historical close choices below: normal close now protects local work without requiring a selected-file Save or a separate recovery confirmation.

September 30, 2026. Implementation complete — awaiting user testing. This extends the Stage 6 checkpoint; no native, runtime, type/build, interruption or performance result is claimed.

## Recovery discovery and authority

The shell requests the recovery overview when storage becomes ready. Discovery reads each known workspace through the ownership/migration boundary, repairs derived discovery metadata, and reconciles local heads with destination metadata. Snapshot initialization marks abandoned jobs interrupted and retains conservative leases. The overview reconciles a save journal already proven acknowledged by its matching local generation, snapshot and head. Other incomplete intents remain visible as unresolved entries.

Startup does not hydrate or hash every external/cloud file. Those potentially slow operations run through the cancellable existing file job on opening a project. Replacing/replaced intents receive the full Stage 6 archive/fingerprint reconciliation there; writes are never replayed. A remembered destination is labeled availability-unchecked until this happens. No timestamp selects a winning branch.

Data Locations lists backups, pre-replacement files, local snapshot candidates and retained incoming archives. The backup catalog is derived from strictly read `file-operations/<operation UUID>/backup.json` records, retaining interrupted entries rather than claiming they completed. Catalog entries report what was acknowledged when written, not current availability. Main never accepts a renderer-supplied recovery path: inspection resolves a worker-issued artifact UUID to a discovered path. Local candidates are containment-checked; external files use the existing selected-file rules. All inspection streams into owned staging and runs full archive validation before offering a new independent identity. Backup candidates and previous versions also require their recorded whole-file hash when available. Missing/corrupt/externally replaced versions remain errors without replacing current work. A previous-copy catalog location can be absent if an interrupted save never reached retention.

## Backup, restore, move and duplicate

- Backup uses a native purpose-bound picker, exact expected head checked within the capture boundary, coherent online SQLite backup, complete managed-asset/citation inventory, sibling staging, exclusive publication, full reopen and a separate acknowledgment journal. It never changes destination mapping or saved status. Later typing can resume once the exact capture has completed; only the captured revision belongs to the backup.
- Backup and Move require a **new unused filename**. They do not replace an existing file; native picker acceptance alone is insufficient. A file appearing before exclusive publication causes refusal. Save/Save As retain their existing inspected overwrite workflow.
- Move uses the same coherent snapshot and reopen-before-acknowledgment protocol, then changes the project's local mapping. The old file is always retained. Optional old-file removal is deliberately not offered; the UI explicitly says that Move keeps the original. Recent/Locate use the new mapping afterward.
- Duplicate freezes the exact current head, retains the complete source candidate as a recovery checkpoint, validates/extracts it, and promotes a fresh project/workspace identity. Internal document/reference identities remain scoped to the new project. It starts destination-null and unarchived.
- Restore and recovery inspection offer only **Restore as new project** after validation. They cannot replace an existing workspace. Original work, the incoming archive and origin metadata remain available. There is no in-place restore action requiring an overwrite checkpoint; historical comparison and restoring editor checkpoints remain Stage 9.

Cancelled/failed/unknown operations retain their journals and complete candidates. File-job operation IDs cannot silently replay an unknown transfer. The current UI does not automatically repeat an unknown backup/duplicate/restore; the user can refresh discovery and inspect retained work. Catalog inspection creates another retained incoming archive, so repeated inspections consume storage.

## Title and organization

Rename changes the portable project title in a transaction with a new head commit, expected-head comparison and an idempotent ID-only receipt. The document revision and filename are unchanged. It uses the existing schema-2 receipt shape and validator; no SQL migration is needed. Portable title changes remain pending until Save.

Archive is reversible device-local organization, stored as strictly validated `organization-v1.json` containing `{version: 1, archived: boolean}`. It hides an entry from the default list without deleting content, disabling recovery or changing portable data. Show archived projects and Unarchive restore its visibility. Copies open unarchived. A missing organization record means false; malformed metadata refuses normal discovery rather than guessing.

## Reset, cleanup and retention

Reset is a **reversible reset of the local project list and picker preference**, not a secure erase, account reset or disk-space reclamation tool. The UI lists all projects including archived and destination-null work, their last local commit and assigned destination state. Users can open each and Save/Backup. Typed `RESET LOCAL WORK`, a native confirmation, no unprotected renderer buffer, and a worker-issued review UUID are required. The worker compares the reviewed project/head/mapping/organization digest again under the mutation boundary; changed or unreadable projects refuse reset.

After all owned jobs settle, reset closes the active workspace and moves the entire `workspaces/` directory into `reset-recovery/<UUID>/workspaces/` on the same volume, then creates an empty active workspace directory. This keeps SQLite files and sidecars together and does not copy a live main database or remove chosen files. Restart recreates a missing empty active directory if interruption occurred after the rename. The catalog, file-operation journals, backup records and reset recovery remain retained. Picker-history cleanup affects only `settings/picker-v1.json`.

Recover these projects returns retained project directories without overwriting any active identity. A collision refuses recovery; reopen the chosen archive through Restore as a new project or retain both for later resolution. A stopped batch recovery leaves moved projects in the active list and remaining projects in the batch. Reset recovery has no automatic expiry and no permanent-purge UI in this stage.

There are no disposable content caches yet. Cleanup therefore only clears picker history; it cannot reach workspaces, original assets, retained snapshots, journals, reset recovery or selected files. No blob GC is introduced. Future GC must still use current/history references and durable snapshot leases. Size reporting is a bounded metadata walk of the working root, excludes external selected files, does not follow symlinks and labels partial counts. It is approximate while files change, not a measured disk multiplier.

Local recovery is not an independent backup. OS app-data deletion, disk loss and uninstallers that remove app data can remove all unsaved/reset recovery. Customer-selected `.collie` files are never deliberately removed by these controls, but their survival under OS/cloud/uninstaller behavior has not been demonstrated.

## Shutdown and remaining limits

Close still freezes input, waits for local acknowledgment and file jobs, and gives a keep-open response after the bounded two-minute handshake. Destination failures offer Retry, Save As or explicit close with acknowledged local recovery. Sleep requests a best-effort flush; the OS need not wait. Stage 21 must reuse this handshake before installing updates; no updater is introduced here.

The former worker kill after 30 seconds has been removed. Cooperative shutdown waits for the serial command queue, file-job critical sections, snapshot tasks and repository boundary. After 30 seconds it shows a keep-waiting notice; it does not terminate the writer. Worker-unavailable handling requests cooperative shutdown rather than killing unresolved writes. An OS-level force quit still cannot promise preservation of unacknowledged text.

Stage 6's external last-check/rename race, unsupported-volume refusal, OS-blocked-read cancellation limits, Windows directory-flush gap and unproven cloud/native behavior remain. Backup/Move's exclusive new-file publication avoids replacing an observed existing file but does not provide cloud upload acknowledgment. Large-scale discovery, metadata scans, archive costs and both native platforms remain user-owned release gates.
