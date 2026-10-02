# Stage 19 accessibility matrix

Implementation review only; no app, browser, screen reader, platform package or automated check was run by the assistant. All observations and acceptance remain user-owned.

| Journey | Implemented path | User observation still needed | Severity until resolved |
| --- | --- | --- | --- |
| First start and sample | Header links, tutorial steps, labeled sample, native Save picker | Keyboard-only idea→export, picker cancellation, returned focus, sample reset | High release gate |
| Editor and citations | Labeled manuscript/note textboxes, toolbar names, non-drag insertion and View zoom | VoiceOver/NVDA reading order, IME/selection and citation announcement | High release gate |
| Sources and evidence | Headings, native import/inspection controls, status/alert messages | Text/PDF pane order, excerpt selection, link control names, focus after source changes | High release gate |
| Outline and history | Up/Down/Move buttons alongside drag, focused navigation targets | Keyboard reorder, conflict/recovery dialogs and selection restoration | High release gate |
| Long search results | Result summary receives focus after pagination; numbered results | 10,000-source and long-manuscript navigation and live announcement clarity | Medium usability gate |
| Visual preferences | 100/125/150/200% zoom, high-contrast and reduced-motion choices, 44px targets | 200% layout at minimum window size, OS forced colors, OS reduced motion and target sizing on Mac/Windows | High release gate |
| File and recovery | Named Save/Backup/Locate/Show controls, accessible Data Locations section | Native dialog focus, screen-reader distinctions among local recovery, selected file and cloud upload | High release gate |

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
