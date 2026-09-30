Stage 5 complete. As a user:

1. For this migration handoff, I use only disposable Stage 4 projects. With Collie Writer fully quit, I copy the entire working-data folder shown by Stage 4 to a separate unsynced backup location, keeping databases and sidecars together. I have an independent copy before opening the updated app; I do not rename or remove individual database/journal files.
2. With Node 24.21.0/npm 11.19.0 selected, I run `npm ci`, then `npm run dev`. The local-project screen and SQLite readiness should appear. These setup/launch actions are mine; the assistant has not run them.
3. I select each disposable Stage 4 project. Its protected draft and project identity should remain intact after the background copy migration. A migration/storage error should leave the project files retained and show an error rather than an empty replacement project. If that occurs, I stop and report the bounded message without modifying the originals.
4. I edit one draft, click **Protect locally**, switch to the other project, then quit and reopen. Each should retain its own latest acknowledged text, and local protection should still say that no project-file destination has been selected.
5. I create a new blank project, protect disposable text and reopen it. It should work alongside the migrated projects without assigning a file destination.
6. I add unprotected writing and attempt to quit. **Keep window open** should preserve it, and normal selection/system Copy should remain available. Cancelling close should not lose the text.
7. I open **Help → Third-party licenses → Show bundled licenses**. The existing citation/source notices should remain, with the new archive/XML dependency notices available alongside them.

There is no archive Save/Open, progress or cancellation control in Stage 5's UI; those are Stage 6. The steps above cover the visible migration/storage integration only. They do not establish archive correctness or performance. No assistant tests/checks/build/launch, generated project/archive, migration execution or native acceptance is claimed. Please report OS/architecture, launch mode and observed outcomes without sharing private writing or paths. Stop for feedback before Stage 6.

## Deferred archive acceptance — after the real controls exist

These are future user-owned scenarios, not current executable steps or permission for assistant testing:

1. When I use Stage 6 Save on disposable writing and reopen a copy in a clean profile/computer, its captured content should return without relying on previous app caches. Repeat with managed images/attachments once their owning UI ships.
2. When I edit during a long Save, the saved file should contain its identified captured head; later edits should remain separately pending/protected. A subsequent explicit Save must include its requested head or a descendant.
3. When I cancel through the real Save controls, the prior saved file and working draft should remain. A failed destination transfer should retain the completed local candidate for the product's recovery/retry flow.
4. When I save existing disposable libraries near 1, 5 and 10 GiB, progress and cancellation should remain usable. I can report elapsed time, observed memory/free-space changes, machine/RAM/OS/filesystem/app build, actual library size and any ordinary failure. Targets are 15/60/120 seconds on the plan's local-SSD baseline and at most 256 MiB added streaming memory; all remain unmeasured. I do not generate datasets, fill a disk or run benchmark scripts.

Hostile archives, interruption timing, exact lease/replay behavior and migration-failure preservation remain unverified without safe real evidence. Do not fabricate malformed archives, edit databases, invoke internal APIs in developer tools or add test-only controls. Native build/backup proof from D2 also remains pending.
