# Collie Writer app improvement plan

## Confirmed decisions

**Recorded October 1, 2026; status updated October 2, 2026.** Josh selected Mantine, required semantic class names and properly scoped CSS, added Study critique as a primary project type, and accepted the remaining recommendations from the initial plan. These are the implementation baseline; do not reopen them as unanswered questions. I01–I11 were subsequently explicitly requested. I01 specifications and I02–I09 implementation are complete — awaiting user testing. I10 now delivers its independent local provider foundation — awaiting user testing; the full stage remains **partial**. Authentic registration, included-only funding enforcement, complete runtime isolation and packaged delivery remain pending. Live access and commercial activation are tracked separately. No earlier stage needs reimplementation. I11 connection/account UI is implementation complete — awaiting user testing. I12 and later stages have not begun; no runtime acceptance is implied.

| Area | Confirmed direction |
| --- | --- |
| Visual identity | Warm editorial: warm off-white surroundings, paper surfaces, graphite text, restrained deep green accents, generous spacing, contemporary sans-serif controls, and readable manuscript serif typography. |
| UI library | **Mantine** is the primary component library. Build the interface with its component suite and theme system, with Collie-specific styling. Retain Electron, React, TypeScript, and electron-vite; do not introduce Tailwind or a competing general-purpose component system. |
| CSS conventions | App-authored classes describe the component or element's purpose, such as `project-selection-container` and `project-type-card`. Put styles in the smallest appropriate component, feature, or shared-component stylesheet. Do not use utility-class stacks or accumulate feature styling in root CSS. The standing rules are in [AGENTS.md](AGENTS.md#ui-library-and-semantic-css--standing-instruction). |
| Icons | A small, locally bundled set of Lucide React icons, paired with clear labels where helpful. |
| Themes and accessibility | Include polished light and dark themes plus a system preference. Retain high contrast, interface zoom, reduced motion, and keyboard access. |
| Primary project types | **Nonfiction book, Academic essay, Article, Report, and Study critique.** Research paper and Blank nonfiction project remain secondary starting points. No fiction categories. |
| Starter structure | Short useful outlines with empty writing sections. Do not populate personal projects with example prose or extensive instructions. Academic essays and empirical research papers have distinct starting structures; existing projects keep their outlines. Generate references from actual citations rather than seeding a competing manual bibliography. |
| Project details | Required title and one editable author/byline field; optional multiline description. Support pen names and a collaboratively written byline. An opt-in local preference remembers the author for new projects; separately managed coauthors are outside this increment. |
| Exported metadata | Include author in document properties by default; a visible title page is a separate export choice. Keep description out of manuscript exports and AI requests unless explicitly selected. Never derive the byline from purchase or AI identities. |
| Returning launch | Safely reopen the last project and section; otherwise show the library. A new installation starts at project selection. Keep Projects readily accessible and New project consistently opens the guided flow. |
| AI onboarding | Show the connection step after project details, with a clear **Continue without AI** action. Reuse and summarize an existing eligible connection instead of requiring login for every project. Offline use and sign-in failures never block local writing. |
| Provider sequence | Prefer the Codex SDK with the user's own subscription and default-browser sign-in, behind a multiple-provider adapter boundary. A supported local app-server/runtime is acceptable when needed for authentication/execution and commercially permitted. Grok Build and Claude are additional candidates, subject to the same permission and included-only funding gates; Google's consumer route is deferred on current evidence. |
| Delivery sequence | Complete the local redesign independently of unresolved AI dependencies, then add eligible AI capabilities. Neither the first nor a second provider blocks implementation of the local experience. Existing release gates and separate publication authorization still apply. |
| AI feature scope | Include project conversations, followed by human-reviewed proofreading of a selected passage or explicitly selected chapter. Whole-book rewriting, autonomous research, and broader argument/structural analysis remain deferred. |
| Conversation placement | An optional right-side panel next to writing, expandable for longer discussions. Open it on request; show one secondary-panel mode at a time. |
| Conversation ownership | Include local conversations in `.collie` files, backups, and independent copies by default. Keep credentials and provider session handles device-local. Transcripts remain readable/exportable when disconnected. |
| AI context and switching | Users select the passages, sections, notes, or source excerpts to send, with prior messages included in context disclosure. Never automatically send an entire project. A provider change starts a fresh thread; sharing selected earlier context is an explicit action. |
| Project-type behavior | Type changes starter structure, empty-state wording, and suggested workflow, while retaining the same nonfiction writing/research/citation/export capabilities. It does not force citation style or rewrite existing content. The specialized Study critique workflow is reserved for later design. |
| Tutorial | A separate optional synthetic nonfiction example, reachable through Help or Explore an example, plus a dismissible three-point orientation. Preserve the trusted sample slot and reset/recovery protections; no blocking tour or automatic popovers. |
| AI access tiers | Conversations and proofreading are available in the free designated editable project and paid editable projects, always requiring the user's eligible provider account. Paid Collie retains unrestricted editing across projects. Stored AI content remains readable/exportable after access changes; applying suggestions requires current editing rights. Lifetime ownership includes future updates to the purchased nonfiction edition. |

### Study critique: primary category, bounded scope

**Study critique** is a first-class project-type card alongside the other four primary options. Its purpose is to help a writer build an evidence-based argument against a study, article, publication, or body of research. The intended starting point is either adding the study as a local file, such as a PDF, or providing a link to the study/publication/research; that material becomes the focus of the writer's critique and supporting research.

For this improvement plan, include the category, its clear description, and its basic nonfiction starting point in project metadata/templates and the selection screen. Keep the source-based intent visible in the design brief. The dedicated PDF/link intake, central-study relationship, and specialized critique workflow are **not being designed in detail or implemented by this planning update** and are not added as a new feature stage. Writers retain access to the existing general source and writing tools. Do not imply automatic URL retrieval, web research, refutation, or AI analysis has been implemented simply because the category is selectable. Any later specialized workflow needs its own scoped plan.

## Purpose and status

**Prepared October 1 and updated October 2, 2026. Status: I01 specifications and I02–I09 implementation complete — awaiting user testing; I10 local provider foundation delivered, full stage partial and live access/commercial activation pending; I11 connection UI implementation complete — awaiting user testing; I12–I15 implementation not started.** All 15 stage briefs retain model/effort recommendations and execution contracts. I01's [experience specification](docs/design/app-experience.md), [architecture decision](docs/decisions/improvement-01-experience.md), [provider evidence](docs/ai/provider-eligibility.md), [completion record](docs/validation/improvement-I01.md), and [manual review guide](docs/manual-testing/improvement-I01.md) are delivered. I02's [implementation record](docs/validation/improvement-I02.md) and [manual guide](docs/manual-testing/improvement-I02.md) document the delivered theme, shared controls and startup preferences; runtime, visual and accessibility acceptance remains pending. I03's [session/navigation record](docs/validation/improvement-I03.md), I04's [project-details record](docs/validation/improvement-I04.md), I05's [guided-setup record](docs/validation/improvement-I05.md), I06's [returning-library record](docs/validation/improvement-I06.md), I07's [writing-workspace record](docs/validation/improvement-I07.md), I08's [research-workspace record](docs/validation/improvement-I08.md), and I09's [local-journey record](docs/validation/improvement-I09.md) document delivered code and pending manual acceptance. I04 advances working SQL/minimum reader to 10 and frozen compilation to 3; AST/archive remain 1. I05–I09 change no project format. I09 adds a device-local orientation dismissal and narrowly scoped native Help actions; no AI route is enabled. I07’s accidentally reverted plan status is reconciled from its delivered record; Josh’s additional I08 source-usage instruction remains unchanged. I01's provider evidence remains the baseline; the revised I10 owns engineering now and later access/activation work without reopening I01–I09. The existing local-feature commercial matrix and AI access assignments remain unchanged. No provider account action, inference, purchase, or publication occurred in I09.

The goal is to make Collie Writer feel considered from its first screen: modern, calm, professional, and inviting. A new writer should understand the next action immediately, create a nonfiction project through a short guided flow, optionally connect their own eligible AI account, and arrive in a workspace organized around writing and research.

The present implementation contains substantial functionality, but its interface exposes many implementation stages at once. This effort changes composition, navigation, visual hierarchy, and introductory flow while preserving the local data and recovery foundations. AI connection, conversations, and proofreading are planned new capabilities with their own dependencies. Study critique is included as a primary project type; its specialized workflow remains separately scoped.

This plan supplements [mvp-implementation-plan.md](mvp-implementation-plan.md), which remains authoritative for existing product and data contracts. Improvement stages use **I01–I15**, separate from MVP Stages 1–23. The decisions above are settled. Begin only an explicitly requested stage; I01 documents the experience and resolves technical/provider evidence without asking Josh to choose the library or product direction again. Do not renumber or silently mark old MVP stages accepted.

### Review basis and limits

The review used repository guidance, the MVP plan, existing stage/decision records, package configuration, renderer source and CSS, editor code, project creation/metadata contracts, storage/archive consumers, export code, and Electron security boundaries. Git was clean at the beginning of the initial planning task; this revision updates the existing plan and repository guidance. No app, development server, browser, screenshot workflow, build, automated check, or test was run.

Observations about current screens below come from source structure and Josh's reported experience. They are not claims of runtime, visual, native, or accessibility acceptance. Existing implementation remains awaiting user testing; the commerce, signing, MAS, and release-readiness gates remain unresolved as documented in the MVP plan.

