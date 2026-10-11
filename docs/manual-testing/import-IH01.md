# IH01 — User-owned compatibility walkthrough

October 10, 2026. **Implementation complete — awaiting user testing.** This is a backend foundation. Ordinary Submit still uses the existing AI route; zero-request local import arrives in IH02. Do not spend allowance rerunning the problematic large import to assess IH01.

Use disposable copies of existing projects, leaving originals intact. If a project contains no previously accepted imported content, skip the corresponding content check; staged originals are not accepted content.

1. Quit the running development app and start the updated checkout using your usual development launch (`npm run dev` with the pinned toolchain). Open a disposable existing project. Expect its title, writing and project contents to remain available without a migration error.
2. In a copy containing earlier accepted imports, open Chats, Research and Notes as applicable. Expect the same original conversation text, source origins and notes; opening them must not start ChatGPT analysis or create duplicate content.
3. Make an ordinary small edit in that disposable project, Save, close and reopen it. Expect the edit and earlier imported content to remain. Save must not accept staged findings or trigger AI requests.
4. If you already have a project with an unfinished import or saved summary, open Import. Expect the retained setup/findings or existing recovery state, with no automatic send or acceptance. Cancel/dismiss should return normally. No hidden worker commands are needed.

Report any open/Save/reopen error with its exact text and whether the copy had accepted content or only staged material. New local evidence creation, local Accept, migration persistence and native behavior have not been exercised by the assistant; local end-to-end UI acceptance belongs to IH02.
