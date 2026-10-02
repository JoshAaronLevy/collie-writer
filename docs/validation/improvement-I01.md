# Stage I01 completion record

October 1, 2026 — **implementation complete — awaiting user testing (document review for this specification stage).** User acceptance is pending. No application behavior is delivered or claimed by I01.

## Scope and review basis

Josh explicitly requested a thorough review of `app-improvement-plan.md` followed by I01. All fifteen briefs, the confirmed decisions, shared data/AI/CSS rules, and stage handoff policy were read. The stage is expressly documentation/specification work; I02 starts application changes. Git began clean. No unrelated working-tree changes were present to alter.

Read source/guidance included `AGENTS.md`; MVP product, capability, data/process, and later-AI contracts; Stage 18/19 decisions and implementation records; release-candidate gates; D3/D4; working schema 9; package configuration; `App.tsx`, `Projects.tsx`, `RichDraft.tsx`, `SettingsPanel.tsx`, root CSS, templates, shared project commands, capability classification, and main security/window/project-IPC boundaries. The review was ordinary source/document inspection, not runtime verification.

Official OpenAI, Anthropic, Grok, Google, and Mantine documentation was read for dated feasibility and styling evidence. The OpenAI Docs skill was used for the OpenAI documentation portion. Provider pages are cited beside the findings in the provider record; no provider permission or account state was inferred from an existing subscription.

## Delivered artifacts

| Path | Delivered result |
| --- | --- |
| [Experience specification](../design/app-experience.md) | Confirmed product baseline, seven category mappings/copy, semantic visual tokens, wide/narrow annotated screens S01–S09, focus/actions/states, and first-run/returning/offline/read-only/recovery journeys |
| [Architecture decision](../decisions/improvement-01-experience.md) | Full-plan findings, typed navigation, persistent session/draft ownership, proposed module responsibilities, complete capability relocation, Mantine/CSS/CSP handoff, bounded Study critique scope |
| [Provider eligibility](../ai/provider-eligibility.md) | Dated runtime/auth/permission/funding matrix, conditional OpenAI route, credential/content/packaging requirements, exact blockers and next-step ownership |
| [Manual review guide](../manual-testing/improvement-I01.md) | Ordered document actions and expected findings; no nonexistent UI, account action, or launch required |
| [Improvement plan](../../app-improvement-plan.md) | I01 status and artifact links, review disposition, provider gate linkage, and I12 clarification separating offline conversation organization from inference eligibility |
| [Repository guidance](../../AGENTS.md) | I01 checkpoint linking stage artifacts and preserving stage scope |
| [Manual-guide index](../manual-testing/README.md) | Improvement-stage review entry, separate from MVP numbering |
| This record | Completion evidence, unchanged formats, pending acceptance and external gates |

## Decisions and practical consequences

- Navigation must not unmount the only draft owner. Preserve editor undo/composition/selection, exact retries, manuscript cadence, source/note flushes, and explicit-save question/claim/transcription blockers. File/export/access/close/update handling stays above routed screens.
- Warm editorial Mantine presentation and semantic scoped CSS are settled. I02 owns actual dependencies, token mapping, CSP integration and user-visible controls. I01 provides design inputs without installing anything.
- Title/byline/description/category changes belong to I04's full migration and export capture contract. Setup belongs to I05. Study critique is a primary selection and empty outline only.
- A chapter-named text section is not a chapter container. The later proofreading scope must reflect actual outline structure. Existing templates and manuscripts are not changed by this decision.
- Local conversation rename/archive and Save as note require editing rights, not a connected provider. Sending a new request additionally requires session/capability/funding authorization. This resolves the prior I12 wording without expanding feature scope.
- Sign in with ChatGPT plus Codex app-server is the documented conditional OpenAI route. The preferred SDK can be used only if support for the approved authentication route is established. Commercial participation and authoritative included-only execution remain unresolved. The provider record does not enable an adapter or reject Josh's reported prior experience.

## Formats, migrations, and execution

No production source, dependency, lockfile, packaging configuration, project, credential, or application preference was changed. No migration occurred. Baseline remains working SQL/minimum reader **9**, editor AST **1**, archive container **1**, compilation model **2**.

No tests, test code, fixtures, harnesses, checks, typecheck, lint, formatter, audit tool, build/package, app/server/browser launch, screenshot, benchmark, CI action, SDK probe, sign-in, inference, registration, correspondence, or publication was created or performed. Static Markdown wireframes are design artifacts, not screenshots or a testing UI.

## Pending evidence and stage boundaries

| Item | Status / consequence |
| --- | --- |
| I01 deliverables | Complete; all required specifications and handoff records delivered |
| User document review | Pending; no approval or requested correction supplied yet |
| Calmness/readability/accessibility/native outcomes | Unobserved; later implemented production screens require user-owned review |
| I02 | Specification prerequisite delivered; not implemented or started by this request |
| I10 OpenAI | Enablement blocked by A-OPENAI and F-OPENAI; runtime/distribution details remain stage-owned requirements |
| I14 second provider | Conditional/deferred; no provider independently qualified |
| Existing MVP commerce/value/signing/MAS/release | Unchanged; release candidate remains NO-GO |

The [provider gate register](../ai/provider-eligibility.md#exact-gate-register-and-next-steps) names missing evidence and responsible parties. No account action or external outreach is authorized by its next-step descriptions. Completing I01 is not completion of the AI milestone.

## User-reported results

None supplied for I01. Record dated feedback here after Josh's document review, distinguishing accepted design, requested revisions, and unresolved provider facts. Existing acceptance of Mantine/CSS/product direction is retained; it is not evidence that these new detailed screens have been reviewed.

Use the [manual review guide](../manual-testing/improvement-I01.md), then stop for results. Do not advance automatically to I02.
