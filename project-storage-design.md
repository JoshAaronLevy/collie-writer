# Collie Writer project storage and data ownership

October 5, 2026. Explanation of the current implementation and recommendations for the next storage decisions.

Josh accepted the recommended direction on October 5. The storage-only follow-up is [Project storage updates](project-storage-updates.md); PS01–PS02 are implementation complete — awaiting user testing, covering storage/Save explanations, explicit production document icons and a bounded read-only categorized inventory. Later storage stages remain unimplemented. His subsequent direction separates imports into [AI assisted import](ai-import-design.md), where Codex analyzes and organizes research, writing and AI chats from external files.

**Recommendation: keep one self-contained `.collie` file per portable project, backed by a protected working copy on the current computer. Keep disposable caches separate from both.** Research, source originals, citations, writing and saved AI conversations belong to their project and travel together when that project is saved. A user can put the project file in a named Documents folder alongside exports and backups, without having to manage its internal files.

The foundation for this already exists. The main remaining work is to make ownership and disk usage clearer, define safe retention controls, and decide how general research datasets should be imported. We do not need to replace the existing storage architecture just to establish these rules.

This is a documentation proposal, not authorization or implementation of a migration, cleanup feature or new import format. “Current” below means found in source/configuration, not demonstrated in a running app. Native behavior, large-project performance and user acceptance remain unverified; release remains NO-GO. The current [Save and local recovery contract](docs/decisions/save-and-local-recovery.md) remains authoritative.

## Direct answers

| Question                                                                   | Answer and recommendation                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Should research, sources, citations and conversations be project-specific? | Yes. The existing domain database scopes these records to a project. A shared account connection is app-level; its saved conversation content is project-level.                                                                                     |
| App data or Documents?                                                     | Use both for different purposes: verified local application data for working state and recovery; a user-chosen location for the portable `.collie` file. Documents can be the suggested Save location, subject to existing filesystem restrictions. |
| A folder called `collie` or `collie-writer`?                               | Keep the existing stable internal app identity, `com.colliewriter.app`, with separate `.dev` and `.beta` data. Use “Collie Writer” in visible folder labels. Renaming internal roots offers little benefit and would require migration.             |
| Separate folders for writing, research and conversations?                  | Present these as clear areas inside the app. Internally, related structured records belong in SQLite and large original files belong in managed blob storage. They do not need to be loose user-managed folders.                                    |
| One entry-point file?                                                      | Yes: `My Book.collie`. It already contains a manifest, a project database and managed assets. It represents the project, whereas DOCX/PDF/text exports represent selected output.                                                                   |
| Could storage become a problem?                                            | Yes, particularly through large attachments, raw datasets and repeated full retained copies. Current saves are uncompressed. Storage reporting and retention deserve explicit product work.                                                         |
| Warn and offer cache clearing?                                             | Yes, as a proposed improvement, but show how much space is actually rebuildable. Working copies, original research, saved conversations and recovery are not cache.                                                                                 |
| Can project files use the collie logo?                                     | Yes. The existing production association and app icons provide the foundation; a distinct document icon using the approved artwork is also an option. Installed icon/open behavior still needs user observation.                                    |

## The three storage responsibilities

**Portable project data** is what a user expects to take to another computer: manuscript, project details, research, attachments, citation inputs, saved conversations and retained portable history. Explicit Save captures this into the selected `.collie` file.

**Local working data and recovery** hold the current project while it is being edited, including acknowledged changes that have not been saved to that file. A never-saved project's working copy may be its only durable copy. Local operation records also preserve uncertain outcomes and pending AI output. None of this becomes disposable simply because it lives in application data.

**Disposable derived data** can be recreated from retained authoritative records without losing a user's decisions or making another AI/network request. The existing search index is the clearest example. Future thumbnails and preview renderings could qualify. An original JSON dataset, a saved excerpt, a corrected transcription or an AI response does not qualify.

This distinction also applies within the browser profile: unfinished project setup can contain user input and an exact pending creation request. Clearing the entire profile is not equivalent to clearing a browser cache.

## Where files belong

### Current application locations

The working root is selected and checked by [WorkingLocation](src/main/paths/working-root.ts). These are default direct-distribution paths, not promises about a future sandboxed store edition:

