# IU01 user guide

**Implementation complete — awaiting user testing.** This stage implements automatic preparation behind the interface. The old Import screens remain until IU02–IU03; IU01 does not make the complete simplified flow available yet. Do not repeat the old per-message review process to assess this stage.

Stage IU01 complete. As a user:

1. Launch the updated development app using the repository's normal `npm run dev` command and open a disposable copy of an existing project. The project should open normally, with its writing and existing content available. Keep the original copy untouched while evaluating the format migration.
2. If that copy already contains imported conversations, sources or notes, open them in the ordinary AI conversation pane, Research and Notes. Their saved content and supported origin links should remain available; opening the project should not start analysis or import new content.
3. Review the automatic-policy section of [the plan](../../import-ux-implementation-plan.md#automatic-import-policy). The expected next-stage behavior is supported findings selected automatically, concise totals, and one Accept. This stage introduces no new buttons or visible workflow to exercise.

Report any issue opening the copy or reading previously imported content. These observations do not establish extraction quality or the final two-modal UX; those become directly assessable after IU02–IU03. Stop here pending results or an explicit next-stage request.
