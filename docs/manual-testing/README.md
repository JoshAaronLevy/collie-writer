# Manual stage guides

The user performs all testing. The assistant writes plain-language guides only and stops for feedback. Do not add test scripts, code snippets that assert results, automated suites, fixture generators, test-only controls or browser automation here or elsewhere.

For a fully implemented stage, start its guide with `Stage X complete. As a user:` and a numbered action/expected-outcome list. A blocked or incomplete stage must say so instead. Include only implemented behavior and relevant user-owned setup steps. Implementation complete does not mean user acceptance or release gates passed; record those separately in the plan and stage record. If a feature cannot yet be observed, identify it as unverified instead of inventing a testing interface.

## App improvement stages

These use I-prefixed IDs, separate from MVP Stages 1–23. [I01 — experience and provider specifications](improvement-I01.md) is a document-review guide; it requires no app launch or provider account. Its [completion record](../validation/improvement-I01.md) tracks pending feedback.

[I02 — visual foundation](improvement-I02.md) covers the actual Mantine shell/Settings, appearance and accessibility preferences, keyboard/menu/dialog interaction, and a separate user-owned packaged-CSP observation. Its [completion record](../validation/improvement-I02.md) distinguishes delivered code from still-pending runtime acceptance.

[I03 — persistent session and navigation](improvement-I03.md) covers retained drafts, explicit-save guards, typed destinations, focus, global jobs and close/access behavior. Its [record](../validation/improvement-I03.md) contains no claimed runtime acceptance.

[I04 — project details and nonfiction templates](improvement-I04.md) covers the seven starting structures, details fields and guards, legacy copy migration, Save/duplicate/backup/restore, and frozen export properties/title-page choices. Its [record](../validation/improvement-I04.md) tracks implementation separately from user results.

[I05 — guided project creation](improvement-I05.md) covers first-run selection, resumable details/create/connection steps, optional author preference, explicit free editing choice, honest no-AI continuation and native first Save. Its [record](../validation/improvement-I05.md) keeps source implementation separate from still-pending user observations.

[I06 — returning library and project lifecycle](improvement-I06.md) covers safe last-section return, recent/active/archived views, contextual project/file actions, independent copies and recovery access. Its [record](../validation/improvement-I06.md) leaves native and user acceptance pending.

[I07 — focused writing workspace](improvement-I07.md) covers project/outline navigation, retained panes and focus mode, width/keyboard/narrow layouts, selection dialogs, citations/footnotes, images, history and distinct protection/file status. Its [record](../validation/improvement-I07.md) keeps runtime and user acceptance pending.

[I08 — research and source context](improvement-I08.md) covers focused lists/details, source usage in both directions including chapters and footnote citations, version/excerpt provenance, reversible evidence decisions, retained notes/annotations/forms and search/Back navigation. Its [record](../validation/improvement-I08.md) leaves runtime, native and user acceptance pending.

[I09 — complete local journey](improvement-I09.md) covers export, Save options, settings/help and the optional nonfiction sample. Its [record](../validation/improvement-I09.md) distinguishes implementation from pending user/native/output observations.

[I10 — provider foundation](improvement-I10.md) covers delivered internal code/document review and existing local UI continuity. Its [record](../validation/improvement-I10.md) distinguishes delivered independent engineering from incomplete funding/isolation methods, missing registration and packaged runtime, and pending native observations. I11/I12 own the real provider screens; there is no testing-only UI or probe.

[I11 — AI connections](improvement-I11.md) covers the actual third setup step, shared Settings/writing account state, unavailable reasons, local continuation and conditional later real browser/account actions. Its [record](../validation/improvement-I11.md) separates implemented UI from I10's unavailable access/funding/isolation/runtime and pending user observations.

- [I12 — durable conversation foundation](improvement-I12.md): implementation complete — awaiting user testing. Local conversation lifecycle, reviewed context, not-sent requests, transcript export and schema 11 copies; live provider observations remain conditional on I10 activation.

## App improvement I13

[Mechanics proofreading foundation](improvement-I13.md): exact scope/coverage, local unsent review history, portable copies, and conditional real findings, Ignore/Undo ignore, checkpointed Apply and editor reconciliation. Implementation complete — awaiting user testing; inference remains gated by I10. No assistant checks or launches occurred.

## App improvement I14

[Second-provider partial engineering](improvement-I14.md): document review and existing local UI continuity. Grok ACP transport code is delivered, but protected authentication, funding/isolation, account routing/UI and distribution are unfinished. There is no working Grok connection; see the [partial record](../validation/improvement-I14.md).
