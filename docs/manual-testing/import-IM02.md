# IM02 manual guide

**Implementation complete — awaiting user testing.** IM02 installs local staging/storage foundations and SQL/minimum reader 22. The project Import button, multi-file picker and dialogs arrive in IM03. No import analysis, new accepted content or account request is implemented by this stage.

Use a disposable project copy, using **Duplicate project** or **Open independent copy** to give it its own identity. Keep an untouched `.collie` backup before opening older data with this version; merely copying the file in Finder does not change its project identity. A file saved with schema 22 requires this version or a newer compatible reader. Do not remove working folders, migration originals or recovery files.

Stage IM02 complete. As a user:

1. Close the older development process normally, then launch this checkout using your usual development setup and `npm run dev`. Expect Collie to open normally without a new import dialog or import-analysis request. Source edits cannot update an already-running main/worker process.
2. Open a disposable copy of an existing project with writing, a saved conversation and Research/Notes if available. Expect its existing titles, text and relationships to remain available after migration; no empty import conversations, manuscript items or sources should appear.
3. Make a small writing or note edit in that copy, then use the ordinary Save action. Expect Save to complete through its existing controls and preserve the edit. No import confirmation or extra account connection should be required.
4. Close normally and reopen the saved copy. Expect the same project content and edit, with normal chat history, Research and Notes navigation. Reopening should not resend any AI request.
5. Create a disposable new project, add a short line of writing, Save it and reopen it. Expect the ordinary project creation and Save/reopen flow to work with the current format.
6. Read the [implemented foundation contract](../formats/import-sessions-v1.md) and [plan](../../import-implementation-plan.md). Expect IM02 complete and IM03–IM12 unstarted. The contract distinguishes file intake coverage from analyzed or accepted content, preserves discarded originals and describes exact receipt recovery.

Staged-original persistence, retained selection after dialog dismissal, expired-picker recovery and staged-project copy behavior cannot yet be exercised through a public import UI. Their direct user walkthrough starts in IM03; no testing-only UI, script or developer-console invocation is needed. This guide does not establish those later observations or live-provider acceptance.

Report the action and visible error if a step fails; avoid sharing private manuscript/chat text or credentials. Stop here before another stage.
