# Stage 19 accessibility matrix

Implementation review only; no app, browser, screen reader, platform package or automated check was run by the assistant. All observations and acceptance remain user-owned.

| Journey                | Implemented path                                                                   | User observation still needed                                                                            | Severity until resolved |
| ---------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------- |
| First start and sample | Header links, tutorial steps, labeled sample, native Save picker                   | Keyboard-only idea→export, picker cancellation, returned focus, sample reset                             | High release gate       |
| Editor and citations   | Labeled manuscript/note textboxes, toolbar names, non-drag insertion and View zoom | VoiceOver/NVDA reading order, IME/selection and citation announcement                                    | High release gate       |
| Sources and evidence   | Headings, native import/inspection controls, status/alert messages                 | Text/PDF pane order, excerpt selection, link control names, focus after source changes                   | High release gate       |
| Outline and history    | Up/Down/Move buttons alongside drag, focused navigation targets                    | Keyboard reorder, conflict/recovery dialogs and selection restoration                                    | High release gate       |
| Long search results    | Result summary receives focus after pagination; numbered results                   | 10,000-source and long-manuscript navigation and live announcement clarity                               | Medium usability gate   |
| Visual preferences     | 100/125/150/200% zoom, high-contrast and reduced-motion choices, 44px targets      | 200% layout at minimum window size, OS forced colors, OS reduced motion and target sizing on Mac/Windows | High release gate       |
| File and recovery      | Named Save/Backup/Locate/Show controls, accessible Data Locations section          | Native dialog focus, screen-reader distinctions among local recovery, selected file and cloud upload     | High release gate       |

No WCAG or screen-reader certification is claimed. Record a concrete defect, affected platform/screen reader, severity, and release effect when Josh supplies findings. Until then the high-severity rows remain open gates, not known failures.

## Improvement I02 addendum — October 1, 2026

The [I02 guide](../manual-testing/improvement-I02.md) now covers the implemented header menu, Mantine fields/buttons, light/dark/system preferences, high contrast, OS motion/contrast changes, and the titled support-preview dialog. The root owns preferences independently of Settings. Menu selection targets existing section headings; dialog dismissal returns focus and keeps preview text selectable. I02 supplies shared focus/error/status styles and local font assets; it does not establish acceptance of these or the earlier matrix rows.

Keyboard/arrow/Escape/outside-click behavior, dialog scroll containment, screen-reader labels/live errors, Windows forced colors, narrow-window/200% zoom and packaged font/style behavior are all **awaiting user observation**. The existing workspace remains mounted; navigation/editor/research layout refinement is later staged work. No accessibility tool, app, browser, screen reader or automated check was run.

## Improvement I03–I04 pending observations

Typed destinations use labeled controls; retained hidden regions are hidden/inert, and focus returns to the retained owner or explicit error-resolution target. Project-details/create fields use Mantine labels, required-state cues and field errors; long text is validated without silently truncating stored legacy content. Explicit Save/reload and pending Retry remain labeled keyboard actions. Export title-page and description-property choices are separately labeled and unchecked initially. New styles live beside their feature owners. Keyboard order/return, IME, VoiceOver/NVDA, 200% zoom, narrow windows and light/dark/high-contrast results are all **unobserved**; [I03](../manual-testing/improvement-I03.md) and [I04](../manual-testing/improvement-I04.md) provide manual actions without assistant-run checks.

## Improvement I05 pending observations

The guided setup uses Mantine radio cards in a labeled type group, semantic selected/focus styles, heading focus on each step, adjacent details errors with first-invalid-field focus, and retained hidden regions. Primary/secondary DOM order stays consistent when the grid becomes one column; reduced-motion and forced-colors selectors are scoped to the wizard. Manual keyboard, screen-reader, narrow-window, 200% zoom, light/dark/high-contrast and restart observations remain **unobserved**; the [I05 guide](../manual-testing/improvement-I05.md) records the expected user path without assistant-run checks.

## Improvement I06 pending observations

Projects now offers separate Open and labeled Actions controls per row, Recent/All active/Archived view buttons, a labeled title/type filter, readable state text, and a recovery link. The normal library hides UUIDs and full file paths; detailed paths remain in deliberate file/recovery surfaces. A retained file job or conflict stays globally actionable. Lifecycle and recovery controls use Mantine buttons and scoped styles while the older writing/research surfaces keep their existing owner. Keyboard menu/focus behavior, screen-reader distinction of row actions, narrow/200% layout, contrast, native picker return and recovery status announcements are **unobserved**; see the [I06 guide](../manual-testing/improvement-I06.md).

## Improvement I07 pending observations

Write now has labeled project switching and chapter/section navigation, outline actions with non-drag equivalents, pointer/keyboard resizers with separator/value semantics, and narrow alternate views whose hidden panes are inert. Focus mode retains a visible exit action and global errors/jobs. Scoped semantic styles use the existing theme and contrast tokens. Link/image/citation dialogs have labels, focus containment/return, explicit draft ownership and selection guards. Find and section details are on demand; reference bodies remain mounted when collapsed. Keyboard traversal, menu/dialog focus, selection/undo, IME, screen readers, narrow/200% layout, theme/contrast/reduced motion, native pickers and packaged CSP are **unobserved**. The [I07 guide](../manual-testing/improvement-I07.md) supplies user actions; no assistant-driven checks occurred.

