# Setup reopening correction — October 6, 2026

Josh reported that **Continue to writing** on launch remained in setup with **Setup needs attention** and **Access to local storage was denied. Your current text has been kept.**

Source inspection identified a lifecycle error in `completeSetupProject`: a retained receipt went directly to `openSection`, but `ProjectRepository.section` requires an already active matching project through `fileContext`. After restart, the worker has no active project. Its `DENIED` response is displayed as the generic local-storage warning. Listing the library does not retain an active project owner.

Completion now calls the existing `openProject` path first, preserving project-change/file guards and repository acquisition. It then restores the receipt's section only if it is still active text and differs from the opened section. Otherwise the normal project-opening selection supplies an active text section. The same correction serves writing, reading, and completed-record cleanup recovery. Setup identities, access confirmation, draft protection, and completion persistence/cleanup are unchanged. No project data or profile records were manually changed.

**Implementation complete — awaiting user testing.** `npm run format`, then `npm run lint`, then `npm run typecheck` all exited 0 with no warnings or errors; both node and web typechecks passed. Formatting scope was inspected first, and vendor/generated artifacts and historical tests were preserved. Runtime acceptance remains pending; no automated tests, builds, app launches, or runtime verification were performed. Release remains NO-GO.

## User manual guide

1. Quit the running app normally and launch the updated source from the repository with `npm run dev`. If the existing unfinished setup appears, click **Continue to writing**. Expected: the same project opens in Write without the reported storage-denied warning; existing writing is present and editable under its current access.
2. Close normally and reopen. Expected: successful setup has been cleared, the project remains available, and reopening does not create a duplicate project or return to unfinished setup.
3. If another unfinished setup naturally offers **Open for reading**, use it. Expected: that same project opens without switching the free writing designation. A naturally retained completed record's **Open project and finish setup** should likewise reopen the same project and clear setup.

Do not reset storage or discard the retained setup to exercise this fix. Record only observed cases; optional recovery cases remain unverified if unavailable.
