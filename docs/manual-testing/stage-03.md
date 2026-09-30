Stage 3 complete. As a user:

1. With Node 24.21.0/npm 11.19.0 selected, run `npm ci` and `npm run dev`. The development shell should open and display the citeproc-js attribution beneath the SQLite panel.
2. Open **Help → Third-party licenses**, then choose **Show bundled licenses**. The dialog should identify Frank Bennett and CPAL; Finder/File Explorer should reveal `NOTICE.txt`, alongside the processor source and the editor, export, font and CSL notices.
3. After installing dependencies, disconnect from the internet and reopen the app with `npm run dev`. The shell, visible attribution and local license dialog should still be available.
4. If checking an installed/unpacked build, create it with `npm run build:unpack` and open the app from `dist`. The same attribution/menu should appear, and **Show bundled licenses** should reveal files inside that app's bundled resources, rather than requiring this checkout.

Implementation is complete; acceptance is pending. Stage 3 adds internal editor/citation/export adapters, not their production screens. There is currently no writing or export action to click. Editor behavior, citation correctness, DOCX/PDF fidelity, native packaging and fonts remain unverified. The [future fidelity scenarios](stage-03-pending-fidelity.md) are explicitly deferred until the owning product screens exist; do not run developer-console probes or create test-only controls to exercise these adapters.
