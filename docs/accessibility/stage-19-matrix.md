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