## Improvement I08 pending observations

| Journey                            | Implemented presentation                                                                                                    | User observation still needed                                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Research lists and details         | Labeled Mantine fields/actions, selected-item states, responsive shared layout, hidden/inert retained editors               | Keyboard and screen-reader list/detail order, readable labels, narrow/200% layout, themes/high contrast            |
| Source usage and writing companion | Separate relationship counts, section/chapter selection, state labels and exact-context links                               | Citation and footnote targeting, chapter comprehension, long source titles, Back focus and stable original context |
| Originals and excerpts             | Original reader, selected exact quote, on-demand transcription/correction and version/provenance disclosure                 | PDF canvas/text order, selection, source version/page accuracy, earlier/corrected excerpt announcements            |
| Notes, annotations and evidence    | Named label dialogs, separate quote/interpretation, archived/orphan/revised states, reversible question decisions           | IME/form retention, dialog focus/escape, explicit save/discard and accessible contextual errors                    |
| Search and indexing                | Focused results with labels, retained query/page/scroll, pagination summary focus, disclosed coverage and global job status | Return from writing/research, live status clarity, index cancellation and real long-result performance             |

No assistant accessibility, browser, screenshot, app launch or other validation was performed. All results remain awaiting Josh’s [I08 manual observations](../manual-testing/improvement-I08.md); implementation does not establish accessibility acceptance.

## Improvement I09 pending observations

Export now has labeled step navigation and heading focus, section checkboxes, single-format radios/free or multi-format checkboxes/paid, disclosed ordering/recipes/reference tools, adjacent filename errors, per-revision metadata acknowledgment and per-file results. Global result links focus the matching scoped result; completed notices collapse while urgent outcomes remain visible. Save options and Settings use named Mantine controls. The three-point orientation has explicit dismissal, and the tutorial uses typed navigation rather than hidden DOM targets. About retains the labeled, content-free support dialog; license/update actions reuse native dialogs. Feature styles are scoped, and the initial citeproc notice remains visible.

Keyboard/focus/IME, VoiceOver/NVDA, native-dialog return, wrapping at narrow/200% zoom, radio/group semantics, dark/high contrast/reduced motion, result announcements and orientation dismissal are **unobserved**. All prior matrix rows and release gates remain pending. Follow the [I09 manual guide](../manual-testing/improvement-I09.md); no assistant checks, launches, screenshots or accessibility tools were used.

## Improvement I11 pending observations

Setup, Settings and Write share labeled Mantine account controls with polite connection status, unavailable reasons and optional details. Browser waiting/cancel and unknown-result reconciliation remain actionable above hidden destinations. Disconnect has a named confirmation, pending dismissal guard and origin/heading focus fallback; other account returns avoid hidden/inert surfaces, changed destinations and active composition. Scoped styles wrap account text/actions and use existing theme/contrast tokens. No forced simulations or account inputs were added.

Keyboard/announcement behavior, focus during actual OAuth and disconnect, editor/IME/undo preservation, narrow/200% layout, theme/contrast/reduced motion, native browser/secure storage and packaged CSP remain **unobserved**. The [I11 guide](../manual-testing/improvement-I11.md) separates current unavailable/local-continuation observations from conditional live-access paths. No accessibility tool, app/browser launch or validation was performed.

## I12 conversations — pending user observation

The existing optional AI companion now contains semantic Mantine-labelled title/search/composer controls, Active/Archived selection, transcript pagination and history-selection checkboxes. Retained hidden content is inert and out of the tab order. The transcript is a labelled scrollable region with selectable plain text; full response bodies are not live regions. Outcome/status text reports progress without interpreting Stop as confirmed cancellation. Errors, pending drafts and local recovery remain discoverable in the shell. Explicit Return to conversations reveals the companion at narrow widths without remounting the manuscript. No automatic output callback steals focus.

Keyboard/IME, source selection, pane/scroll/focus retention, zoom, contrast/dark/light, screen-reader announcements, static CSP and native export-dialog behavior remain unobserved. Follow [I12's manual guide](../manual-testing/improvement-I12.md); no source inspection is accessibility acceptance.

## I13 retained proofreading surface — October 2, 2026

Implementation delivered, all observations pending. Write → AI assistance → Proofreading uses the existing single companion, semantic scoped CSS and Mantine controls. Both feature panels stay mounted with hidden/inert boundaries. Named scope controls, coverage/request disclosures, paged saved reviews/findings and exact before/after text expose the foundation without inline hover-only affordances. A shell notice returns to retained work; non-text states distinguish not-sent/invalid/stale/ignored/accepted. The editor is retained on Apply, with a bounded document-mutation lock and explicit reconciliation state if acknowledgment is unknown. A named link opens the existing pre-correction History comparison.

Josh's [manual guide](../manual-testing/improvement-I13.md) covers keyboard/focus/selection/IME, narrow layout, zoom, themes, screen readers and conditional real findings/undo. No accessibility, CSP, native, output or quality acceptance is inferred from source. No automated accessibility checks or launches occurred.
