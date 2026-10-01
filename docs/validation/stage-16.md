# Stage 16 completion record

September 30, 2026 — **implementation complete — awaiting user testing**. Requested scope: immutable selected-order compilation, preflight and report, standard Letter/A4 presets, editable DOCX and protected native destination workflow. Starting Git state was clean. No commit was created; no platform or reader output was produced by the assistant.

Implementation paths:

- Compilation/rendering: `src/domain/compilation/model.ts`, `src/worker/exports/prepare.ts`, `jobs.ts`, `docx.ts`, `src/domain/projects/export-path.ts`, `src/worker/projects/repository.ts`.
- Contracts/IPC/UI: `src/shared/exports.ts`, `projects.ts`, `src/main/projects-ipc.ts`, `src/preload/index.ts`, `src/worker/index.ts`, `src/renderer/src/features/projects/DocxExportPanel.tsx`, `Projects.tsx`.
- Documentation: plan, AGENTS, [decision](../decisions/stage-16-docx-compilation.md), [manual guide](../manual-testing/stage-16.md), D3 compilation checkpoint.

Compile model version 1→2 adds source-map entries and optional derived outline headings. Editor AST 1, working SQL 8, archive container 1 and minimum reader 8 are unchanged; no migration or new dependency is introduced. Selected sections, source metadata, pinned style/locale bytes and verified image buffers are captured through the repository boundary. The same model and shared note numbering serve the DOCX adapter; the output job is independent of the project destination. The local report retains captured revision, counts, issues and loss list. The worker keeps previous DOCX files and uncertain candidates, and publishes through a same-directory no-replace path after reading the generated container.

No test code, fixtures, golden corpus or verification automation was added. No tests, typecheck, lint, formatting/audit checks, build/package checks, app/server/browser launches, screenshots, benchmark or assistant-owned manual operation was performed. Source/Git inspection does not establish passing behavior. All Stage 16 acceptance boxes remain unchecked.

**Pending user evidence:** whole/selected manuscript fidelity, reference numbering after reorder, note and native document structures in Word/LibreOffice, Letter/A4 layout, link/image alt behavior, responsiveness while writing, cancellation and replacement safety on macOS/Windows, report accuracy and interruption recovery. Actual viewer versions, artifact counts and platform results are not known. Stop for Josh's feedback before Stage 17.