| Platform | Production working root                                       | Development difference          |
| -------- | ------------------------------------------------------------- | ------------------------------- |
| macOS    | `~/Library/Application Support/com.colliewriter.app/working/` | Uses `com.colliewriter.app.dev` |
| Windows  | `%LOCALAPPDATA%\com.colliewriter.app\working\`                | Uses `com.colliewriter.app.dev` |

Beta uses `com.colliewriter.app.beta`. A verified alternate local parent can change the prefix. Choosing a parent is not a project Save and does not migrate existing work.

The Chromium profile is configured separately in [profile.ts](src/main/profile.ts), under Electron's application-data directory and the same channel identity. Its `profile/`, `session/`, `logs/` and `crashes/` folders must not be confused with the working root. In particular, Windows working storage deliberately uses LocalApplicationData rather than assuming Electron's application-data path is non-roaming. Account and AI stores live separately from the portable project data.

**Recommendation:** retain these locations and stable identities. Offer understandable “Working data location” and “Project file location” information in the app. A future “Move working data” feature needs its own coordinated migration and rollback; it should not be implemented as a preference change or a manual folder rename.

### The folder a user sees

This is an optional organization example, not a folder tree the app currently creates automatically:

```text
Documents/
  Collie Writer/
    My Book/
      My Book.collie
      Exports/
        My Book.docx
        My Book.pdf
      Backups/
        My Book 2026-10-05.collie
```

Only `My Book.collie` is required to carry the saved project. Exports and backups are independently chosen outputs. Imported source originals are embedded in the project as managed copies; their original download locations do not become dependencies. DOI/URL metadata alone does not mean the app has downloaded the referenced material.

First Save should continue to ask for a destination. It must not silently create a supposedly saved project in Documents. A user may choose another supported location. Existing target-volume restrictions still apply; network drives, arbitrary USB filesystems and every cloud-provider configuration are not currently supported promises. See the [file-location contract](docs/decisions/stage-06-file-locations.md), with its older autosave statements superseded by the current Save decision.

### The internal working layout

This is a simplified map of current ownership. Optional files appear only after the corresponding operation; it is not a complete listing or an instruction to edit these files:

```text
<verified working root>/
  settings/                         local library and picker metadata
  access/                           device-local access records
  ai/                               protected account and operation storage
    operations/                     active operation records and index
    retained-v1/                    retained outcomes and handoff receipts
  file-operations/<operation-id>/    Save/Open/Backup journals and retained input
  reset-recovery/<reset-id>/         projects retained by reversible reset
  workspaces/<project-id>/
    owner.sqlite                    local editing ownership
    <workspace-id>/
      working.sqlite                initial project database
      active.json                   pointer when a migrated database is active
      working-vN-<id>.sqlite         possible migrated active database
      operations.sqlite             device-local jobs and AI bindings
      recovery.json                 derived discovery metadata
      destination-v1.json           selected-file mapping and saved baseline
      origin.json                   incoming snapshot identity when applicable
      organization-v1.json           local archive state when applicable
      blobs/<sha256>                managed source and image bytes
      citation-assets/<sha256>      retained citation resources
      search.sqlite                 rebuildable search projection
      snapshots/<job-id>/            captures, leases and retained candidates
      exports/<job-id>/              export captures and reports
      migrations/                   retained pre-migration databases
```

SQLite may create `-wal` and `-shm` sidecars beside its databases. These are engine-owned files; never classify them by suffix as junk. A WAL can contain committed data absent from the main database. Project Save uses a coherent SQLite backup rather than copying a live database file alone. [SQLite WAL documentation](https://www.sqlite.org/wal.html), [SQLite backup documentation](https://www.sqlite.org/backup.html).

The project ID identifies the logical project; the workspace ID identifies a local working instance. Titles can change without moving or renaming these IDs. Local jobs and account stores can be physically shared at the application level while retaining exact project ownership. A future per-project storage report must account for those records without counting shared bytes twice.

## What is inside a project file

A `.collie` file is currently an **unencrypted ZIP64 container**. The app opens and validates it as a project. Its logical contents are:

```text
My Book.collie
  manifest.json
  project.sqlite
  blobs/<sha256>
  citation-assets/<sha256>
