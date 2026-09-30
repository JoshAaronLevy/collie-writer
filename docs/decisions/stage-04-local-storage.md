# Stage 4 — Local working storage

September 29, 2026. Implementation decision; native behavior and acceptance remain unverified. This supplements D2 and D3 without renumbering D6–D8.

## Location and ownership

Main selects `<local parent>/com.colliewriter.app.dev/working`, separately from Chromium's profile. macOS defaults to the user's Library/Application Support and requires diskutil to identify internal APFS/HFS storage. Windows queries the OS LocalApplicationData folder using a fixed, noninteractive PowerShell command, then requires a fixed NTFS/ReFS volume. It does not infer LocalAppData from Electron's roaming userData. [Microsoft's SpecialFolder definitions](https://learn.microsoft.com/en-us/dotnet/api/system.environment.specialfolder) distinguish local from roaming application data.

Both paths reject known cloud directory names, Windows OneDrive environment roots, symlink ancestors and canonical-path redirection. Windows also rejects UNC paths, reparse points and offline attributes; macOS checks ancestor extended-attribute names for cloud/file-provider markers. macOS resolves the containing device through fixed `/bin/df -P` arguments before asking diskutil for plist metadata: Apple's installed `diskutil(8)` manual specifies device/mount-point inputs, not arbitrary subdirectories. A failed or unavailable native query fails closed and offers a native directory picker. The selected parent is rechecked at every launch. The picker creates an app-specific child; it does not move work or choose a project-file destination. Existing unsafe preferences do not silently fall back to a new empty default.

These checks cannot identify every arbitrary third-party mirroring tool. Users must keep the working folder outside all mirroring/sync configuration. Windows “Fixed” identifies the OS drive category, not proof of physical internal attachment. macOS metadata, Windows redirection and PowerShell availability remain target-platform gates; store sandbox support remains Stage 22. Unsupported/network/external roots are deliberately refused where detected. No live path was inspected or selected by the assistant.

One Electron application instance owns each profile; another launch focuses its window. A separate `owner.sqlite` connection holds `BEGIN EXCLUSIVE` for the active project, independently of its domain and operations databases. Process exit releases the OS/SQLite lock; there is no stale PID lock to delete. [Electron's single-instance API](https://www.electronjs.org/docs/latest/api/app#apprequestsingleinstancelockadditionaldata) provides the application-level focus route. This coordinates one device only.

## Transactions, retries and UI

The utility process serializes commands and shutdown. Creation first records a durable local intent with stable project/workspace IDs, then creates one blank Draft and its initial domain commit atomically. A repeated creation operation uses the same IDs. Every project starts with a null destination and null base-snapshot mapping.

`document.commit` validates AST v1, atom/body ownership, project/document scope and expected document revision. One immediate SQL transaction changes payload/revision, editor-ID projection, project head, parent-linked commit and the operation digest/result. The idempotency lookup precedes revision comparison: identical retries return the original ID-only receipt; a changed payload under the same operation ID fails. Sources/images are rejected until their ownership repositories exist. Project/document/commit relations use foreign keys, including a deferred project reference for initial commit creation.

WAL, `synchronous=FULL`, foreign keys and macOS `fullfsync` apply to writers. SQLite's [synchronous and fullfsync pragmas](https://sqlite.org/pragma.html) describe their durability behavior; real disk/power-loss results are not inferred. New-workspace directory metadata is flushed on macOS. Node does not supply the equivalent Windows directory-flush mechanism here; native durability evidence remains pending. Never delete journals or WAL sidecars manually.

The basic production writing screen uses an explicit **Protect locally** action. It is intentionally plain text, without rich editing or background autosave. Newline-separated paragraphs adopt AST v1 with paragraph IDs retained by position; semantic anchor remapping belongs to Stage 8. Rich payloads are retained and refused by this basic screen rather than flattened. It accepts up to two million text characters; the domain validator also applies its node and per-text-node limits. A rejection retains the buffer.

During a commit, typing continues and only the submitted snapshot becomes protected. Uncertain responses retain the exact operation and newer typing; an explicit retry reconciles the operation before a later commit. Switching projects pauses editing during the open operation and is disabled while writing is unprotected. Native close/quit prompts default to keeping the window open. A lost worker leaves selectable text and copy instructions; no automatic write replay/restart occurs. Unacknowledged keystrokes cannot be promised after a process kill. Recovery acknowledgment never means a portable file was saved or uploaded.

## Migration boundary

Working schema 1 is the first persistent format. There is no supported older-format corpus and no fabricated version-0 migration. The trusted migration registry is empty until a real forward format change exists. Unknown/newer formats are refused before opening a domain writer.

For a registered future migration, the service validates the source read-only, creates and integrity-checks a retained SQLite backup and separate candidate, applies only app-owned migrations transactionally, validates final schema/integrity/foreign keys, checkpoints/closes and flushes the candidate, then publishes `active.json`. Original, retained backup and failed candidates remain. A malformed pointer fails closed. Current-format opens require the exact application-owned SQL schema; a project cannot supply triggers, DDL or executable migrations. [SQLite's backup API](https://www.sqlite.org/backup.html) supplies coherent copies of a live database.

`recovery.json` is derived discovery only. Listing reads the actual database and repairs that metadata; it never advances the head or declares a failed commit successful. Local jobs become interrupted on reopen and are not replayed. Snapshot capture, immutable blob leases, portable archive validation and destination replacement are Stages 5–6; full recovery UI and autosave remain Stages 7–8.
