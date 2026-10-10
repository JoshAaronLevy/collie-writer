# IM02 implementation and acceptance record

October 9, 2026. **Implementation complete — awaiting user testing.** Josh explicitly requested IM02 after IM01. No earlier runtime acceptance is inferred. See the [plan](../../import-implementation-plan.md), [implemented format](../formats/import-sessions-v1.md) and [manual guide](../manual-testing/import-IM02.md).

## Implemented

- Strict shared import contracts, a dedicated preload/main channel, exact project/workspace worker commands and edit/read capability classification. No renderer paths or generic filesystem/SQL interface.
- SQL/minimum reader 22 with four project-scoped table families, explicit current selectors, immutable revisions, canonical digests, selected-file manifests and intake-only coverage artifacts. Earlier DDL and document-shaped operation results stay frozen.
- Main's retained local write owner, explicit same-operation retry/outcome reconciliation, protection errors, close barrier and Save/replacement/access guards. Idle protected batches remain saveable/closeable.
- Trusted bounded original staging hook for IM03, managed immutable blobs, frozen descriptor comparison, volume admission, reserved retirement capacity and nondeleting discard semantics.
- Dedicated `import-session` operation results, strict portable graph/asset semantics, bounded artifact reads during acquisition/capture/extraction/copy/retention, full-row retention coverage and conservative import-bearing working-copy removal refusal.

Proposal/review foundations are reserved null references and an admitted intake-coverage kind. Future graph/proposal/result/accepted-receipt shapes are deliberately not admitted before their implementing stages. The native picker, retained renderer form, extraction, AI and accepted content remain IM03–IM12 work.

## Versions

| Contract                              | Current                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------- |
| SQL / minimum reader                  | 22 / 22; retained-copy migration from 21                                    |
| Import batch/revision/file/artifact   | 1; artifact kind `intake-v1` only                                           |
| Domain operation result               | Legacy exact shape unchanged; new `version: 2, kind: import-session` branch |
| Archive / editor                      | Unchanged 1 / 1                                                             |
| Conversation / live message / capture | Unchanged 2 / 1 / 5                                                         |
| Direct operation/binding / handoff    | Unchanged 6 / 1                                                             |

## Required code checks

Commands use the repository-pinned Node 24.21.0/npm 11.19.0 from `.tools/node-v24.21.0-darwin-arm64/bin`. The format/lint ignore scope was read before execution and preserves upstream resources, generated files and historical test infrastructure.

| Command             | Outcome                                                                      |
| ------------------- | ---------------------------------------------------------------------------- |
| `npm run format`    | Passed, exit 0                                                               |
| `npm run lint`      | Passed, exit 0, no errors or warnings; initial unused bindings corrected     |
| `npm run typecheck` | Passed, exit 0, both node and web targets; initial narrowing error corrected |

No automated tests, harnesses, fixtures, verification scripts, builds, app/server/browser launches, screenshots, benchmarks or provider requests were added or run. Ordinary source/Git inspection is not a passed runtime test. Only Collie Writer files were used for IM02; the reference application's corpus was not imported or transmitted.

## Pending user observations

Migration and existing writing/chat/research/notes/Save/reopen behavior require the [manual walkthrough](../manual-testing/import-IM02.md). Staged-file persistence, selection editing/discard, scope changes, lost acknowledgments, access changes, native failures and staged-project copy/restore require the public IM03 flow before direct user observation. No testing hook was added to expose foundation commands.

No live import analysis, accepted graph, continuation, visual/accessibility or release acceptance is claimed. IM03–IM12 remain unstarted. Installed/commercial/funding/packaging gates remain unchanged and release stays NO-GO. Stop after the user guide.