**I01 review:** all stage briefs and shared contracts were read alongside current source, the MVP product/AI roadmap, Stage 18/19 decisions, and release gates. The [decision record](docs/decisions/improvement-01-experience.md#full-plan-review-and-resolutions) records the resulting handoffs: persistent draft ownership before navigation, complete metadata migrations before onboarding, genuine section/chapter semantics, CSP-specific Mantine integration, and local conversation organization without a live provider dependency. This was source/document review only. No tests, checks, launches, or screenshots were performed.

## What the pre-improvement implementation explains

This table records the I01 source baseline. I02 has since introduced the theme, root preferences, scoped styles and shell/Settings controls; see its [implementation record](docs/validation/improvement-I02.md). The broader navigation and workflow findings still guide later stages.

| I01 source baseline | Why it affects the experience | Direction of change |
| --- | --- | --- |
| [App.tsx](src/renderer/src/App.tsx) mounts projects, settings, citation attribution, and SQLite engine information within the same main page. Header navigation scrolls to page anchors. | App administration and writing have similar prominence. Navigation feels like moving around a long form. | Separate setup, library, workspace, and settings; retain required attribution without making diagnostics part of the opening task. |
| [Projects.tsx](src/renderer/src/features/projects/Projects.tsx) renders tutorial/access controls, data locations, project actions, editor, citations, exports, imports, notes, sources, evidence, search, history, file operations, and recovery in one surface. | A person sees the breadth of the application before understanding its basic workflow. Many unrelated decisions compete for attention. | Organize around user tasks; disclose advanced actions in appropriate destinations. |
| [main.css](src/renderer/src/assets/main.css) limits the entire main region to 760px. A source-inspector split is nested inside that region. Many panels share nearly identical borders, fills, and heading weight. | Desktop space is underused while controls still feel crowded. Similar treatments make importance harder to perceive. | Give the workspace a full-window layout, constrain only reading/writing measure, and establish hierarchy with spacing and surface treatment. |
| [RichDraft.tsx](src/renderer/src/editor/RichDraft.tsx) exposes a large formatting/insert toolbar, table controls, and find/replace. Some link/image actions use browser prompts. | Specialized editing tools take space even when irrelevant. Prompts do not share a polished interaction language. | Keep common formatting visible; group insertion and contextual controls; use focused app dialogs. Native file pickers remain native. |
| [templates.ts](src/domain/projects/templates.ts) defines Blank, Book, Article, Research paper, and Report. [CreateInput](src/shared/projects.ts) contains only an operation ID and template. | There is no guided category/details flow. The current scientific paper template is not an academic essay template. | Introduce explicit nonfiction presentation, real essay and study-critique starting points, and durable metadata. |
| [repository.ts](src/worker/projects/repository.ts) creates an “Untitled project”; the portable project row has a title but no project author or description. | Adding fields only in React would lose them or leave them inconsistent across copies and files. | Extend shared contracts, transactions, migration, portable reads, and every affected consumer together. |
| [docx.ts](src/worker/exports/docx.ts) uses Collie Writer as creator and a captured revision as description. [Compilation model 2](src/domain/compilation/model.ts) has no project metadata. | The new author field needs an explicit export policy and frozen metadata handling. | Capture export metadata with the manuscript revision; do not read a later mutable project title/byline during export. |
| Draft flushing, retries, timers, entitlement transitions, file jobs, and close handling live largely in `Projects.tsx`. Source/note forms register flush callbacks; research/transcription drafts can block a transition. | Simply unmounting panels to create tabs can lose edits or interrupt existing safeguards. | Extract persistent session/draft ownership before replacing navigation. |
| [SettingsPanel.tsx](src/renderer/src/features/settings/SettingsPanel.tsx) applies appearance preferences from its mount effects. | Hiding Settings behind navigation could accidentally stop startup preferences from applying. | Move preference application to the persistent application shell. |
| [package.json](package.json) has no AI-provider SDK; current access panels concern Collie purchase access. [security.ts](src/main/security.ts) and [windows.ts](src/main/windows.ts) restrict renderer networking and navigation. | AI is not an existing feature waiting for a login button. Direct browser SDK calls would violate the current architecture. | Add approved provider execution behind a narrow main-process boundary, separate from Collie access. |

Useful prerequisites include [D3 editor/compilation](docs/decisions/D3-editor-and-compilation.md), [D4 citations/licenses](docs/decisions/D4-citations-and-licenses.md), [Stage 7 lifecycle](docs/decisions/stage-07-recovery-and-lifecycle.md), [Stage 18 capabilities](docs/decisions/stage-18-capabilities-and-offline-access.md), [Stage 19 onboarding/privacy](docs/decisions/stage-19-onboarding-accessibility-privacy.md), and [working schema 9](docs/formats/working-project-v9.md).

## Intended experience

### First launch and new projects

1. **Choose a project type.** A centered welcome screen asks “What are you working on?” Five generously spaced cards—Nonfiction book, Academic essay, Article, Report, and Study critique—use a restrained icon, title, and one short description. Research paper and Blank nonfiction project sit under More starting points. Arrange the five primary cards responsively without squeezing them into one row. The whole card is a keyboard-accessible selection target. Selection does not unexpectedly advance; a clear Continue action does. Open existing project and the optional example are secondary actions.
2. **Add project details.** Show the selected type, title, author, and optional description textarea. Mark required fields plainly, support Unicode/pen names, and place validation beside the field. Back preserves entries. Before submission these are setup draft values; pressing Create project commits one local project through the existing idempotent boundary.
3. **Connect an AI account, if desired.** Show only providers eligible in this build. Explain whose account is used and what content a later AI request sends. The browser handles supported authentication. Show connection progress, cancellation, retry, and a clear path to continue locally. An existing eligible connection is summarized rather than restarted.
4. **Begin writing.** Open the first writing section. Make Write, Research, and the AI entry point discoverable, while keeping the editor dominant. Do not insert tutorial text into a personal manuscript or automatically send its title, description, or draft to an AI service.

Normal storage initialization should remain unobtrusive. If the app cannot establish a safe device-local working folder, show a short actionable setup interruption explaining the need. Do not silently place SQLite in a synchronized folder or pretend creation succeeded. A new project still has **no selected file destination**; the first Save opens the native picker later.

Creation and authentication are independent operations. If sign-in fails or the app closes after creation, the project remains recoverable and appears on the next launch. Repeated clicks and resumed setup must not create duplicates. Before creation, cancelling setup discards only the uncommitted wizard draft; after creation, leaving setup retains the project. Persist any resumable wizard state locally, without credentials or a fake project identity.

### Daily workspace

Agreed wide-window hierarchy; exact dimensions will be refined during implementation:

```text
Projects / Project title       Save state       Search   Save   Export
---------------------------------------------------------------------
Write   Research                         AI / Notes / Source panel
---------------------------------------------------------------------
Outline          Section title and compact toolbar      Optional panel
                 Manuscript                             One mode at a time
                 Comfortable writing width              Resizable/closable
---------------------------------------------------------------------
Word count / section status          Contextual operation progress
```

The diagram describes hierarchy, not a requirement to show every named control simultaneously. Settings and Help belong in stable app navigation. Project details, history, backup, duplicate, archive, and move live in a labeled project menu. Search can open a focused results view and return the writer to the exact section/source/note.

At narrower widths or high zoom, preserve one usable primary content area and make outline/secondary panels drawers or alternate views. Do not shrink three panes until their controls become unusable. Maintain keyboard equivalents for resizing and outline movement. Focus mode hides secondary chrome with an obvious way to restore it.

### Where existing capabilities go

| Existing capability | Planned home |
| --- | --- |
| Create/open/recent projects | First-run setup and Projects library |
| Title, author, description, category | Setup, then Project details |
| Outline, sections, manuscript, inline annotations | Write; section details and contextual inspector |
| Sources, bibliography records, PDFs/text originals | Research → Sources; focused source inspector |
| Notes, labels, inbox | Research → Notes; optional writing-side notes |
| Research questions, claims, supporting/challenging evidence | Research → Questions & claims, connected to inspected excerpts |
| Citation/footnote insertion | Editor actions and contextual reference tools |
| Bibliography style/preview and compilation | Export; reference corrections link back to Sources |
| Import text/Markdown | Project/Write import action with existing preview/loss report |
| Project-wide search | Persistent Search action/shortcut |
| History, restore, rename, duplicate, archive | Project menu and focused history/library views |
| Save, Save As, Locate, Backup, Move | Save control/details and Project menu; preserve their distinct meanings |
| Retained candidates, interrupted operations, reset recovery | Settings → Data & recovery; urgent unresolved issues also surface contextually |
| Collie paid access, restore purchase | Settings → Collie access, separately labeled from AI connections |
| Provider accounts and models | Settings → AI connections, plus contextual active-provider indication |
| Zoom, contrast, motion, theme | Settings → Appearance & accessibility, applied at startup |
| Tutorial, licenses, runtime versions, support, updates | Help/About and appropriate Settings pages |

No feature is considered successfully relocated merely because its old panel is hidden. Its entry point, draft behavior, errors, keyboard path, and operation completion must be accounted for.

### Saving and errors in plain language

Keep a compact, truthful status close to the project title. Example wording: “Protecting changes…”, “Protected on this device”, “Project file saved”, “Save needs attention”. A status popover explains the separate local recovery and selected-file states, including when edits are newer than the saved file. Never reduce both states to an ambiguous “Saved”, or claim that OneDrive/another cloud service has uploaded the file.

Normal success should be quiet. A failed local commit, conflict, pending retry, or interrupted file job must remain visible and actionable across navigation. Provide Retry, Save As, Locate, or review actions only when applicable. Preserve the existing visible draft and exact pending operation. Recovery details can be progressively disclosed; failures cannot be buried in Settings or transient toasts.

## Design system and CSS ownership

The identity should come from proportion, typography, spacing, and consistency. Cards belong primarily in project selection/library views; the writing workspace should not become a grid of competing boxed panels.

| Token/element | Starting value | Intended effect |
| --- | --- | --- |
| App background | Warm neutral `#F5F4F0` | A quiet surround for the work |
| Paper/surface | `#FFFFFF` or near-white | Clear foreground without excessive shadows |
| Primary text | Graphite `#252D2B` | Comfortable contrast and a professional tone |
| Secondary text | Muted `#5D6964` | Supporting information remains readable |
| Primary accent | Deep green `#2F6757` | Consistent selection, focus, and primary actions |
| Selected surface | Pale green `#E8F0EA` | Visible state without loud color |
| Separators | Soft neutral `#D8DFD9` | Grouping without boxing every element |
| Shapes | Approximately 8px controls, 12px selection cards | Cohesion without a playful or inflated appearance |
| Spacing | A small shared scale based on 4/8px increments | Predictable density and breathing room |
| Typography | System sans for controls; existing licensed Source Serif family for prose | Distinguish tools from manuscript content |
| Motion | Short state transitions only; respect reduced motion | Clear feedback without distraction |

These colors and dimensions express the confirmed warm-editorial direction; refine exact values as needed without reopening the identity decision. They are not measured accessibility claims. Define separate light, dark, and high-contrast semantic tokens and support the system theme preference. Use visible focus, text/icon state cues in addition to color, appropriate contrast targets, and legible disabled/error states. Bundle fonts/icons locally with their notices; no remote font, analytics, or image service is needed.

Use Mantine components and theme defaults for buttons, form fields, textarea, dialogs, menus, tabs, tooltips, and other supported controls. Add focused Collie components for selection cards, save status, empty states, list rows, and panel headers where needed; do not rebuild a parallel general-purpose UI library. Specify default, hover, focus, selected, loading, disabled, invalid, and destructive states. Short field help and empty-state copy should explain user actions, not storage internals.

Preserve citeproc's required initial-session attribution and bundled source/notices. Its presentation may be integrated into a deliberate, readable attribution area after reviewing the existing license decision; moving all notices into a hidden About screen is not an acceptable shortcut.

### Mantine integration and semantic styles

Mantine is selected, not an option to compare again. Use its [Styles API](https://mantine.dev/styles/styles-api/) and [theme/provider configuration](https://mantine.dev/theming/mantine-provider/) to compose the agreed visual system. Keep package CSS, fonts, and icons bundled locally. Retain the initial plan's component-specific CSP work: resolve generated style elements, positioning, and theme initialization through supported configuration rather than broadly weakening the renderer policy. This is planned integration work, not a claim that packaged behavior has been accepted.

The [standing CSS instructions](AGENTS.md#ui-library-and-semantic-css--standing-instruction) apply throughout every stage:

- Name app-authored selectors by purpose: `project-selection-container`, `project-type-card`, `project-type-card-title`, `project-details-form`, and `workspace-outline`. A small number of meaningful state/modifier classes is acceptable; stacks such as `py-4 m2 flex-center` are not. Do not introduce Tailwind, atomic CSS, abbreviated layout/spacing utilities, or utility generators.
- Scope styles to their real owner. Project selection belongs beside its onboarding component, for example `features/onboarding/ProjectSelection.module.css`. Styles genuinely shared by several onboarding screens belong in an onboarding stylesheet. A reusable component's styles belong beside that component, such as `components/ui/ProjectTypeCard.module.css`, when its actual reuse warrants that location.
- Prefer CSS Modules with descriptive source selectors, or a feature stylesheet scoped beneath a semantic feature root. Module-generated suffixes and Mantine's own internal classes are library mechanics; the developer-authored names must remain readable and meaningful. Never target generated hashes or depend on private DOM structure.
- Share theme tokens globally, but keep feature selectors out of `assets/main.css`. Root CSS is for base resets, global tokens/font setup, and genuinely application-wide rules. Similar CSS in two places is not by itself a reason to create a global utility class; move a common component/style to its smallest real shared owner.
- Connect semantic classes through Mantine's supported component/slot styling APIs. Set app-wide component defaults in the theme. Avoid broad global `.mantine-*` overrides, routine inline style objects, or stacks of spacing/layout styling props as a substitute for scoped CSS. Functional component props, variants, theme tokens, and necessary runtime-calculated values remain appropriate.
- Move existing feature styles out of the monolithic stylesheet as the owning screens are redesigned. Preserve behavior and keep this migration inside each requested stage; the documentation change does not authorize a whole-app styling rewrite.

## AI feasibility and ownership boundaries

### Intended subscription sign-in experience

Josh's clarification is understood: the desired integration is the same product experience he has used in another application—press Connect, sign in to the user's Codex/ChatGPT subscription in the default browser, return to the app, and use AI through the Codex SDK without generating or copying an API key. His reported prior implementation establishes the intended experience; it is not necessary to access, copy, or depend on that other application's code.

Use `@openai/codex-sdk` as the preferred OpenAI execution adapter when its current supported runtime/authentication combination satisfies Collie's constraints. The SDK operates local Codex threads; it is distinct from an ordinary API-key client. The official [SDK documentation](https://learn.chatgpt.com/docs/codex-sdk) describes that embedding surface, and [Codex authentication](https://learn.chatgpt.com/docs/auth) documents browser-based ChatGPT subscription sign-in separately from API-key billing. This plan does not reject a coding-oriented runtime for writing tasks: conversation and proofreading usefulness will be assessed by Josh on the actual implemented experience.

The intended application flow is:

1. The writer selects **Connect Codex** (using the provider's permitted public branding) in setup or Settings. Collie starts the approved local sign-in operation; it never asks for an API key or provider password.
2. The supported provider authentication flow opens in the default browser. Collie shows a waiting screen with Cancel, Return to writing, and a safe retry path.
3. Completion reaches the main-process connection service through the supported callback/runtime event. Collie correlates the active attempt, reads authoritative account/session state, and separately establishes subscription/capability/funding eligibility. A browser success page alone is not the application's authentication receipt.
4. When ready, Collie returns the writer to their project and shows the connected provider. No manuscript content or sample inference is sent during sign-in.
5. For a conversation or proofreading action, Collie captures the explicitly selected context, authorizes the operation, and passes its prompt to the SDK/runtime. Included usage is subject to the provider's limits; there is no API-key, purchased-credit, or automatic paid fallback.
6. Logout, cancellation, expired access, or exhausted included allowance leave local writing and saved AI history available. New AI work requires an eligible connection; retry always remains a deliberate user action.

### Current provider evidence and implementation consequences

Official sources were revisited during I01 on October 1, 2026, with the OpenAI subset refreshed for I10 on October 2. The detailed [provider record](docs/ai/provider-eligibility.md) owns the dated evidence, conditional route selection, and exact open gates; refresh relevant documentation before implementing an adapter. Josh confirmed that commercial approval has not been obtained; the [owner guide](docs/ai/openai-approval-guide.md) supplies the application route and prepared questions. The existence of a runtime, a subscription, or browser OAuth is not sufficient evidence of all required commercial and funding rights.

| Candidate/route | Current evidence | Decision for Collie |
| --- | --- | --- |
| **Codex SDK + supported subscription authentication** | Codex provides an embeddable SDK and the browser sign-in experience above. However, the current [App Server auth section](https://learn.chatgpt.com/docs/app-server#auth-endpoints) explicitly excludes commercial/hosted services from its built-in auth route and points to Sign in with ChatGPT. | **Preferred SDK; route-specific gate.** Do not infer that a paid local app is exempt or bypass a restriction by invoking the same login through another wrapper. Establish the applicable supported commercial route; the SDK's execution role can remain. |
| **Sign in with ChatGPT + Codex runtime** | The [plan-usage overview](https://developers.openai.com/siwc/token-sharing-open-source) directs paid/remote applications to its interest process. A documented [Codex app-server integration](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server) uses the resulting authorized OAuth token. | Candidate way to preserve the requested browser UX and Codex execution. Record actual eligibility and included-only funding controls. Do not create accounts or submit an application as part of planning, and do not assume these credentials work unchanged with every SDK release. |
| **Claude Agent SDK** | The [SDK overview](https://code.claude.com/docs/en/agent-sdk/overview) requires approval for third-party subscription login. The [help article](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan) says the June 15 credit change was paused and subscription-limit usage continues. [Legal guidance](https://code.claude.com/docs/en/legal-and-compliance) restricts custom-app subscription routing; its unmodified-runtime hosting exception also constrains authentication changes. | **Conditional candidate.** Reconcile the applicable permission and funding requirements. The usage help article does not on its own authorize Collie's custom sign-in/SDK product. An API-key-only route does not meet the accepted requirement. |
| **Grok Build** | [Grok Build](https://docs.x.ai/build/overview) documents browser login and use by other apps; [headless/ACP integration](https://docs.x.ai/build/cli/headless-scripting) provides an execution surface. The [usage FAQ](https://docs.x.ai/grok/faq) says Build shares subscription usage and can continue using purchased Extra Usage Credits, with automatic top-ups available. | **Additional runtime candidate for I14.** Investigate permitted integration and a provider-enforced included-only mode. Do not call it API-only or promise a Codex-equivalent TypeScript SDK. A user-funded subscription alone does not exclude its credit fallback. |
| **Google consumer subscription route** | Google's [transition announcement](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/) retires consumer Gemini CLI access on June 18, 2026. [Antigravity CLI](https://antigravity.google/docs/cli/install/) has browser login, but [its terms](https://antigravity.google/terms) restrict third-party OAuth use; the [SDK documentation](https://antigravity.google/docs/sdk/overview/) describes API-key/enterprise credential paths. | **Deferred under current evidence.** Do not use the older Gemini CLI consumer-auth pages as evidence of a current supported option. Reconsider only if a supported commercial subscription integration becomes available. |

**I01 disposition:** Sign in with ChatGPT plus isolated Codex app-server execution is the documented conditional route; Codex SDK execution remains preferred only if support for the approved token/auth route is established. The published subscription route may use the public Responses endpoint with OAuth, which is distinct from ordinary API-key billing. No applicable Collie commercial participation or binding included-only guarantee has been supplied. The [provider gate register](docs/ai/provider-eligibility.md#exact-gate-register-and-next-steps) keeps live inference/commercial activation gated while revised I10 permits local integration engineering. This supersedes the earlier all-code entry veto without changing the I01 evidence or requiring I01–I09 reimplementation. Provider usage settings can allow credits after plan limits; login or a settings screenshot alone does not establish Collie's required guarantee. No provider is currently approved/enabled, and no API-key fallback is permitted.

### Product rules to preserve

- AI runs only after the user connects their own eligible account through an approved supported SDK/runtime. Collie does not supply a shared model account, hosted inference service, or paid-token fallback.
- Before each operation, and across any internal continuation/tool/model call, establish the account/workspace, session eligibility, allowed capability, and provider-enforced included-only funding. A preflight balance check has a race and cannot guarantee funding by itself. Unknown funding blocks the operation.
- Included subscription use can have limits. At exhaustion, preserve the work and explain when/how the user can try again; no top-up, credits purchase, automatic provider switch, or extra-billing route. Do not promise unlimited use or a permanently fixed provider subscription price.
- Collie's app purchase and the user's AI subscription are separate relationships. Existing free/paid rules remain unchanged; buying Collie is not proof of provider eligibility, and connecting a provider does not unlock paid Collie rights. The new conversation and proofreading actions are available in the free designated editable project and paid editable projects, subject to the same provider requirements; no additional AI paywall is introduced. Preserve reading/export of stored AI content and check editing rights again when a proposal is applied.
- Local project ownership is distinct from remote processing. Explain that explicitly selected content goes to the selected provider under that account's applicable policies. Do not claim AI requests stay on the device, or that using one's own account eliminates provider retention.
- No content reaches Collie's purchase/update/support services. Provider credentials, account/workspace identifiers, host identifiers, and runtime session handles remain device-local and out of `.collie` archives, manuscript exports, diagnostic previews, and logs.
- Store human-readable conversations, explicit prompts/context provenance, and reviewed proposals locally, including them in portable projects, backups, and independent copies by default. Never expose or persist hidden model reasoning as the conversation UI. Provider tokens or opaque session files are not a substitute for a user-owned transcript.
- Manuscript changes always require a separate review/apply action with revision checks and a reversible history checkpoint. A completed AI job cannot silently edit the manuscript, add authoritative sources, or promote a suggestion to verified evidence.

### Technical boundary

The renderer displays connection state, chosen context, messages, and proposals through narrow validated IPC. Main owns the approved provider registry, credential lifecycle, browser sign-in URLs/callbacks, and operation authorization. An isolated local runtime process performs approved inference; project storage stays behind the repository/worker boundary.

Use supported OS credential protection and a Collie-scoped runtime profile. Do not borrow the developer's existing Codex/Claude home or alter the user's unrelated tools. Reject inherited API keys, alternate endpoints, cloud-billing credentials, plugins, hooks, MCP servers, and ambient configuration that could change funding or broaden access. A writing request gets only the captured context, not permission to browse the filesystem or mutate SQLite. Disable shell/write/network tools and subagents unless a separately scoped feature requires a narrowly authorized capability.

Context selection must cover prior thread history, retained attachments, cached runtime context, and provider/account changes. Selecting a smaller scope must not silently reuse an old provider thread containing broader material. If the supported runtime cannot provide that boundary, start a fresh isolated request/thread or mark the feature unavailable.

AI jobs need operation IDs, bounded work, streaming, cancellation, timeouts, partial/failure states, and unknown-outcome handling. No invisible retry that duplicates a request or consumes more allowance. Logs and support reports contain bounded states/error codes, not prompts, credentials, or manuscript text. Sanitized message rendering must not load remote images, execute HTML, or auto-open URLs.

The existing deny-by-default renderer policy remains. Provider networking occurs through the approved main/runtime integration, with its endpoints and content flows added to the privacy inventory. An SDK's localhost transport is not permission to open a generic renderer network/filesystem interface.

## Implementation sequence

Each stage is deliberately bounded and must be explicitly requested. Dependencies indicate implementation order, not authorization to auto-advance. The local UX sequence I02–I09 is delivered and does not need reimplementation. Under revised I10, provider and downstream local engineering can proceed before commercial approval, using delivered contracts. Actual sign-in/inference and commercial availability remain separately gated; no development build may imply operational AI or waive the included-only funding rule.

### How to execute a stage from a short prompt

A request such as **“Please implement stage I01”** refers to the matching I-prefixed stage in this file. It authorizes that stage's stated outputs and necessary in-scope fixes; it does not authorize subsequent stages. The executor should:

1. Read `AGENTS.md`, this file's Confirmed decisions, design/CSS rules, AI boundaries where relevant, Data and compatibility rules, and Stage handoff policy, then the entire requested stage. These shared contracts apply even when the stage is referenced by number alone.
2. Read the required source/documents listed in that stage and its dependency records at `docs/validation/improvement-Ixx.md`. Resolve renamed/extracted modules from those records. Paths below are starting points, not instructions to recreate code already delivered by a preceding stage; proposed new paths do not imply the files already exist.
3. Inspect ordinary source and Git state, preserving unrelated changes. Read user-reported acceptance without running prerequisite checks. If a prerequisite is missing, identify the exact missing contract and do independent authorized work; do not silently implement an earlier stage, add a stub that claims to satisfy it, or demand new approval for routine engineering decisions.
4. Follow the entry conditions, scope limits, work list, and implementation contract. Where exact function/file names are not prescribed, choose a maintainable fit with the actual source and record it. Cross-process commands require validated inputs/results, capability classification, cancellation/retry semantics, and a persistence decision before exposure.
5. Finish with the named deliverables, updated status/evidence, and ordered manual user guide. Implementation completion and user acceptance are separate. A provider gate may remain blocked in an otherwise completed design record; it must not be mislabeled as a working adapter.

**I01 is deliberately a documentation/specification stage.** “Implement I01” means deliver its design and provider decision artifacts, not install Mantine, implement authentication, or change the app. Code implementation starts with I02. This avoids silently advancing to a second stage under a short prompt.

### Model and effort recommendations

Each stage uses the same heading format as the MVP plan: `Model: … | Effort: …`. These recommend the **coding assistant used to carry out the stage**, not the models available to writers inside Collie and not a change to the app's billing/provider configuration.

- **Astra** means GPT-6 Astra (`gpt-6-astra`); use it here for architecture, data preservation, security boundaries, and tightly coupled design decisions.
- **Sol** means GPT-6.1 Sol (`gpt-6.1-sol`) for this improvement plan; it is the balanced choice for bounded feature delivery using established contracts. This naming does not change historical MVP model records.
- **High** and **Extra High** correspond to `high` and `xhigh` where the client exposes those settings. Availability and labels depend on the user's client. These are workload-based recommendations, not measured guarantees; no benchmarks were performed. Model/effort selection is made in the user's coding client, not enforced by project scripts or silent session switching.

The model families and effort controls are documented in [OpenAI's model-selection guide](https://learn.chatgpt.com/docs/model-selection) and [reasoning guidance](https://developers.openai.com/api/docs/guides/reasoning). The per-stage assignments below are engineering judgments based on this repository's scope and risks. The standing prohibition on assistant tests/checks/launches applies regardless of model or effort.

| Stage | Deliverable | Depends on | Current status |
| --- | --- | --- | --- |
| I01 | Experience specifications and provider feasibility record | Confirmed decisions above | Implementation complete — awaiting user document review; [record](docs/validation/improvement-I01.md) |
| I02 | Mantine theme, semantic scoped CSS, and reusable components | I01 experience specification; provider gate not required | Implementation complete — awaiting user testing; [record](docs/validation/improvement-I02.md) |
| I03 | Persistent session/draft ownership and app navigation | I02 | Implementation complete — awaiting user testing; [record](docs/validation/improvement-I03.md) |
| I04 | Portable project metadata and nonfiction starting structures, including Study critique | Confirmed metadata/category decisions, I03 | Implementation complete — awaiting user testing; [record](docs/validation/improvement-I04.md) |
| I05 | Guided project creation | I02–I04 | Implementation complete — awaiting user testing; [record](docs/validation/improvement-I05.md) |
| I06 | Returning-user library and project lifecycle surfaces | I03–I05 | Implementation complete — awaiting user testing; [record](docs/validation/improvement-I06.md) |
| I07 | Focused writing workspace | I03, I04, I06 | Implementation complete — awaiting user testing; [record](docs/validation/improvement-I07.md) |
| I08 | Research, notes, and evidence workspace | I03, I07 | Implementation complete — awaiting user testing; [record](docs/validation/improvement-I08.md) |
| I09 | Export, saving, settings, help, and onboarding integration | I06–I08 | Implementation complete — awaiting user testing; [record](docs/validation/improvement-I09.md) |
| I10 | First provider execution/session boundary; development and activation tracked separately | I01 technical evidence, I03; approval not required to write code | Local foundation delivered — awaiting user testing; full stage partial, funding/isolation/configuration/distribution pending; [record](docs/validation/improvement-I10.md) |
| I11 | Real connection flow and workspace provider controls | I05, I09, delivered I10 connection contract | Implementation complete — awaiting user testing; [record](docs/validation/improvement-I11.md); real login remains unavailable pending I10 access |
| I12 | Project-owned conversations and explicit context | I07, I08, delivered I10/I11 contracts | Not started; local persistence/context/UI can proceed before activation; generation remains gated |
| I13 | Reviewable selection/chapter proofreading | Delivered I12 context/run/proposal inputs | Not started; local capture/review/apply engineering can proceed; real proofreading requires eligible inference |
| I14 | Later second-provider integration, with independent activation | I10–I12 code contracts and separate explicit request | Deferred later increment; own development/access/commercial requirements |
| I15 | Complete-experience refinement and user acceptance handoff | I02–I13; include I14 only when available | Not started |

### Stage I01 — Specify the confirmed experience and provider feasibility

#### Model: Astra | Effort: High

**Status, October 1, 2026:** specification implementation complete — awaiting user testing (document review). Delivered: [wide/narrow screen specifications](docs/design/app-experience.md), [navigation/session/style decision](docs/decisions/improvement-01-experience.md), [dated provider feasibility and gate register](docs/ai/provider-eligibility.md), [evidence](docs/validation/improvement-I01.md), and [manual guide](docs/manual-testing/improvement-I01.md). No production changes. I10 permission/funding gates remain open; I02's specification prerequisite was delivered here; I02 was subsequently requested separately and is recorded below.

**Why this recommendation:** Combines the settled experience with source-backed architecture and provider decisions.

**Purpose:** establish a usable design brief and distinguish implementable local work from external AI dependencies early.

**Entry and required reading:** No prior improvement stage is required. Read the confirmed decisions and AI flow above; `AGENTS.md`; the MVP product contracts and post-MVP AI roadmap; the current `App.tsx`, `Projects.tsx`, editor, settings, security, and project-command modules identified in this plan. Read the existing Stage 18/19 decisions and release gate register for constraints. Refresh official documentation by reading sources only; no SDK invocation, sign-in, inference, app launch, or validation command.

**Scope:** Documentation and concrete specifications. No production code, dependency installation, schema migration, provider account action, or new user questions about settled design choices.

Work:

- Carry the confirmed decision table into the stage evidence/design brief. Mantine, semantic scoped CSS, five primary cards including Study critique, both themes, startup behavior, conversations, proofreading, and AI access rights are already settled. Do not treat this as a new product-approval round.
- Specify first-run, returning, new-project, offline, read-only, and storage-recovery journeys. Produce static annotated wireframes in documentation, including the narrow-window arrangement and primary action on each screen. These are design artifacts, not test UIs or app screenshots.
- Create a provider evidence matrix covering supported runtime/SDK, commercial and redistribution eligibility, sign-in, credential isolation, funding enforcement, limits, cancellation, content handling, and supported desktop channels. Link dated official sources and record approval/reference details only if actually supplied.
- Resolve whether Codex SDK, App Server, or another approved route fits the requested workflow. Do not substitute an ordinary metered SDK because it is easier to integrate.
- Record blockers precisely. Owner/provider correspondence or registration is a separate action, not implied by this document. Do not generate substitute credentials or claim eligibility from documentation alone.

**Implementation contract and deliverables:** Produce `docs/design/app-experience.md` with wide/narrow wireframes for first run, returning library/workspace, project details, AI connection, Write, Research, Export, and Settings; include focus order, primary actions, empty/loading/error/read-only states, and the seven category choices. Produce `docs/decisions/improvement-01-experience.md` with navigation/session ownership boundaries, Mantine/CSS ownership, proposed module responsibilities, and the decision not to add critique-specific intake. Produce `docs/ai/provider-eligibility.md` with a dated SDK/runtime/auth-route matrix, exact evidence supporting or blocking commercial use, funding-control semantics, credential/profile isolation, packaging requirements, and per-provider next steps. Separate Codex SDK execution from sign-in orchestration; document whether the supported route uses the SDK plus runtime auth or app-server execution. Do not invent an SDK login method or assume a generic OAuth token can be supplied without a documented adapter. The record may conclude an adapter is blocked; that is a valid completed research/specification output. Link all three artifacts from this plan and the stage evidence.

**Likely documents:** `docs/decisions/improvement-01-experience.md`, `docs/design/app-experience.md`, `docs/ai/provider-eligibility.md`, and this plan. No runtime change or provider calls are needed.

**User review:** the specified opening sequence and navigation match the intended product; each provider has an honest supported/pending/unavailable status; local redesign work has no unnecessary dependency on commercial AI approval.

**Implementation completion:** The three linked specification/decision artifacts and stage evidence/manual-review guide exist, implementation boundaries are concrete, and each provider gate has a dated evidence-based disposition. An unresolved external provider dependency does not prevent completing this documentation stage; it remains an explicit prerequisite for I10. Every stage also delivers the evidence record, updated ledger, and user-owned guide required below.

### Stage I02 — Establish the visual foundation

#### Model: Astra | Effort: High

**Status, October 1, 2026:** implementation complete — awaiting user testing. Delivered Mantine 9.6.3, Lucide 1.49.0, semantic tokens/scoped styles, persistent light/dark/system and accessibility preferences, real shell/Settings controls and a support-preview dialog. See the [theme/CSP/ownership decision](docs/decisions/improvement-02-visual-foundation.md), [evidence](docs/validation/improvement-I02.md), and [manual guide](docs/manual-testing/improvement-I02.md). Formats are unchanged; no checks or launches were performed. Packaged CSP, visual quality and accessibility remain unobserved. I03 and I04 were subsequently requested and implemented; their records below retain pending acceptance.

**Why this recommendation:** Establishes the visual system, Mantine integration, accessible states, and CSP-compatible styling.

**Purpose:** make every subsequent surface use one coherent design language.

**Entry and required reading:** I01's experience specifications are available; unresolved provider evidence does not block this stage. Read its design decision, `src/renderer/src/main.tsx`, `App.tsx`, `assets/main.css`, `features/settings/SettingsPanel.tsx`, `src/main/security.ts`, `src/main/windows.ts`, `package.json`, and `resources/asset-manifest.json`. Read the citeproc/license decision before relocating attribution. Use Mantine's current official documentation for the chosen compatible package version without executing a preview or component probe.

**Scope:** Theme, reusable presentation/interaction components, and startup preferences. Do not implement the creation wizard, redesign every feature panel, change domain schemas, or add AI networking.

Work:

- Define the Mantine theme and semantic tokens for typography, spacing, colors, borders, radius, elevation, focus, motion, and density. Implement light, dark, system-preference, and high-contrast behavior consistently.
- Add the necessary Mantine packages and locally bundled assets, with versions selected during the requested implementation stage. Adapt them to the existing Electron/Vite configuration and CSP; do not re-scaffold or add Tailwind/another general-purpose component system.
- Compose shared controls from Mantine and replace basic shell/form/button treatments in real product surfaces. Create semantic component/feature CSS files and a minimal global theme/base layer according to the standing rules. Avoid a component-gallery route, test-only controls, utility-class stacks, or broad unrelated rewrites.
- Set explicit behavior for focus return, Escape, outside click, pending actions, text selection, labels, and field errors. Keep native file dialogs and necessary native confirmations.
- Apply preferences from the persistent app root, preserving existing zoom, motion, and contrast choices. Preserve initial-session citeproc attribution and bundled notices.

**Implementation contract and deliverables:** Provide one persistent Mantine provider/theme owner and a visual-preferences boundary. Preserve existing `collie.visual-settings.v1` zoom/contrast/reduced-motion settings when extending or migrating them; add `light | dark | system`, follow system changes when selected, and fall back safely on malformed preferences. Preferences apply before opening Settings and cannot block project access. Deliver semantic, scoped product components for labeled fields/errors, button defaults, action menus, dialogs, status/banner messages, empty states, and surfaces; use them in the actual shell/Settings. Document the token-to-Mantine mapping and stylesheet ownership. Library-generated styles/portals must fit the existing CSP through an explicitly recorded production configuration, not a broad security relaxation. No SQL, AST, archive, or compilation version change is needed.

**Likely paths:** `src/renderer/src/theme/`, minimal global rules in `assets/main.css`, scoped CSS beside `src/renderer/src/components/ui/` and feature components, `App.tsx`, `SettingsPanel.tsx`, and package/license records. Pure presentation work needs no project-format change.

**User-owned acceptance:** existing real screens show consistent controls; keyboard focus is obvious; selected themes/preferences survive reopening; reduced motion and 200% zoom remain usable. Packaged CSP/component behavior remains unverified until the user observes it.

**Implementation completion:** The real shell and preference controls use Mantine, shared product components and scoped semantic styles are available, preferences apply without mounting Settings, and the theme/CSP/license decisions and manual guide are documented. Runtime/accessibility acceptance remains user-owned. Every stage also delivers the evidence record, updated ledger, and user-owned guide required below.

### Stage I03 — Separate session ownership from navigation

#### Model: Astra | Effort: Extra High

**Status, October 1, 2026:** implementation complete — awaiting user testing. Delivered the persistent workspace/session owner, typed destinations, retained draft/editor regions, explicit-save guards, global operation status and close/access integration. See the [decision](docs/decisions/improvement-03-session-navigation.md), [evidence](docs/validation/improvement-I03.md) and [manual guide](docs/manual-testing/improvement-I03.md). I03 changed no project formats; I04 owns the subsequent format change.

**Why this recommendation:** Moves intertwined draft, retry, autosave, entitlement, and close ownership without losing work.

**Purpose:** enable simpler screens without losing drafts or weakening save/close behavior.

**Entry and required reading:** I02's shell/theme components are implemented. Read all of `Projects.tsx`, `NotesPanel.tsx`, `SourcesPanel.tsx`, `EvidencePanel.tsx`, `SourceInspector.tsx`, `src/shared/project-files.ts`, `src/main/project-files-ipc.ts`, `src/main/lifecycle.ts`, and `src/main/updates/direct.ts`; read Stage 7/18 close/access decisions and the I02 evidence record. Follow actual extracted modules if prior work has moved these responsibilities.

**Scope:** Persistent ownership and usable app navigation around existing features. Keep project formats and command meanings unchanged; do not use a routing refactor to alter entitlement, recovery, or commit behavior.

Work:

- Extract project session state, active section/editor ownership, local commit cadence, destination autosave, retry operations, file jobs, access changes, and close/update flushing from the long `Projects.tsx` render tree.
- Introduce explicit app destinations and a guarded transition mechanism. Use local typed navigation; URL/hash routing must not accidentally violate the exact trusted-document checks.
- Establish a persistent draft registry for manuscript, metadata, notes, sources, questions/claims, and transcriptions. Either retain required instances or transfer complete draft state before unmounting. Preserve IME composition, editor undo/selection, and exact retry requests.
- Move subscriptions, preference effects, autosave, and operation banners above view-specific components. Navigation cannot cancel a job merely by closing its panel.
- Replace scroll-to-element assumptions with destination/entity navigation. Define focus restoration and return-to-writing behavior.

**Implementation contract and deliverables:** Introduce a persistent workspace/session owner and typed destinations for setup, library, Write/Research, Settings, and Help. Entity navigation carries stable project/workspace/document/source/note/evidence IDs; no arbitrary paths or DOM selectors as domain identity. Preserve the existing 900 ms manuscript debounce, 5-second protection fallback, and 30-second selected-file autosave unless a necessary change is specifically recorded. A draft registration records identity, dirty/composition state, exact pending operation, flush outcome, explicit-save requirements, and a focus target. Notes/sources can flush through their existing callbacks; pending question/claim/transcription drafts currently block transitions and must not become silently auto-committed. Preserve annotation access-drain behavior. A rejected transition leaves the user at the original draft or navigates to its explicit resolution surface; it cannot discard input. Close/update/access subscriptions and job outcomes live above routed content. Document the owner and transition API for subsequent stages; do not leave a second competing state tree.

**Likely paths:** `Projects.tsx`, `App.tsx`, a new workspace/session module, panel draft hooks, and existing close/access wiring. Keep production commands and persistent formats unchanged in this stage.

**User-owned acceptance:** write and edit a note/source, switch destinations, and return without losing work; unresolved drafts produce an actionable guarded transition; closing and access changes retain their existing flush behavior. Use disposable projects for interruption scenarios.

**Implementation completion:** A single documented session/draft owner drives usable typed navigation, all flush/retry/access/close responsibilities have a persistent home, and no old panel lifecycle is implicitly relied on for durability. Source changes and manual transition scenarios are recorded; native behavior is not claimed observed. Every stage also delivers the evidence record, updated ledger, and user-owned guide required below.

### Stage I04 — Add real project details and nonfiction templates

#### Model: Astra | Effort: Extra High

**Status, October 1, 2026:** implementation complete — awaiting user testing. Delivered seven authoritative nonfiction types, required new-create details, a usable retained Project details form, exact authorized update/retry commands, retained-copy SQL/minimum reader 10, complete portable/copy readers, and frozen compilation 3 with author properties and explicit title-page/description choices. AST/archive remain 1. See the [format](docs/formats/working-project-v10.md), [decision](docs/decisions/improvement-04-project-details.md), [evidence](docs/validation/improvement-I04.md) and [manual guide](docs/manual-testing/improvement-I04.md). No checks or launches were performed. I05 was subsequently requested and is recorded below.

**Why this recommendation:** Changes persistent formats and every portable/export consumer while preserving old projects.

**Purpose:** make the new setup fields durable and useful throughout the product.

**Entry and required reading:** I03 owns drafts/navigation. Read `src/shared/projects.ts`, `src/domain/projects/templates.ts`, `src/domain/capabilities.ts`, `src/main/projects-ipc.ts`, `src/main/entitlements/service.ts`, `src/main/storage-worker.ts`, preload contracts, `src/worker/projects/repository.ts`, storage schema/migrations, and portable modules `portable-db.ts`, `manifest.ts`, `snapshot.ts`, `archive.ts`, `incoming.ts`, and `project-files.ts`. Read working schema 9, the current compilation/export contracts, and I03's decision/evidence before extending them.

**Scope:** Portable details, category/template definitions, a usable Project details form, and frozen output metadata/title-page support. No dedicated Study critique intake, new source-analysis engine, or conversation tables.

Work:

- Add title, author/byline, optional description, and stable project-kind/template metadata to the portable domain. Separate user-facing category names from legacy template identifiers; add genuine Academic essay and Study critique starting types. Study critique receives its category/basic starting point only; dedicated study intake and critique mechanics remain later scope.
- Extend create/read/update IPC with exact validation, bounded fields, expected revisions/head, and idempotent operation handling. Create metadata and the initial outline in one repository transaction.
- Provide a usable Project details action for both existing and new projects. Legacy projects retain their titles/templates and receive empty new fields without being forced back through onboarding; never truncate legacy data to fit new limits.
- Implement retained-copy migration from working schema 9 to the next documented version. Update schema validation, migration chains, portable database graph, archive manifest/minimum reader, snapshot capture, duplicate/restore/rekey handling, and all strict shared consumers together. Keep old supported files readable through migration.
- Update tutorial/internal create callers deliberately. Preserve the trusted sample policy; imported metadata cannot claim sample privileges.
- Capture export metadata at the same head as manuscript content: include author in document properties by default, offer a visible title page separately, and exclude description unless explicitly selected. Update the frozen compilation contract/version if its shape changes; do not introduce live metadata reads into a frozen export.

**Implementation contract and deliverables:** Use stable project-kind IDs while preserving old template IDs for compatibility: `book → nonfiction-book`, `article → article`, `research → research-paper`, `report → report`, `blank → blank-nonfiction`; add `essay → academic-essay` and `critique → study-critique`. Define one authoritative mapping used by creation, metadata, library, and portable readers. New starter text sections are: book **Introduction / Chapter 1**; essay **Introduction / Argument / Conclusion**; article **Draft**; report **Summary / Findings / Recommendations**; critique **Study overview / Argument / Supporting research**; research paper **Abstract / Introduction / Methods / Results / Discussion**; blank **Draft**. All are empty writing sections using the existing supported outline schema. Changing an existing project's kind changes metadata/wording only; never regenerates its outline. Existing manually authored References sections remain intact; new templates rely on generated citation output.

Require trimmed title and byline of 1–500 characters for new personal projects, measured consistently with the existing shared text validators. Description is an optional plain-text multiline value up to 10,000 characters. Preserve Unicode and description line breaks; reject NUL/invalid control content. Stored legacy bylines may be empty; opening/editing an older project must not force onboarding. Specify required new-create versus backward-compatible stored-record validation explicitly. Metadata updates carry expected head/revision and idempotent operation IDs. Classify every new command in the main capability policy; a form's disabled state is not access enforcement.

Implement the retained-copy format change and complete consumer matrix in a new format decision/document. Freeze title/author with export inputs; distinguish DOCX properties, PDF metadata, and text/Markdown's lack of native document properties. A selected title page includes title/byline, not the private description; otherwise text output must not unexpectedly prepend metadata. Update compilation version if its shape changes and document output limitations. I09 will arrange these controls in the final Export flow; this stage must supply usable Project details and the actual metadata/title-page contract, not unused schema alone.

**Likely paths:** `src/shared/projects.ts`, `src/domain/projects/templates.ts`, `src/main/projects-ipc.ts`, `src/main/tutorial.ts`, `src/worker/storage/`, `src/worker/projects/`, and affected compilation/export modules. The first new working version would normally be 10; allocate it against the actual state when this stage starts. AST 1 and archive container 1 need no cosmetic change.

**User-owned acceptance:** edit project details and reopen a disposable copy; values survive Save/Open, duplicate, backup/restore, and selected export metadata behavior. A copied older project opens with its writing intact and missing new fields left blank. Failed migration must retain originals; unobserved failure cases remain pending.

**Implementation completion:** The metadata form, atomic create/update contracts, all seven template mappings, retained-copy migrations, portable consumers, capability classifications, and frozen export metadata/title-page behavior are implemented and documented together. No orphaned metadata-only UI or deferred consumer migration counts as completion. Every stage also delivers the evidence record, updated ledger, and user-owned guide required below.

### Stage I05 — Build the guided project creation flow

#### Model: Sol | Effort: High

**Status, October 1, 2026:** implementation complete — awaiting user testing. Delivered the five primary and two secondary Mantine selection cards, retained details form, bounded device-local resumable setup, exact create-operation retry/receipt reconciliation, explicit free-project designation, and a truthful no-AI continuation into writing. See the [decision](docs/decisions/improvement-05-guided-setup.md), [evidence](docs/validation/improvement-I05.md), and [manual guide](docs/manual-testing/improvement-I05.md). Working SQL/minimum reader 10, editor AST 1, archive container 1 and compilation 3 are unchanged. Runtime, restart, keyboard, native Save and accessibility outcomes await Josh's observations. I06 was subsequently implemented; its acceptance is also pending.

**Why this recommendation:** Implements a bounded wizard on the session, metadata, and design contracts already established.

**Purpose:** replace the crowded opening screen with the requested sequence.

**Entry and required reading:** I02 components, I03 session/navigation, and I04 create/metadata contracts are implemented. Read those stage records plus `src/shared/access.ts`, `src/domain/capabilities.ts`, `src/main/entitlements/service.ts`, and the current trusted create/open/preload methods. Use the I01 screen specification and I04 category/field definitions as the single source of UI copy and validation bounds.

**Scope:** The new-project journey, not a library rewrite or live provider adapter. Use an honest local-continuation state until I10/I11 exist; no fake authenticated state or testing-only controls.

Work:

- Implement the five primary project-type cards, including Study critique, the two secondary starting points, a details screen, and the connection-step boundary using Mantine and the agreed designs. Give Study critique concise copy about building a research-supported argument against a study/publication, without adding its deferred specialized intake workflow. Include Back, Open existing, cancel, field validation, and visible progress through the short flow. Keep onboarding classes semantic and its CSS scoped to its components/features.
- Connect submission to the atomic create contract. Reuse the exact operation on retry and restore the created identity after an interrupted setup; do not manufacture another project on repeated submission.
- Preserve draft fields between steps. Handle safe working-root setup only when actually needed. Never assign a chosen-file destination during onboarding.
- Resolve the free editable designation explicitly where needed, with pending edits protected. A provider account cannot override Collie's entitlement policy.
- Until I10–I11 supply an eligible working adapter, the connection step honestly states that AI is unavailable in this build and offers continuation. Do not add fake provider cards or simulated successful login. This stage alone does not complete the requested AI experience.
- On completion, open the correct project/first writing section. Keep the tutorial separate.

**Implementation contract and deliverables:** Model wizard states explicitly: `type → details → creating → connection → workspace`, with recoverable errors/cancellation at each step. The bounded device-local draft contains type/details, opt-in author preference, a dispatched create operation and receipt/identity when applicable; no provider credentials or portable destination. Back before dispatch preserves fields; once creation has been dispatched, reconcile its exact operation before reusing/changing its payload. Closing after commit resumes or exposes that project instead of creating another. Cancelling before commit discards only setup input; cancelling after commit retains the project. Create is allowed independently of free edit designation; when another personal project is designated, offer an explicit transition through the existing protect/flush policy rather than silently changing it. Deliver all five primary and two secondary choices, form errors, safe working-folder interruption, and a truthful connection boundary that I11 can replace without changing wizard semantics.

**Likely paths:** new `features/onboarding/` components, shell navigation, project creation/session integration, local resumable-setup preference, and app-level accessibility handling.

**User-owned acceptance:** find Study critique alongside the other four primary types and create a project through each step by keyboard; Back retains title/author/description; empty required fields get clear errors; Cancel never deletes an existing project; continuing without AI reaches writing; the first Save still opens a native picker.

**Implementation completion:** Every configured category enters one resumable/idempotent setup flow, title/byline/description use the shared contract, no destination is assigned, free designation remains explicit, and local writing is reachable through the truthful connection boundary. Live AI readiness is not a completion claim for this stage. Every stage also delivers the evidence record, updated ledger, and user-owned guide required below.

### Stage I06 — Make returning projects and lifecycle actions clear

#### Model: Sol | Effort: High

**Status, October 2, 2026:** implementation complete — awaiting user testing. Delivered the strict device-local last-project/section hint and safe trusted reopen/fallback, recent/active/archived library with readable rows and separate actions, contextual Project actions and recovery entry points, and preserved global file-job responses. An already selected project reopened from Projects now explicitly rechecks its selected file through the existing status command. See the [decision](docs/decisions/improvement-06-library-and-lifecycle.md), [evidence](docs/validation/improvement-I06.md), and [manual guide](docs/manual-testing/improvement-I06.md). No new worker command, archive, destination grant or retention policy changed; SQL/minimum reader 10, AST/archive 1, compilation 3 remain. Native, restart and accessibility results await Josh. I07/I08 were subsequently explicitly requested and are recorded below.

**Why this recommendation:** Reorganizes library and lifecycle surfaces around existing durable commands.

**Purpose:** give existing users a calm way to resume work and manage their library.

**Entry and required reading:** I03–I05 have established navigation, metadata, and creation. Read `LifecyclePanel.tsx`, `FilePanel.tsx`, `src/shared/project-lifecycle.ts`, and worker `file-state.ts`, `project-files.ts`, `save-intent.ts`, and `incoming.ts`, plus the Stage 6/7 lifecycle decisions and I03 session contract.

**Scope:** Library, returning-launch selection, project action surfaces, and recovery access. Reuse current filesystem/storage commands; do not add retention expiry, delete artifacts, silently move files, or infer cloud availability from the catalog.

Work:

- Implement safe return to the last project/section, falling back to the library as needed, and a Projects library with readable title, type, modified date, and concise availability/save information. Do not display UUIDs/revision IDs in normal rows.
- Separate recent/active and archived views; make new/open actions clear. A catalog entry is not proof its selected file is currently reachable.
- Move rename/details, duplicate, archive, backup, move, and restore into purposeful project actions with correct explanations. Preserve Backup's separate journal, Move's retained old file, and independent identities for restored/duplicated projects.
- Keep interrupted operations and retained recovery accessible. Replace repeated infrastructure text with contextual details without removing necessary recovery paths.
- Restore the last project only through normal ownership, capability, and file-state handling. Fall back to the library or an actionable recovery state if reopening is unsafe.

**Implementation contract and deliverables:** Persist last project/workspace/section IDs only in local preferences and resolve them against current trusted state. An inactive/missing section falls back to a valid active text section; a locked/unavailable project opens an actionable library state. Do not convert stored path hints into grants or proof of availability. Define active/archived rows, selected/read-only state, readable modified dates, and local versus selected-file status. Preserve independent duplicate/restore IDs, Backup's separate acknowledgment, Move's retained old file, and archive as local organization. Document a reachable home for every existing project/recovery action, including interrupted material and reset recovery. Do not remove these actions merely because the library is now simpler.

**Likely paths:** new `features/library/`, `LifecyclePanel.tsx`, `FilePanel.tsx`, persistent session controller, and device-local last-project preferences.

**User-owned acceptance:** reopen a recent project, find an archived one, and duplicate/restore a disposable copy; independent copies keep their identity and originals; a missing selected file gives a recovery path without destroying locally protected work.

**Implementation completion:** Returning selection and the library are implemented with named reachable lifecycle/recovery destinations, read-only states, retained-copy behavior, and safe fallback. Existing local work remains discoverable independently of selected-file reachability. Every stage also delivers the evidence record, updated ledger, and user-owned guide required below.

### Stage I07 — Create the focused writing workspace

#### Model: Astra | Effort: High

**Status, October 2, 2026:** implementation complete — awaiting user testing. Restored after the accidental plan overwrite from the existing [decision](docs/decisions/improvement-07-writing-workspace.md), [evidence](docs/validation/improvement-I07.md), and [manual guide](docs/manual-testing/improvement-I07.md). Delivered project/outline navigation, retained manuscript with one optional companion, adjustable/narrow/focus layouts, scoped Mantine editor and outline/history controls, selection-safe dialogs, and compact local/file status. No IPC or project format changed; SQL/minimum reader 10, AST/archive 1, compilation 3 remain. Runtime, native, selection/IME and accessibility acceptance remains pending. I08 was subsequently requested.

**Why this recommendation:** Balances visual composition, rich-editor selection, responsive panes, and history preservation.

**Purpose:** make the manuscript the primary visual and interaction focus.

**Entry and required reading:** I03, I04, and I06 are implemented. Read `editor/RichDraft.tsx`, `editor/adapter.ts`, `editor/ReferenceTools.tsx`, `features/outline/OutlinePanel.tsx`, `HistoryPanel.tsx`, `src/shared/outline.ts`, `src/domain/editor/schema.ts`, `src/shared/project-files.ts`, and D3 plus Stage 9/15 decisions. Read the persistent draft/session contract before changing component lifetimes.

**Scope:** The writing workspace and its existing editing/history actions. Keep AST 1 and domain behavior; no new rich-text features, AI inference, export redesign, or generic filesystem access.

Work:

- Build the outline/editor/optional-panel layout, comfortable writing measure, adjustable pane widths, narrow-window behavior, and focus mode.
- Refine outline rows, selection, section navigation, and contextual actions. Keep keyboard/non-drag operations, trash/restore, and structural checkpoints.
- Reduce the toolbar to common formatting plus style and insert menus. Show table/image controls in context; make find/replace and section metadata available on demand.
- Replace browser prompts with properly labeled dialogs; preserve rich content, managed images, clipboard restrictions, inline annotations, citations, and footnote bodies.
- Add a compact save-state surface driven by authoritative local/file state. Keep urgent issues visible independent of the selected workspace view.
- Preserve editor instances or safely captured state during panel changes, including selection needed for citation, annotation, and later proofreading actions.

**Implementation contract and deliverables:** Use a single secondary-panel mode (`closed`, `notes`, `source`, or `ai`) with local pane/focus-mode preferences. Before AI is implemented, its entry point gives the honest availability state rather than a working-looking composer. At narrow widths/200% zoom, move optional panes into drawers/alternate views while preserving a usable editor. Opening a dialog captures the current selection and restores the valid selection before an explicit formatting/link/citation/image/annotation action. Closing a panel must not recreate the editor or erase its undo/composition state. Deliver common formatting, style/insert menus, contextual image/table actions, find/replace, section details, outline/history, and keyboard alternatives to dragging. Derive status from both local dirty/protected state and authoritative file-job status; include unprotected edits, no destination, in-progress, unavailable, conflict, and interrupted outcomes. Feature CSS belongs beside workspace/editor/outline components, not in root CSS.

**Additional important note:** The workspace also needs to have a navigation menu that lets a user switch between projects, along with jump to sections or chapters in a current project. This can be done in a well-designed sidebar.

**Likely paths:** workspace layout, `RichDraft.tsx`, `ReferenceTools.tsx`, outline/history components, shared dialogs, and styles. Retain the editor AST and existing data semantics.

**User-owned acceptance:** write, reorganize, format, cite, and add a footnote in a disposable project; open/close side panels without losing selection or text; resize and use focus mode; find undo/history and distinguish local protection from file save.

**Implementation completion:** The new workspace contains all existing editor/outline/history entry points with documented pane/selection/state ownership and correct save-state semantics. The manual guide covers focus, selection, outline, references, narrow layouts, and recovery visibility; AST semantics remain intact. Every stage also delivers the evidence record, updated ledger, and user-owned guide required below.

### Stage I08 — Organize research, notes, and evidence around tasks

#### Model: Astra | Effort: Extra High

**Status, October 2, 2026:** implementation complete — awaiting user testing. Delivered focused source/note/question/claim/evidence list/detail views, selected-original/excerpt reading, on-demand human forms and retained provenance, focused search/coverage, and guarded Back to original context. A shared saved-content read model exposes separate actual citations, manual section associations, evidence links and question decisions; source usage opens exact research/writing context, and the writing Sources companion aggregates a section or chapter. See the [decision](docs/decisions/improvement-08-research-workspace.md), [evidence](docs/validation/improvement-I08.md), and [manual guide](docs/manual-testing/improvement-I08.md). Josh’s additional note below and its model/effort selection are preserved. No IPC, dependency, persistent preference or content format changed; SQL/minimum reader 10, AST/archive 1, compilation 3 remain. All runtime/native/visual/accessibility outcomes await Josh. I09 was subsequently implemented as recorded below; release remains NO-GO.

**Why this recommendation:** Composes established research tools with shared draft ownership and typed navigation.

**Purpose:** keep research depth while reducing the number of simultaneous forms.

**Entry and required reading:** I03's draft/session owner and I07's workspace/panel contract are implemented. Read `SourcesPanel.tsx`, `SourceInspector.tsx`, `NotesPanel.tsx`, `EvidencePanel.tsx`, `SearchPanel.tsx`, and `src/shared/sources.ts`, `inspection.ts`, `notes.ts`, `evidence.ts`, and `search.ts`; read the Stage 10–14 decisions for revisions, excerpts, annotations, and search provenance.

**Scope:** Research information architecture using existing data and commands. No OCR, new import formats, automated URL retrieval, autonomous argument analysis, or dedicated Study critique workflow. A source link remains a link unless an already implemented action says otherwise.

Work:

- Create a Research destination with Sources, Notes, and Questions & claims. Use a selected-item detail view instead of mounting all editors visibly.
- Simplify source creation/import entry points, group extended metadata, and keep import reports available. Preserve supported formats and avoid implying DOI lookup, OCR, web clipping, or DOCX import exists.
- Make PDF/text inspection, excerpts, annotations, and source-version history flow naturally from a source. Return to the originating manuscript passage or evidence item.
- Connect notes and evidence to the writing-side panel without creating a second content store. Preserve exact quotes, stable anchors, orphan states, and independent revisions.
- Give search a focused results view with useful labels and reliable target navigation. Protect every form draft during view changes.

**Implementation contract and deliverables:** Provide focused list/detail views and typed targets for source/version/page/excerpt, note, question/claim, and manuscript anchor. Missing, archived, revised, or orphaned targets display their actual state and do not silently resolve to a different entity. Research and writing-side inspectors use the same draft/content owner; there cannot be two unsynchronized note/source editors. Retain bibliography import preview/report, original attachment/version provenance, exact excerpt text, and annotation mapping rules. Search uses I03 transition guards, preserves query/result position, and supports return to origin. Study critique uses these normal source tools; its label does not imply a new automatic PDF/link ingestion feature. Deliver sensible no-source/no-note/no-results states and contextual errors with existing domain formats unchanged.

**Additional very important note:** This part is critical to keep in mind. It needs to be easy for a user to be able to see if and where sources are being used in their research and writing from the research view, including clear indicators and navigation aids, and quick access to the relevant context, as well as which sources are being used by a particular section or chapter from the writing screen/view. Don't agonize over perfecting this right now. Stay cognizant that this is still MVP, and we'll likely be fine-tuning a lot of features like this before final release. But it is a critical part of the app, and why I updated the recommended model and effort from Sol High to Astra Extra High.

**Likely paths:** `SourcesPanel.tsx`, `SourceInspector.tsx`, `NotesPanel.tsx`, `EvidencePanel.tsx`, `SearchPanel.tsx`, and new research navigation/layout modules.

**User-owned acceptance:** add a source, inspect an original, save an excerpt, link evidence, and return to writing; partially edited metadata/notes survive navigation; no-source and no-results states explain the next action without filling the screen with instructions.

**Implementation completion:** Sources, inspection, notes, evidence, and search have focused destinations sharing one draft owner and stable navigation targets. Existing source/provenance capabilities remain reachable without adding new retrieval or critique automation. Every stage also delivers the evidence record, updated ledger, and user-owned guide required below.

### Stage I09 — Integrate export, settings, help, and the complete local journey

#### Model: Astra | Effort: High

**Status, October 2, 2026:** implementation complete — awaiting user testing. Delivered the focused export/preflight/native-destination/results flow, compact Save options, separate Settings/help homes, existing native update/license actions, device-local three-point orientation and optional synthetic nonfiction tutorial. Captures invalidate when head/options change; session jobs, per-file losses/outcomes, exact retries, file/recovery safeguards and prior samples remain retained. See the [decision](docs/decisions/improvement-09-local-journey.md), [capability navigation map](docs/design/local-navigation.md), [record](docs/validation/improvement-I09.md) and [manual guide](docs/manual-testing/improvement-I09.md). No tests/checks/builds/launches or native observations occurred; all acceptance and release gates remain pending. I10 was subsequently revised to permit local engineering before commercial approval, as recorded below.

**Why this recommendation:** Integrates export, save states, recovery, accessibility, and required attribution across screens.

**Purpose:** finish a coherent non-AI product experience before connecting live AI.

**Entry and required reading:** I06–I08 are implemented, including I04's frozen metadata contract. Read `DocxExportPanel.tsx`, `CitationsPanel.tsx`, `InterchangeImportPanel.tsx`, `FilePanel.tsx`, `SettingsPanel.tsx`, tutorial/access panels, `src/shared/exports.ts`, `src/worker/exports/prepare.ts`, `jobs.ts`, `src/main/tutorial.ts`, the Stage 16–19 decisions, and privacy/accessibility/license records. Include direct update and close-handshake documents when moving update controls.

**Scope:** Finish existing local-product flows and the agreed example/orientation. No commerce provisioning, paid-rights substitutes, release publication, new output formats, or AI adapter implementation.

Work:

- Present Export as a focused flow: section selection, format, essential options, preflight, then destination. Keep advanced recipes and multi-format capability rules discoverable when applicable.
- Preserve frozen-head compilation, broken-reference blocking, per-revision incomplete-metadata acknowledgment, output loss reports, existing-output retention, and the difference between export and project Save.
- Complete the compact Save menu/details and operation progress across all destinations. Keep explicit conflict review, cancellation, retained candidates, and no cloud-upload claims.
- Move Collie access, appearance, data/recovery, updates, licenses, and support into clear settings/help destinations. Runtime engine versions belong in About/support; necessary storage failure messages remain contextual.
- Implement the agreed optional nonfiction sample/orientation and ensure no setup prompt repeatedly interrupts returning writers. Existing tutorial copies remain retained rather than overwritten.
- Update first-run help and manual guides to match the new navigation. Preserve content-free support output, explicit update behavior, and the flush-before-restart handshake.

**Implementation contract and deliverables:** Export follows `selection/options → preflight → destination/job → result`; returning to change the capture head, selection, or relevant options invalidates prior preflight/metadata acknowledgment. The destination step retains native pickers. Show every batch file's outcome, including partial/cancelled jobs; cancellation does not assert that nothing was written. Keep export independent from selected-project-file acknowledgment. Deliver Settings homes for Appearance & accessibility, AI connections (honest boundary until implemented), Collie access, Data & recovery, Updates, and About/licenses/support. An orientation dismissal is device-local. A tutorial reset creates a fresh trusted sample, preserving previous samples and personal work; synthetic nonfiction material is clearly labeled as such. Account for every row in Where existing capabilities go in a navigation map, with urgent save/access/recovery issues visible across destinations. No output-format change beyond the separately recorded I04 metadata contract is implied.

**Likely paths:** export/import/file/access/settings/tutorial components, `src/main/tutorial.ts`, production tutorial resources, help documents, privacy/accessibility records.

**User-owned acceptance:** complete the local journey from project creation through writing, source use, Save, export, and reopening; cancel a picker without losing work; find help/settings quickly; the workspace stays usable offline. Export fidelity and native release gates remain pending until user evidence supports them.

**Implementation completion:** The full local capability-to-destination map is implemented, export/preflight/result states and settings/help/tutorial flows are coherent, and the independent local milestone has a complete manual guide. Provider absence does not block local writing or mark AI complete. Every stage also delivers the evidence record, updated ledger, and user-owned guide required below.

### Stage I10 — Develop the first provider boundary and retain activation gates

#### Model: Astra | Effort: Extra High

**Status, October 2, 2026:** **independent local implementation delivered — awaiting user testing; I10 overall remains partial.** Delivered protected OAuth/session storage, a real Codex app-server transport, bounded context/operation/recovery contracts, narrow IPC, main capability and close/update integration, plus dependency/notices and the [runtime runbook](docs/ai/provider-runtime.md). Codex CLI 0.160.0 is a development dependency and jose 6.2.12 validates tokens. Registration remains unset. Binding included-only funding enforcement and complete text-only runtime isolation remain explicit missing methods; packaged runtime resources/signing are not delivered. No login, runtime invocation, inference or user/native acceptance occurred. See the [decision](docs/decisions/improvement-10-provider-boundary.md), [record](docs/validation/improvement-I10.md), [provider evidence](docs/ai/provider-eligibility.md), [owner guide](docs/ai/openai-approval-guide.md) and [manual guide](docs/manual-testing/improvement-I10.md).

**Delivered contract and remaining work:** `src/main/ai/`, `src/shared/ai.ts` and `src/preload/ai.ts` now supply real connection and operation methods. I11 can consume their unavailable/unconfigured states; I12 can build local persistence/UI against their capture, retained-record and disk-only protection interfaces. No later stage is implemented here. Resume I10 to reconcile authentic registration, replace funding/isolation refusals with documented enforcement, finish model eligibility and packaged runtime delivery, and record actual access/activation evidence. Do not recreate the service or require earlier stages to be rerun. The runbook distinguishes delivered components, exact technical gaps, missing access/configuration and unobserved behavior.

**Why this recommendation:** Owns credentials, subscription funding, process isolation, IPC, and provider runtime lifecycle.

**Purpose:** build the real provider boundary in an isolated local development environment, then activate supported live access and commercial distribution as their requirements are resolved.

**Entry for engineering:** I03's persistent lifecycle/draft owner and I01's documented technical route/evidence are available. Commercial approval and included-only funding proof are not prerequisites for writing integration code. Read the actual SDK/runtime documentation and license to choose a technically supported implementation. A missing provider registration, development credential, commercial approval or funding control blocks only the dependent live action or unresolved method; implement the independent work and identify the exact remaining dependency. Do not stop at another general approval guide.

**Continuation from earlier stages:** I10 owns this policy correction and all provider development/configuration work. I01–I09 do not need to be reimplemented or renumbered. Read their delivered contracts as prerequisites, then use this brief wherever earlier evidence describes approval as a prerequisite for all I10 engineering. Necessary integration edits to those existing owners belong to I10, without asking Josh to rerun their stages. Retain their unreported acceptance and independent release gates. A later request to resume I10 completes its remaining configuration or route-dependent code; it must reuse delivered work rather than recreate the service.

**Entry and required reading:** Read the AI flow and provider evidence above, I03's ownership decision, the existing I10 decision/evidence and owner guide, `src/main/security.ts`, `windows.ts`, `ipc.ts`, `projects-ipc.ts`, `src/main/entitlements/service.ts`, `src/domain/capabilities.ts`, preload/shared validation patterns, current close/update handling, and packaging/privacy documents. Read the selected pinned SDK/runtime's official README/types and auth/execution documentation; do not execute it for a feasibility check. Prefer Codex SDK where its exact route is documented; use the documented Sign in with ChatGPT plus app-server adapter where required. Documentation of a protocol is a basis for writing code, not proof of account access or commercial permission.

**Scope:** The actual protected service, one documented first-provider adapter, narrow shared/preload/main contracts, local configuration/credentials and lifecycle integration. Conversations/proposals belong to I12/I13 and product connection UI to I11. No second provider, simulated backend, mock account/model replies, test harness, testing-only UI, shared credentials, API-key fallback or hosted proxy. A local sandbox means an isolated Collie development installation/profile; it does not mean a documented OpenAI OAuth sandbox exists or that requests are free.

#### Three parts of the same stage

| Part | Work permitted now / dependency | Evidence required before calling it available |
| --- | --- | --- |
| **1. Local engineering** | Write supported adapter/service code, credential protection, browser callback handling, streaming/cancel/error mapping, authorization, configuration, IPC, lifecycle and packaging plans. Pin lawful local SDK/runtime dependencies and notices where supported. Use Collie's development identity/data separation. | Concrete code and documented supported methods; no live account or commercial approval needed just to write this code. Record any exact technical or licensing dependency that prevents a particular component. |
| **2. Live development access** | Configure a real supported development route when its access is supplied. Main may start browser login only when the actual route permits it and registration/callback configuration is valid. | Route-specific development permission/access and real registration/configuration, secure storage, then session/model/edit rights and binding included-only funding for inference. Commercial approval is required here only if the provider says it is a condition of that development route. |
| **3. Commercial activation** | Reconcile the eventual commercial route, finish its configuration and any bounded adapter changes in I10, and retain downstream integration. | Applicable commercial approval, production registration/branding, permitted distribution/runtime notices, binding included-only funding, and user/native evidence plus existing release gates. No new numbered prerequisite stage or reimplementation of I01–I09. |

**Activation rule:** Build the code before access is available, but enforce access in main at runtime. Keep separate fields for implementation/configuration, permission for the current development/beta/production channel, authentication/session state and funding eligibility. A build flag, environment label, UI toggle or developer's personal subscription is not proof of provider permission or included-only funding. No live sign-in through an unsupported route and no inference when funding is unknown; those actions stay unavailable with precise reasons while independent engineering proceeds. Authentication can be available with inference blocked if the documented route permits that separation. Do not bypass the commercial restriction on built-in Codex login by calling it a sandbox. No API-key, paid-credit or top-up fallback, including development builds.

Work:

- Select and pin the documented SDK/runtime release for local development where its license permits. Implement the adapter against actual published types/methods; preserve the SDK preference without inventing an OAuth bridge. Record macOS arm64/x64 and Windows x64 resource/signing strategy, license notices, redistribution and channel conditions. Pending redistribution affects shipping resources, not unrelated service code; no PATH discovery, silent download or runtime self-update. Existing MAS refusal gates remain.
- Implement real provider capabilities, isolated credential/session ownership, eligible model selection, browser URL/callback validation, refresh/disconnect, and exact attempt/connection identifiers. Registration values stay unset when not supplied; do not fabricate client IDs, credentials, approvals or account state.
- Implement channel-aware activation and per-operation authorization. Check current trusted Collie editing scope, selected account/workspace/model/capability and funding. Where the provider's binding funding mechanism is unresolved, return a real `funding unknown` refusal before dispatch; record the missing provider-specific enforcement work instead of claiming it is solved. Commercial permission and runtime state remain separate from a user-authenticated session.
- Add named IPC for status, connect/cancel/disconnect, context-bound start/cancel and sanitized events. Supply the stable contract I11–I13 can use with an unconfigured or blocked connection; do not expose generic commands, credentials or renderer-selected execution options.
- Implement bounded context, runtime tool/config/endpoint isolation, local jobs, streaming, partial/failed/unknown outcomes, cancellation, timeouts, crashes, account switching, expiry/revocation and quota refusal. Runtime history cannot silently contain broader context than the approved operation. No hidden inference replay after restart, refresh or uncertainty.
- Integrate close/update settlement above view visibility, retaining I03 draft guards and the existing flush-before-restart handshake. Specify the partial-output events I12 will persist; portable transcripts belong to I12.
- Update privacy/network/credential storage documentation and packaging/notices with implemented flows, distinguishing code paths from activated or observed behavior. Prepare owner-only setup/manual steps for real UI when available; no assistant registration, login, inference, tests, checks or launches.

**Implementation contract and deliverables:** Deliver a provider domain interface for capabilities/models, connection/attempt status, connect/cancel, account refresh, disconnect, authorization, execute/stream/cancel and normalized errors. Exact transport calls come from the selected release's documentation, not invented methods. Implement the corresponding service/adapter code wherever documented, even when missing configuration causes it to refuse live calls. A registry with only empty methods or canned successes is not this deliverable. Record any genuine method/configuration gap individually; later stages can use delivered stable contracts without waiting for commercial activation.

Main owns the fixed provider/auth endpoints, supported default-browser launch, protected profile, callback/runtime events and sanitized IPC. `ready` means a real configured route allowed for the current channel, a valid session/capability and established funding; engineering completion alone cannot set it. Use stable attempt/connection/operation IDs to reject stale completions. Recheck permissions, Collie editing scope, session, model and included-only funding before each submitted operation and every internal continuation; never extend local access-drain rights to new AI work. Keep operational records device-local and distinct from portable transcripts. Build an allowlisted child environment/config excluding ambient API keys/endpoints, developer homes, project filesystem access, shell/web tools, plugins/MCP and subagents. Fail closed when secure credential storage or a required policy is unavailable; no plaintext fallback or developer bypass. Record interrupt requests separately from terminal outcomes and never assert cancellation reverses consumed usage.

Deliver a non-secret configuration/runbook covering the exact chosen release, supported methods, local profile/resources, missing owner/provider inputs, channel rules, credential/refresh handling, funding control or exact unresolved semantics, shutdown/unknown outcomes and privacy. Maintain a component checklist: **implemented**, **technically blocked with exact missing contract**, **awaiting configuration/access**, or **awaiting user observation**. Also record commercial activation separately. Authentic later provider evidence is incorporated by resuming I10, with narrowly required I11–I13 compatibility edits owned by those same stages when requested; it never requires rerunning I01's research stage.

**Likely paths:** new `src/main/ai/`, `src/shared/ai.ts`, narrow preload/main registrations, runtime-process module, protected local configuration, packaging resources, provider decision/runbook. Keep the storage worker's role distinct from network inference.

**User-owned acceptance:** I10 introduces no standalone testing UI. Without live access or I11/I12 UI, provide document review of the implemented component map, real configuration/refusal rules and remaining dependencies; runtime behavior is unobserved. Once the real UI and supported development access exist, Josh can sign in using synthetic text, observe cancellation/offline/expiry/context behavior and supported packaged runtime. No raw IPC, SDK probe, mock responses or special testing screen, and no deliberate charge-incurring experiment. Waiting for these observations does not stop coding independent components.

**Implementation completion and status:** Report engineering progress separately from live development access and commercial activation. If all independent code is delivered, it may be reported as **local engineering complete — awaiting user testing; live access/activation pending**, with the completed component list and explicit outstanding route/funding work. If supported-method gaps leave code incomplete, say **engineering partial** and name them; do not label the entire service complete because its interface compiles or requests are disabled. A working first-provider milestone still requires authentic access, funding enforcement and user-reported behavior. The earlier plan revision alone was not implementation; the current partial implementation is recorded above, with its missing methods left explicit. Every stage also delivers the evidence record, updated ledger and user-owned guide required below.

### Stage I11 — Deliver the AI connection step and account controls

#### Model: Sol | Effort: High

**Status, October 2, 2026:** implementation complete — awaiting user testing. Delivered one persistent connection owner, real service-derived third setup step/Settings/writing companion, browser waiting/cancel/retry, saved-account selection/reconnection/renewal/disconnect, truthful provider indicator, global progress and guarded focus/navigation. Necessary main/shared/preload integration adds ordered status snapshots, main action permissions and explicit local saved-account selection. All registrations remain null; funding/isolation/packaged runtime and authoritative ready/model eligibility remain I10 work. No login, inference, test/check/build/launch or user acceptance occurred. See the [decision](docs/decisions/improvement-11-ai-connections.md), [record](docs/validation/improvement-I11.md) and [manual guide](docs/manual-testing/improvement-I11.md). SQL/minimum reader 10, AST/archive 1 and compilation 3 are unchanged. I12/I13 are not implemented.

**Why this recommendation:** Builds a bounded browser-sign-in UI over I10's protected connection contract.

**Purpose:** turn the requested third setup screen into a trustworthy, understandable experience.

**Entry and required reading:** I05 setup, I09 settings/navigation and I10's real connection/status contract are delivered. I10's local engineering may be complete or partial with explicit remaining provider inputs; a working account or commercial approval is not required to write this UI. Depend on delivered methods/types, not a simulated service. Read their stage records, the recorded sign-in endpoint/callback contract, connection-state types, and Mantine dialog/focus conventions from I02. Native/authentication observations may still be pending; retain that status and provide the corresponding manual guide.

**Scope:** Provider connection UX over the protected service. No custom OAuth server, renderer token parsing/storage, credentials copied from another application, chat generation, or inference as a connectivity probe.

Work:

- Populate connection presentation from I10's actual implementation/configuration and channel-permission state. An implemented provider lacking configuration/access can have an honest unavailable explanation; enable Connect only when main permits the actual route. Do not advertise planned providers as supported or present a fake account. Use documented branding and distinguish provider, account, workspace and model without overloading the initial choice.
- Implement browser authentication, waiting/cancel/retry states, reconnect and disconnect. Do not embed password fields, scrape cookies, or access an unrelated installed tool's credentials.
- Distinguish signed in from eligible to run. If the subscription/funding gate fails, explain the reason and keep local continuation clear; never display a green “Ready” state solely because OAuth succeeded.
- Reuse an existing connection appropriately for new projects. Keep management available in Settings and a compact active-provider indication near AI actions.
- Preserve the already-created project on every error/cancellation and complete the guided transition to the workspace. No automatic inference on sign-in.

**Implementation contract and deliverables:** Bind screens to I10's state, including unavailable/unconfigured, signed out, signing in, checking eligibility, ready, expired, quota/funding blocked, and sign-out progress with concise reason-specific actions. Present actual configured capabilities and unavailable reasons; actionable sign-in offers require route permission and configuration. Support `development access unavailable`, `commercial activation pending` and `funding unknown` as separate service-derived reasons. These are normal product states, not forced simulations or test controls. The default-browser return is correlated by the service; UI polling/events cannot manufacture success or expose secrets. Keep attempt cancellation idempotent and ignore stale completions. A pre-existing connection is summarized with Change/Disconnect actions; do not repeat login per project. Return to the originating setup/settings/project target after completion, restore keyboard focus, preserve all wizard/editor input, and provide Continue without AI throughout. Never request provider passwords or require users to open a terminal. Do not automatically send a greeting, manuscript excerpt, or validation inference after authentication.

**Likely paths:** onboarding connection screen, `features/settings/AIConnections`, shared provider-status components, persistent shell/session state.

**User-owned acceptance:** without live access, create a project, see the truthful unavailable connection state and continue to its manuscript; Settings explains the real missing configuration/access without losing writing. Once supported development access is supplied, sign in through the real browser flow, cancel/disconnect and continue locally, then reopen without repeated authentication when the session remains eligible. Sign-in alone never implies inference eligibility. No simulated success path is required to finish local UI engineering.

**Implementation completion:** Onboarding and Settings are wired to real delivered I10 methods/state, with browser-auth handling, guards and draft-preserving actions implemented wherever their method contracts are available. Local UI engineering and real login availability/observations are reported separately. A specific missing auth method blocks its dependent UI only; unavailable access does not require fake success or block the rest of the screen. Unobserved real sign-in remains pending, and production availability requires I10 commercial activation. Every stage also delivers the evidence record, updated ledger, and user-owned guide required below.

### Stage I12 — Add project conversations with explicit context

#### Model: Astra | Effort: Extra High

**Why this recommendation:** Combines portable conversation persistence, exact context authorization, and streaming job recovery.

**Purpose:** let writers talk to their chosen AI while retaining understandable control of content and history.

**Entry and required reading:** I07/I08 provide manuscript/source context selection; delivered I10/I11 code contracts provide connection state and bounded operations. Generating requires supported live access, an eligible account and binding included-only funding; applicable commercial approval gates commercial activation or a development route that requires it. These are not prerequisites for implementing local conversations, persistence, context review, rendering and the job pipeline. Missing provider methods block their dependent execution only. Read their contracts, I04's complete migration/portability changes, `src/domain/capabilities.ts`, `src/main/entitlements/service.ts`, current document/note/source-excerpt commands, shared graph validation, and snapshot/independent-copy paths. Base new schema numbers on the actual latest committed format, not an assumed fixed number.

**Scope:** Project conversations, explicit context, durable transcripts, and Save as note. No automatic manuscript changes, provider account-history import, remote conversation hosting, autonomous research, or silent cross-provider replay.

Work:

- Add local conversation/message/context records, stable IDs, provider/model provenance, run outcomes, and portable transcript export. Include this project-owned content in `.collie` files, backups, and independent copies by default. Keep credentials and provider resume handles outside portable data.
- Allocate the next working schema and update retained-copy migration, snapshots, graph validation, manifests, duplicate/restore/rekey, backup, and all consumers before exposing durable chat UI. Copied projects must not inherit a live provider session or permission to resume it.
- Implement new/rename/archive conversation, message composition, streaming, stop, visible failure/partial outcomes, and user-initiated retry. Mark incomplete responses honestly; keep a recoverable local record if the app closes.
- Provide explicit context chips/selection for the active passage, section, selected notes, and inspected source excerpts. Show scope, provider, and inspectable outgoing context, including relevant previous messages. Avoid automatic full-project uploads and silent truncation.
- Keep context within declared size bounds. If a chapter needs multiple requests, disclose the scope and apply the funding/session gate to each internal operation; no hidden recursive agent work.
- Render compact messages and evidence links with safe content handling. Separate statements from verified sources. Let the user save a response as a note through an explicit existing domain command; chat itself does not alter prose.
- Switching provider starts a new thread unless the user expressly chooses which prior context to share. Disconnecting does not remove local history or transcript export.

**Implementation contract and deliverables:** Define durable conversation IDs/title/archive state, ordered user/assistant messages, immutable context captures, provider/model provenance, and visible run-attempt outcomes (`not-sent`, `queued`, `running`, `completed`, `cancelled`, `failed`, `interrupted`). Keep tokens, account/workspace identity, opaque resume handles, runtime files, and live process state in device-local operational storage. Persist a user message and run intent before dispatch, checkpoint streaming text in bounded local writes, and reconcile completion/partial state without replaying inference on reopen. A user retry creates a visible attempt linked to the prior outcome; a storage retry reuses its exact durable operation.

Capture outgoing context as stable references plus the exact approved text/revisions and necessary prior messages. Authorize the matching immutable payload digest; later manuscript/source edits cannot silently change what is sent. Explain summaries/limits before sending, rather than silently dropping context or reusing a broader hidden provider thread. Preserve readable source labels/locators in copied or older transcripts when originals change. Classify read/export as always available. Local conversation mutations, including rename/archive, require editable project scope but work while disconnected; generation additionally requires provider eligibility and funding authorization. Recheck rights for Save as note without requiring a live provider connection. Deliver conversation list/detail/composer, safe streaming content, stop/retry/archive, explicit context review, selected-context transfer to a fresh provider thread, and disconnected transcript export. Extend migration/portable/copy graphs together and document the new schema and retention behavior.

**Development before access:** Implement the real local schema/migrations, list/detail/composer, immutable context review, storage/recovery and streaming/cancel handlers against delivered I10 methods. Local new/rename/archive/export and retained unsent user input work with no provider. A refused submission is visibly `not-sent`, carries no fabricated provider response and does not enter a background inference queue. When access later becomes available, sending remains an explicit action with fresh scope/session/funding authorization; activation never automatically sends an old draft. Preserve truthful null/unknown model provenance where it is not yet known. No fake assistant messages, generated test fixtures, transcript injection or mock streaming UI.

**Likely paths:** new `features/ai/`, AI shared contracts, worker conversation repository/schema, local operational job storage, context capture/projection, and provider adapter.

**User-owned acceptance:** before live access, create/rename/archive a local conversation, prepare and inspect selected context, retain unsent input and observe a truthful refusal without an assistant reply; reopening/export preserves actual stored local records with their unsent status. Once live access is available, discuss a synthetic passage, stop a real reply and read/export its transcript while disconnected; a copied project retains real history without inheriting account authority. Deletion/retention choices must explain that older backups may still contain prior history.

**Implementation completion:** Local conversation persistence/context/UI and documented job handlers are delivered with safe rendering, recovery, correct capabilities and complete storage/copy consumers. Report engineering delivery separately from unavailable live generation or missing provider methods. Real streaming/cancellation and transcript quality observations remain pending supported live access; commercial AI availability still requires I10 activation. The absence of an account does not excuse leaving independent storage/UI work unimplemented. Every stage also delivers the evidence record, updated ledger, and user-owned guide required below.

### Stage I13 — Add human-reviewed proofreading

#### Model: Astra | Effort: Extra High

**Why this recommendation:** Applies model suggestions through revision-safe, reversible manuscript transactions.

**Purpose:** implement the requested example as a bounded writing action with clear user control.

**Entry and required reading:** I12's actual run/context/persistence contracts are implemented. Live inference or commercial approval is not needed to implement proposal storage/validation, capture, review/apply and reversal. Receiving real suggestions and evaluating their quality requires eligible inference; do not create simulated proposals to substitute for it. Read `editor/adapter.ts`, `src/domain/editor/schema.ts`, `src/shared/outline.ts`, worker `outline.ts`, `manuscript.ts`, `notes.ts`, and `citation-occurrences.ts`, plus Stage 9/10/15 revision/history decisions and current main capability enforcement. Use the live outline model: parts/chapters are containers; text documents hold editable prose.

**Scope:** Grammar/spelling/punctuation proposals for declared supported text. No factual checking, argument scoring, automatic rewrite, direct model writes, citation replacement, or inferred target remapping.

Work:

- Offer “Proofread selection” and “Proofread chapter”. Describe grammar/spelling/punctuation scope and preserve the author's meaning/voice; do not imply factual verification.
- Capture exact section/block ranges, document revisions, prompt/context, and provider/model identity. Define a strict structured proposal format and validate results in production before display.
- Store proposals and decisions under a documented versioned contract, extending the I12 data schema when needed. Record accepted/rejected/stale state and provenance; keep proposals out of clean manuscript exports.
- Present before/after text and short explanations. Permit individual acceptance/rejection and an explicit review of any grouped application.
- On Apply, recheck revisions and exact targets, create a checkpoint, and use transactional domain mutations. Refuse stale proposals rather than guessing where they belong. Preserve marks, citations, footnotes, tables, and anchors; report unsupported selections rather than flattening them.
- Preserve later work when undoing/restoring and never apply a cancelled, partial, or schema-invalid AI response automatically.

**Implementation contract and deliverables:** A chapter means the selected active chapter container's active text descendants in outline order. Preview the included section titles before submission; when no chapter exists, offer the current section explicitly instead of silently widening to the whole project. A selection captures document ID/revision, block ID, exact text range, before text, and context provenance. Initial supported edits may be confined to paragraph/heading/list text ranges with compatible marks; refuse or visibly exclude ranges crossing citation/footnote atoms, images, tables, or unsupported formatting. Explain coverage and let the user narrow a selection; never flatten unsupported rich content.

Each structured proposal contains exact before/replacement text, target/revision identity, concise reason, run/provider provenance, and pending/accepted/rejected/stale state. Reject overlapping, out-of-scope, invalid, or incomplete suggestions. Applying a reviewed group validates all chosen targets, current edit rights, and relevant revisions/head in one transaction, creates a pre-apply checkpoint, and updates manuscript/anchor/citation projections through the existing domain boundary. Record the decision and mutation idempotently so repeat clicks/retries cannot reapply it. Individual acceptance makes remaining suggestions for the changed document revision stale unless a separately documented deterministic mapping is implemented; never silently guess a rebase. Keep rejection independent of prose and no new inference on Apply. Deliver the selection/chapter action, durable review UI, stale/refusal states, grouped/individual apply, and meaningful undo/history behavior.

**Development before access:** Build selection/chapter scope preview, structured result validation, durable proposal states, review/transactional apply/reversal code and unavailable/error presentation using the real I12 run boundary. With no eligible account, preparing a scope preserves selection and explains why submission is unavailable; no proofreading result is manufactured. The review panel displays genuine saved proposals or an honest empty state. Local code delivery can proceed while live provider output, proposal quality and manual apply/stale/reversal observations remain pending.

**Likely paths:** AI proposal/context modules, editor selection bridge, worker proposal storage, existing document/history commands, and review-panel components.

**User-owned acceptance:** without access, prepare a selected passage/chapter scope and observe the real unavailable state without losing selection or altering prose. With eligible inference, request corrections for synthetic prose, review real returned suggestions, reject one, accept another and undo it; edit the passage while a proposal is pending and observe the stale-state refusal; confirm surrounding references/formatting remain intact. AI quality and false positives require user evaluation, not an implementation claim.

**Implementation completion:** Bounded capture, durable structured proposal validation/review/apply, stale refusal, transactional projections and reversal code are implemented against delivered I12 contracts. Engineering delivery is separate from live proofreading availability and real-result acceptance. Missing execution methods leave only their dependent work partial; live access is not needed to write the local proposal pipeline. The supported subset and unavailable states are visible; real-result quality, application/reversal and rich-content observations remain pending where no genuine output exists. Every stage also delivers the evidence record, updated ledger, and user-owned guide required below.

### Stage I14 — Add another provider without fragmenting the experience

#### Model: Astra | Effort: High

**Why this recommendation:** Reconciles provider-specific permissions, authentication, funding, and capability differences.

**Purpose:** deliver provider choice when another provider genuinely meets the same product promises.

**Entry for engineering:** this later increment must be explicitly requested, and a second provider must have a documented technically supported subscription integration worth implementing under the same constraints. Choose from then-current candidates using official documentation. Apply I10's separation of engineering, live development access and commercial activation independently to this provider. Commercial approval is not a blanket prerequisite for writing supported code, and the first provider's approval never transfers to another provider.

**Entry and required reading:** The user explicitly requests this later stage and the actual I10–I12 contracts needed by its adapter are delivered. The first provider need not be commercially activated to write the second adapter. Establish the second provider's technical route/license before coding; actual sign-in/inference and shipping require its own route-specific access, funding and commercial evidence. Read `docs/ai/provider-eligibility.md`, the chosen provider's current official runtime/authentication/usage documentation, and the actual provider registry, shared operation types, context/persistence, and packaging modules delivered by I10–I12. Grok Build and Claude are candidates, not an instruction to expose every named provider.

**Scope:** One additional documented provider adapter per implementation pass, using the existing contract. A real adapter may remain unavailable pending registration/access; it must not be presented as usable provider choice. Do not add empty nominal adapters, redesign the first integration or make an API-key route an exception. I14 owns its later configuration/activation work without reopening I01 or rerunning earlier stages.

Work:

- Implement its supported adapter and authentication/funding checks under the existing operation contract. Do not add a generic API-key adapter or a silently metered proxy.
- Map actual capabilities and limitations honestly. A provider may support conversations but lack the output guarantees needed for proofreading; hide or explain unavailable actions.
- Support multiple saved eligible connections, with one explicitly selected provider per operation/thread. Make account and model changes clear; never fail over automatically.
- Preserve portable local transcripts and safe context transfer. Do not promise that opaque provider threads, hidden memory, or account history can migrate between companies.
- Add runtime packaging, notices, privacy documentation, and user-owned connection/limit scenarios for each supported desktop channel.

**Implementation contract and deliverables:** Extend the registry with exactly one provider and its real documented transport (SDK, official headless runtime, or supported ACP). Keep implementation/configuration, channel permission, session and funding eligibility separate, as in I10. Map capabilities, error/limit semantics, cancellation, account identity, and funding proof into I10's contract without reducing its guarantees. Document any feature it cannot support; disable that feature for this connection without changing other providers. Reuse the same project transcript/context format. Explicit provider switching creates a fresh provider thread and previews any selected transferred history. Record platform packaging, notices, privacy flows, and provider-specific external dependencies. If a method or license is undocumented, name that exact dependency and implement independent supported components. If access or commercial approval is pending, retain real refusal states and continue engineering; unknown funding always prevents inference. Do not substitute mocks or a nominal adapter for implementation, or claim usable provider choice before it exists.

**User-owned acceptance:** without live access, review actual unavailable reasons and continued local writing/history; do not simulate a connection. Once each route is eligible, explicitly choose providers, compare self-selected synthetic scope and disconnect either without losing local work. Unsupported capabilities are explained; switching never resends prior material without consent.

If no technically supported second route can be selected, keep this later stage deferred with its exact dependencies; it does not block the local redesign or first-provider milestone. The application must not advertise multi-provider support as delivered.

**Implementation completion:** Report delivered adapter engineering separately from live development access, commercial activation and user observations, using I10's component checklist. Code gaps mean engineering partial; pending permission/configuration alone does not forbid independent code delivery. A usable second-provider milestone requires its own authentic eligibility/funding evidence and user observations. First-provider functionality remains independent. Every stage also delivers the evidence record, updated ledger, and user-owned guide required below.

### Stage I15 — Refine the full experience and record user acceptance

#### Model: Astra | Effort: High

**Why this recommendation:** Resolves cross-screen product inconsistencies and produces an honest integrated acceptance handoff.

**Purpose:** finish the experience as a coherent product and document what is actually accepted.

**Entry and required reading:** Read I02–I13 implementation records and all user feedback; include I14 only if delivered. Read the capability-to-destination table in this plan, the current privacy inventory, accessibility matrix, license notices, and `docs/validation/release-candidate.md` plus release manifest. If required AI engineering, live access or commercial activation remains pending, local refinement and review of actual unavailable states can proceed. Record these separately; the full improvement milestone remains partial rather than silently dropping AI scope. No approval process creates a requirement to rerun I01–I09.

**Scope:** Resolve documented integration/UX defects and prepare final user-owned acceptance. This is not an assistant-run audit/test stage, a new feature sweep, or authorization to finish unresolved commerce/signing/store work.

Work:

- Resolve Josh's reported usability/visual defects from earlier stages. Harmonize spacing, language, selection states, keyboard paths, focus return, loading, errors, and empty states across the real screens.
- Prepare a unified user-owned walkthrough covering a new nonfiction project, optional AI connection, writing, research, conversation/proofreading where implemented, native Save, export, backup, and return to work.
- Include keyboard-only navigation, VoiceOver/NVDA where available, selected themes, high contrast, reduced motion, narrow windows, and 200% zoom. Incorporate manual editor/IME and content-script scenarios from existing guides without claiming expanded language support.
- Include safe disposable-copy scenarios for legacy migrations, external file conflicts, unavailable destinations, access changes, interrupted work, and provider failure. Do not create failure-injection tools or ask for risky operations on real manuscripts.
- Update help, source/license notices, privacy inventory, accessibility matrix, manual coverage, and the improvement completion ledger. Preserve outstanding native, export, scale, commerce, signing, MAS, and beta gates in the existing release register.
- Record only user-reported results. Separate the local UX milestone, each working provider, proofreading, and multi-provider availability so a completed redesign cannot conceal a blocked AI promise.

**Implementation contract and deliverables:** Build an acceptance matrix mapping each implemented journey to its current UI entry point, required data/permissions, manual action, expected result, relevant platform/theme/zoom variation, and user-reported outcome. This is documentation, not a test harness. Address supplied defects in the owning production modules with the same semantic CSS, draft, and data contracts. Provide a consolidated manual guide for first-run/returning/offline work, saving/export/recovery, available provider sign-in, conversations, and proofreading; mark unavailable provider paths and all unobserved native/output/scale outcomes pending. Update the privacy inventory, accessibility matrix, help/navigation documentation, notices, and improvement ledger as needed. Retain all independent release-candidate blockers and distinguish completed local UX from complete selected AI scope. A lack of reported defects does not count as user acceptance or release readiness.

**User-owned acceptance:** the opening flow is understandable without a guide; writing is visually dominant; research/AI can be found without exposing every tool; the same work survives navigation/reopen/export/recovery; each implemented feature has an honest outcome record. Josh's assessment that the app feels calm and well designed is a required qualitative result, not a conclusion inferred from code.

This stage does not authorize release publication, store submission, account actions, or outreach. Existing release readiness remains NO-GO until its independent requirements are satisfied.

**Implementation completion:** The integrated documentation and authorized production refinements are complete, user results are recorded where supplied, and every missing acceptance/release item remains visible. Report implementation complete awaiting user testing only for fully implemented scope; do not mark the whole improvement release complete while required engineering, live-provider acceptance or commercial activation is pending. Every stage also delivers the evidence record, updated ledger, and user-owned guide required below.

## Data and compatibility rules across stages

| Area | Rule |
| --- | --- |
| Current formats | The pre-improvement baseline was SQL/minimum reader 9 and compilation 2. I04 now delivers SQL/minimum reader 10 and compilation 3; editor AST 1 and archive container 1 remain unchanged. Native migration/output acceptance is pending. |
| New metadata | I04 owns the complete versioned migration and every affected reader/writer. Record actual new versions; preserve legacy content and old archive support. |
| Conversations/proposals | I12/I13 own their versioned persistent changes when authorized. Extend archive/snapshot/restore/duplicate graphs with the tables and references, not just the UI. |
| Portable vs local | Project details and conversation/proposal content travel in projects, backups, and independent copies by default. View preferences, credentials, provider session handles, runtime files, paths, and active jobs remain device-local. |
| Drafts and navigation | Switching screens does not imply discarding drafts. Durable operations continue independently of the mounted panel. Exact retries, revision conflicts, and close/update flushing remain intact. |
| File lifecycle | No destination at creation; native first Save; local protection, selected-file save, and customer cloud upload remain distinct. Preserve retained backups/candidates and external-conflict safeguards. |
| Entitlements | Preserve one free editable designation, unlimited paid projects, and continued reading/export/backup/recovery. New AI conversations/proofreading follow the designated/free or paid editing scope and independently require an eligible provider account; saved AI content remains readable/exportable. Do not introduce promotional upsells or confuse provider eligibility with Collie access. |
| Distribution | Retain Electron, React, TypeScript, electron-vite, electron-builder, sandboxing, context isolation, narrow IPC, and existing direct/store channel gates. No browser-hosted rewrite or silent MAS enablement. |
| Privacy and licensing | No vendor content hosting, content diagnostics, ads, remote asset dependencies, or bundled tracking. Preserve citeproc attribution/source, style/locale notices, and font licenses. |

## Stage handoff and completion ledger

The standing [AGENTS.md manual-testing policy](AGENTS.md#user-owned-manual-testing--standing-instruction) applies to this entire plan. Assistants may inspect and edit source/configuration/documentation. They must not write or maintain tests, generate fixtures/harnesses, run validation commands, launch the app, use browser automation, take verification screenshots, or delegate these activities. Existing historical checks are not permission to repeat them.

For each explicitly requested improvement stage:

1. Read its dependencies and existing user-reported outcomes; preserve unrelated work and do not execute prerequisite checks.
2. Implement that stage and necessary in-scope fixes only. Document migrations, changes, unresolved behavior, and external blockers.
3. Add `docs/validation/improvement-Ixx.md` as an evidence record and `docs/manual-testing/improvement-Ixx.md` as an ordered user guide. The evidence record is documentation, not a validation script.
4. Include relevant user-only launch/setup instructions using the existing development workflow (for example, the user can run `npm run dev` from this repository when dependencies are already installed). Give UI actions and observable expected results, not automated suites or executable test scripts. Use only synthetic/public material and disposable copies for data-risk scenarios.
5. Mark **implementation complete — awaiting user testing** only when implementation is actually complete. Finish with “Stage Ixx complete. As a user:” and the ordered guide, then wait for Josh's results before another stage. A blocked/partial implementation must be labeled accordingly. For I10 and I14, explicitly qualify a local engineering handoff and list outstanding route-dependent code, access/configuration, commercial activation and observations separately; engineering completion is not a working-provider or release milestone.
6. Record acceptance only after the user supplies it; retain unobserved platform, funding, migration, accessibility, and output behavior as pending. Fix reported defects under the same policy.

| Milestone | Required implementation | Acceptance/release condition | Status |
| --- | --- | --- | --- |
| Agreed plan and I01 specifications | Confirmed decisions, screen specifications, architecture decision, provider evidence | Product choices settled; detailed document review awaits Josh | I01 implementation complete — awaiting user testing (document review); provider enablement gates remain open |
| Calm local experience | I02–I09 | User-reported new/returning/offline writing and research outcomes | I02–I09 implementation complete — awaiting user testing; local journey acceptance pending |
| Provider and AI engineering | I10–I13, each explicitly requested | Delivered real code contracts and per-component status; commercial approval is not a code-writing prerequisite | I10 independent local foundation delivered; funding/isolation/registration/packaging remain pending; I11 local connection UI delivered — awaiting user testing; I12/I13 not implemented |
| First working AI experience | I10–I12 | Supported live access, included-only funding and user-reported native behavior; commercial availability needs its separate approval | Not delivered; A-OPENAI/F-OPENAI unresolved; engineering may proceed under revised I10 |
| Proofreading | I13 | Real eligible generation plus user-reviewed correction/stale-target/reversal outcomes | Not implemented; local engineering can proceed from delivered I12 contracts; live output pending eligibility |
| Provider choice | I14, later increment | Second provider independently eligible and usable | Deferred pending explicit request and documented technical route; its engineering/access/activation follow I10's separation; not a first-provider release dependency |
| Complete improvement experience | I15 and all selected scope | User acceptance recorded; remaining release gates explicit | Not implemented |

Current handoff: I11's **connection/account UI implementation is complete — awaiting user testing**. Follow its [manual guide](docs/manual-testing/improvement-I11.md) for actual unavailable/local-continuation behavior and conditional later login observations. Setup, Settings and Write now share the real service; no mock success or provider action was used. I10's independent local foundation remains delivered with the full stage partial: the [runbook](docs/ai/provider-runtime.md) maps missing registration, funding/isolation, eligible model/ready semantics and packaged distribution. Resume I10 to complete these using delivered owners; I01–I09 need no rerun. I12 can be requested against I10/I11's delivered contracts for local conversation persistence/UI, while generation remains gated. No automatic advancement is authorized. Commercial approval and provider-enforced included-only funding remain unresolved; the [owner application guide](docs/ai/openai-approval-guide.md) supports later activation, not permission to send requests.

I01–I09 do not need reimplementation and still have no user-reported acceptance results. Their contracts and pending observations remain intact. The independent [I09 local journey guide](docs/manual-testing/improvement-I09.md), with [I03 navigation](docs/manual-testing/improvement-I03.md), [I06 lifecycle](docs/manual-testing/improvement-I06.md), [I07 writing](docs/manual-testing/improvement-I07.md) and [I08 research](docs/manual-testing/improvement-I08.md), remains available. Native/export/recovery/accessibility observations remain pending and release remains NO-GO.
