Stage 2 complete. As a user:

1. When I use Node 24.21.0 and npm 11.19.0 to install dependencies with `npm ci`, prepare an unsigned local package with `npm run build:unpack` on an available macOS arm64, macOS Intel or Windows x64 computer, and open it through Finder or Explorer, the welcome screen appears and the **SQLite engine** panel changes from “Starting” to “Loaded,” showing SQLite, Node and Node-API versions. It does not offer project creation or saving yet.
2. When I inspect the unpacked application's `Contents/Resources/native` folder on macOS or `resources/native` folder on Windows, it contains one `better_sqlite3.node` file for that package target.
3. When I open that same package with my network connection unavailable, the SQLite engine still loads and the existing local shell remains usable.
4. When I quit Collie Writer and look in Activity Monitor or Task Manager, its owned storage/helper process has exited. Reopening the app starts the engine again.
5. If the SQLite panel says “Could not load,” I can still read the shell, and reopening is offered as the recovery action; no project save is claimed. I can report the OS, architecture and displayed status so the unresolved target can be recorded.

The shell has no real project database path yet, so it cannot demonstrate FTS results, rollback, backup/reopen or durable project recovery. Those requirements remain pending for a later user-visible project workflow. Please report only the target platforms and results you actually observed. Signed release behavior belongs to Stage 21.