```

The apparent folders above are entry-name prefixes; the format does not require ZIP directory entries. Current archive container version is 1, SQL schema/minimum reader is 13, and editor document format is 1. Older supported projects use their declared versions and retained-copy migration. These are separate version numbers. Sources: [archive implementation](src/worker/projects/archive.ts), [manifest contract](src/worker/projects/manifest.ts), [current schema extension](docs/formats/chatgpt-plan-v1.md).

`manifest.json` is the inventory and compatibility entry point: project/snapshot/head identity, creation time, format versions, and the sizes and checksums of the database and assets. The database owns the title, author, structure and relationships. The manifest does not need to duplicate all that metadata, and it contains no absolute paths to the user's original files.

`project.sqlite` is one structured database with related tables. Writing is represented as a JSON document tree in database records, preserving formatting, block identities, citations and footnotes. It is not a collection of chapter `.docx` files. Large binary originals live outside the database as blobs. Their SHA-256 filenames identify their exact bytes; original names and media types remain in database metadata.

| Project area                      | Current representation and relationship                                                                                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Details and writing               | Project details, document/outline records, structured JSON payloads and stable document/block IDs                                                                |
| Notes and research                | Notes, annotations, questions, claims, evidence links, source decisions and their retained revisions                                                             |
| Sources                           | Canonical bibliography metadata, aliases, provenance, raw import records/reports and revision history                                                            |
| Attachments and inspected sources | Managed asset records point to blobs; source versions, saved page text and excerpts retain the exact representation used                                         |
| Citations                         | Citation items in the writing reference source IDs and locators; occurrence records, settings and supported style/locale resources preserve the citation context |
| Conversations                     | Conversation identity/title/state, ordered messages, attempts and immutable reviewed-request captures, including saved context and actual output                 |
| History                           | Materializable manuscript checkpoints share unchanged section content; other areas have their own revision records                                               |

These relationships are project-scoped and checked by the storage layer. Reusing the same PDF bytes inside one workspace can reuse the blob while preserving separate source or attachment identities. There is no global cross-project blob store to assume. Removing an active attachment link currently retains its bytes because prior source versions and history may still need them. See [source ownership](docs/formats/working-project-v5.md), [source versions and excerpts](docs/formats/working-project-v6.md), [citations](docs/formats/working-project-v8.md) and [conversations](docs/formats/working-project-v11.md).

Credentials, machine paths, local access grants, search indexes and live AI bindings stay outside the portable file. Saved prompts, selected context and responses are project content and can contain sensitive material. Copying a project preserves readable conversation history without transferring authorization to resume an original AI operation. Exporting the manuscript does not automatically include research and conversations; saving the whole project does.

## Why retain the container rather than loose project folders

The existing container gives the user one complete saved artifact to move or back up. A loose `My Book.collie` descriptor plus adjacent `Sources/`, `Conversations/` and `Writing/` folders could also be designed, but then moving the descriptor alone could strand the project. It would require missing-file repair, relative-path rules, coordinated multi-file saves and different cloud-conflict handling.

An exploded folder can reduce the need to rewrite large unchanged assets, so it is a legitimate future option if very large datasets become a central requirement. A macOS package can hide such a folder behind a file-like presentation, but that alone does not provide the same cross-platform save and portability contract.

**Recommendation:** retain the current container for the normal project format. Add human-readable folder exports separately if needed for interoperability. Reconsider an optional large-project format only after deciding the expected dataset sizes and the acceptable Save/backup costs. Do not silently convert current projects into folders or externally linked assets.

## What Save and reopening mean

The app has two different durable milestones:

1. **Protected on this computer:** eligible edits have been committed to the local working project. The current manuscript protection cadence is a 900 ms debounce with a 5-second fallback.
2. **Saved to the project file:** an explicit Save has captured and published a coherent project snapshot at the selected path.

First Save opens the native picker. Later Save writes the local project to the assigned file after retaining the observed previous version. New typing after capture can remain unsaved. Close protects eligible local work without saving the selected file, and reopening can restore newer local work with an unsaved indicator. Explicit form drafts, failed protection, unresolved operations and active AI retain their own guards; not every unsent form field is promised recovery.

Opening a file with a project ID already present locally must preserve both versions and use the existing local-versus-incoming choice. A copied filename does not create a new identity. Save As keeps the project identity; Duplicate/Restore-as-copy create independent project identities. A changed or moved file must not silently replace newer local work. These are reasons to preserve the app's current journals and conflict handling.

**Recommended wording in the product:** distinguish “Protected on this computer,” “Saved to My Book.collie,” and “Changes not yet saved to file.” A local Save acknowledgment must never imply that a cloud provider has finished uploading it. Portable files can participate in user-managed sync; live working SQLite must stay outside sync/mirroring folders.

## Imports have a separate AI assisted design

There is an important current limitation: the source importer interprets `.json` as **CSL JSON bibliography data**, with an 8 MiB input limit and a bounded record count. Managed attachments currently support PDF, PNG, JPEG and UTF-8 text. This is not a general importer for arbitrary large JSON datasets or external chat histories. See [sources.ts](src/worker/projects/sources.ts) and the [source import decision](docs/decisions/stage-11-sources.md).

The new direction is a unified **Import → Research / Writing / AI chats → Add files → Codex analysis → Review → Create project** experience. Codex should interpret different source structures and propose how the material belongs in Collie, rather than requiring users to reshape it into a single prescribed JSON schema. JSON research is one input family within that broader feature.

The [separate AI import design](ai-import-design.md) owns this workflow, format support, analysis/provider decisions, conversion and eventual implementation stages. The storage plan owns only the shared data rules: retained originals and human decisions are project data, provenance survives conversion, incomplete imports remain protected, and only reproducible derived data is cache. Storage work can proceed independently of the import feature.

## How storage can grow

The concern is real. Text is not automatically small: repeated reviewed AI context, source import records, saved extraction text and full document revisions can accumulate alongside attachments. Current growth also includes:

- A local working copy plus the selected portable file and any independent backups.
- All registered managed assets, including removed attachment links and old source versions.
- Materializable history, with unchanged section content shared between checkpoints but changed content retained.
- Migration originals, backups and failed candidates.
- Incoming archive copies, interrupted snapshots, export artifacts and reset recovery.
- Previous files retained beside the selected destination as `.collie-<operation-id>.previous.collie`.
- AI operation records retained after their active capacity has been released.

**Current archives use no compression.** JSON/database text therefore gets no ZIP compression savings. Identical blobs can be reused within a workspace, but every self-contained snapshot carries its assets again. The existing cleanup action clears picker history; it is not a general disk-space cleanup tool. Rebuilding an unavailable search index also retains its old sidecar files. Sources: [snapshot design](docs/decisions/D6-portable-snapshots.md), [file lifecycle code](src/worker/projects/project-files.ts), [search rebuild](src/worker/projects/repository.ts), [AI retention contract](docs/formats/ai-handoff-v1.md).

For illustration only: a roughly 2 GiB working project, a 2 GiB saved file and ten retained 2 GiB previous files occupy roughly **24 GiB**, before migration copies, backups, indexes or temporary Save space. That arithmetic is not a measured storage multiplier. A small text edit can create another large complete previous file.

Saving/opening also needs temporary space for coherent capture, archive creation, validation extraction, destination staging and previous-version retention. Existing operations preflight space and retain work on failures, but the current 64 MiB margin is not a complete user-facing low-space policy. Space must be assessed on each affected volume, especially when the project file and working data are on different disks. Free-space estimates cannot reserve capacity against other applications.

The current archive reader bounds are 1 GiB per blob, 4 GiB for the database, 100 GiB expanded archive data and 100,000 entries. Smaller feature limits apply first. These are rejection limits, not demonstrated usable project sizes or performance targets. See [manifest.ts](src/worker/projects/manifest.ts). Large JSON research may require revisiting both import and database limits before it can be advertised as supported.

## Storage reporting and warnings

There is already a bounded approximate working-root size overview under Data and recovery. It marks incomplete counts and excludes selected files elsewhere. **Recommendation:** expand that into a per-project breakdown and an application total, preserving the current recovery actions.

Show current content, retained history, local recovery, derived cache, AI records, selected project files and known retained previous files separately. Also show the location/volume, whether the count is partial, and how much is eligible for a specific action. Do not present a shared blob twice as reclaimable space. Distinguish estimated file bytes from actual disk space recovered after cleanup; SQLite may reuse freed pages without shrinking its file.

These are suggested starting policies, not implemented or measured thresholds:

| Condition                                                                   | Proposed behavior                                                                                                                                                                               |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rebuildable cache exceeds 500 MiB for one project, or 2 GiB across the app  | Show a dismissible notice with the specific removable categories and estimated bytes. Small caches should not create frequent notifications.                                                    |
| Total project footprint exceeds 5 GiB                                       | Offer a storage breakdown and retention review. Explain that project size alone is not an error and may contain little disposable cache.                                                        |
| Free space falls below the greater of 5 GiB or 10% of a relevant volume     | Show one persistent, snoozable low-space notice identifying that volume and useful actions. Tune these values from ordinary user experience.                                                    |
| A pending import/Save/migration lacks its calculated temporary-space budget | Refuse that disk operation before publication where possible, explain the required location/space, and keep existing data and live buffers protected. Do not silently delete data to make room. |

A cache notice should say, for example, “620 MiB of search and preview data can be rebuilt,” rather than implying all 12 GiB of a project's footprint can safely be removed. If the only large category is retained original research, say so. Rate-limit repeat notices and refresh estimates before a destructive retention action.

## Cleanup rules that protect project data

| Category                                                               | Clear cache may remove it?        | Required treatment                                                                                |
| ---------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------- |
| Derived search index and future preview thumbnails                     | Yes, through their owning service | Retain inputs, close active users, and rebuild on demand; search may be temporarily unavailable   |
| Temporary extraction/render files                                      | Only when proven disposable       | The owning completed/cancelled job must confirm they are not a recovery candidate or active input |
| Working project database, documents and managed source blobs           | No                                | These are project content, including potentially unsaved work                                     |
| Saved source pages, excerpts, annotations and corrected transcriptions | No                                | They preserve the exact representation and human research decisions                               |
| Saved AI prompts, captures and responses                               | No                                | They are project history; another model call cannot recreate the same result                      |
| AI output awaiting protection, bindings and unresolved journals        | No                                | Finish the exact protection/reconciliation flow; never substitute cache cleanup                   |
| Migration copies, previous project files and reset recovery            | No                                | A separate reviewed retention action must establish what can be discarded                         |
| SQLite WAL/SHM files, credentials and profile drafts                   | No                                | Only their respective owners can manage them safely                                               |

The production cleanup service should use a narrow registry of known cache types and owned paths. It should verify that the authoritative inputs remain available, coordinate with active readers/jobs, recheck the reviewed scope immediately before removal, and preserve anything unknown or unreadable. It must not recurse through arbitrary app-data folders looking for old files. Moving files into a quarantine on the same disk does not itself reclaim space; any claimed reclaimed bytes must reflect actual removal.

Deleting an apparently unused blob requires a different, project-aware operation. It must account for current content, archived/trashed entities, old source versions, checkpoints, notes/evidence/citation references, unresolved imports and active snapshot/export leases. Looking only at the currently visible Sources list is insufficient. Existing archives and unknown recovery candidates must remain intact. No general blob garbage collector currently exists.

The current app already allows a reviewed removal of eligible automatic manuscript checkpoints older than 30 days, while protecting manual/pre-action checkpoints and live content. That is deliberate history reduction, not cache clearing, and it may not shrink SQLite immediately. Keep it separate from the proposed general cache action. See the [history retention decision](docs/decisions/stage-09-outline-and-history.md).

Likewise, AI “release capacity” means transferring an eligible operation out of active capacity while retaining its protected record. It does **not** mean erasing the transcript or reclaiming those retained bytes. Any future AI retention policy must preserve exact outcomes and provenance and use its established ownership/receipt checks.

### Removing an inactive local working copy

This could be a useful future space-saving action, but it must be called something explicit such as **Remove local working copy**, not Clear cache. It is not currently offered as a safe general purge.

Before offering it, the app would need to finish protection, prove that an accessible validated portable file contains the current committed project, resolve all relevant local jobs/AI bindings, and explain any local-only recovery/history being discarded. A matching timestamp or a filename in the recent list is not proof. A never-saved project, a newer local head, an inaccessible destination or an uncertain operation must block removal and offer Save/Backup/recovery instead.

Opening that saved file later can recreate a workspace and its indexes. A separate retention choice is still required for local migration copies and other recovery artifacts that are intentionally absent from the portable file. Archived projects are merely hidden from the active list today; archiving does not reclaim their disk space.

## Project file icons and opening

**Yes, the approved collie-and-pencil artwork can be the project-file icon.** `build/icon.icns` and `build/icon.ico` already exist. [electron-builder's stable file-association documentation](https://www.electron.build/v26/docs/api/electron-builder.interface.fileassociation/) supports platform document icons and falls back to the application icon when a dedicated extension icon is absent.

The [production configuration](electron-builder.direct.cjs) already registers `collie` as “Collie Writer project.” Development and beta intentionally do not register that production association. [Main startup](src/main/index.ts) handles macOS file-open events and Windows launch/second-instance paths, forwarding them into the guarded project-open flow. These correspond to [Electron's documented file-opening entry points](https://www.electronjs.org/docs/latest/api/app#event-open-file-macos).

My recommendation is to use the approved artwork for the initial document icon. A later paper-sheet version bearing the same artwork could distinguish an app from a project at a glance. That would be a new asset decision, not a reason to regenerate or replace the approved master now.

The icon association belongs to the installed application/OS configuration; putting a PNG inside each project does not establish it. Double-click should open the complete project through the normal safety flow, including any existing-local-version choice. It must preserve a currently open project's drafts. Finder/Explorer appearance, fresh-launch opening and already-running opening remain user-owned packaged acceptance work, not established by these source findings.

## Other decisions worth making

| Topic                             | Recommendation or question to settle                                                                                                                                                                                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backup versus recovery            | Local recovery protects against some interruptions, not loss of the disk. Encourage explicit portable backups to another location. A backup folder on the same disk is useful history but not protection against that disk failing.                                                             |
| Retained previous versions        | Design a separate preview-and-confirm retention policy for acknowledged previous files and completed artifacts. Preserve uncertain candidates and manual backups; never introduce silent expiry through a cache setting. Count copies beside saved files as well as inside app data.            |
| Save cost                         | Consider compression for database/text entries while keeping compressed media stored. The reader already accepts deflate, but a writer change needs bounded resource handling and user-owned performance/round-trip acceptance. It does not remove the cost of keeping many complete snapshots. |
| Privacy when sharing              | A complete `.collie` includes retained research, raw import records, conversation context and history, potentially including trashed material. It is unencrypted. Make a future “Share a copy” flow explicit about contents; ordinary manuscript export is a different, narrower artifact.      |
| Encryption                        | OS-encrypted credentials do not encrypt project archives or all working content. Decide whether password-encrypted projects are needed as a separate format/recovery feature; do not suggest the existing logo/extension provides protection.                                                   |
| Uninstall and reset               | Keep uninstall separate from deleting user content. Production NSIS currently sets `deleteAppDataOnUninstall: false`; app reset retains recovery. Explain that OS cleanup or manual app-data deletion can still destroy never-saved work.                                                       |
| Ownership across projects         | Keep independent projects self-contained. A future shared source library needs explicit copy/reference semantics; deleting one project must not break another. Defer global deduplication until its ownership and recovery costs are justified.                                                 |
| Cloud and multiple computers      | Synchronize saved portable artifacts, not working databases. Do not promise simultaneous editing or automatic merging. Preserve conflicting branches and do not infer a winner from modification times.                                                                                         |
| Missing files and renamed folders | Preserve local work and distinguish locating the exact saved file, saving to a new location, and opening a different branch. Project title and filename need not match.                                                                                                                         |
| Compatibility                     | Keep minimum-reader enforcement and retained-copy migration. Copying a file to an older app must fail clearly if unsupported, not strip unfamiliar research or conversation data.                                                                                                               |
| Long-term access                  | Maintain documented formats and meaningful exports for writing, bibliography, attachments and conversations. A manuscript checkpoint is not automatically a whole-project time machine covering every research/AI revision.                                                                     |
| Scale requirements                | Decide the largest expected source file, total project, dataset record count and retained history before advertising large-corpus support. Database bytes, memory, import responsiveness, Save time and upload cost all matter.                                                                 |

## Recommended follow-up order

These are proposed scopes for later requests, not newly authorized implementation stages:

1. **Clarify ownership and locations in the UI.** Preserve existing Save behavior; explain local protection, selected project file and recovery. Finish installed file-icon/open acceptance with the existing artwork.
2. **Expand storage accounting and warnings.** Show per-project and app totals, external retained copies, partial counts and actual cleanup eligibility before adding destructive controls.
3. **Add narrowly scoped cache management.** Start with rebuildable indexes and explicitly owned preview data. Keep recovery and content retention separate.
4. **Design reviewed retention and inactive-workspace removal.** Address accumulated previous files, completed artifacts and local-only copies with current-head, ownership and recovery checks.
5. **Plan AI-assisted import separately.** Use the [AI import design](ai-import-design.md) for research, writing and AI chats from varied external structures. Import features are excluded from the storage implementation sequence.

For storage review, start with the three storage responsibilities and the cleanup table. The self-contained project direction is accepted; the storage stages refine visibility and safe retention. Import experience and supported input sizes belong to the separate AI import design. These documents do not change application behavior.
