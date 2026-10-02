# I02 decision — visual foundation and startup preferences

October 1, 2026. **Implementation complete — awaiting user testing.** Read with the [I01 experience specification](../design/app-experience.md), [I02 evidence](../validation/improvement-I02.md), and [manual guide](../manual-testing/improvement-I02.md). No appearance, accessibility, native, or packaged-security outcome has been observed by the assistant.

## Scope and dependency selection

The complete improvement plan was read before implementation. I01 supplies the visual specification and ownership constraints; the user's explicit I02 request authorizes this next stage without implying acceptance of unobserved I01 details. Session/navigation extraction remains I03, project metadata I04, setup I05, and focused workspace/research flows I07–I09. No provider dependency blocks I02.

Pin `@mantine/core` and `@mantine/hooks` to **9.6.3**, and `lucide-react` to **1.49.0**. Official registry metadata retrieved October 1 lists matching hooks and React/React DOM `^19.2.0` as Mantine peers; this checkout already resolves React/React DOM 19.3.0. Existing React, Node, npm, Electron, Vite and builder version selections remain unchanged. Only core/hooks and the icon library are direct additions; no form, notification, router, editor, or second component system is added. [Mantine package metadata](https://registry.npmjs.org/@mantine/core/9.6.3), [hooks metadata](https://registry.npmjs.org/@mantine/hooks/9.6.3), [Lucide metadata](https://registry.npmjs.org/lucide-react/1.49.0).

Package installation used `--ignore-scripts --no-audit --no-fund`; no install lifecycle or validation command was executed. The available installation shell reported Node 22.22.3/npm 10.9.8 and an engine warning against the project's pinned Node 24.21.0/npm 11.19.0. The pins were not weakened. Manual launch/build work belongs to Josh using the pinned toolchain; installation is not evidence of runtime compatibility.

## One preference owner

`main.tsx` loads bundled theme/base CSS, reads preferences and applies root appearance attributes before mounting React. `VisualPreferencesProvider` persists above App/Settings, owns system appearance/contrast/motion listeners, and applies native zoom independently of opening Settings. Mantine has one persistent provider and receives the effective light/dark scheme from this owner. Its storage manager is deliberately inert: there is no competing Mantine preference key.

The existing `collie.visual-settings.v1` record retains `zoom`, `contrast`, and `reducedMotion`, adding `appearance: light | dark | system`. A missing appearance defaults to system. Each existing field is normalized independently, so a bad theme or zoom value cannot erase otherwise valid choices. Invalid JSON or inaccessible local storage uses safe defaults and a visible explanation. Preferences are written only when the user changes a setting; a read failure does not overwrite the original automatically. A failed write leaves current-window preferences usable and explains that they were not saved. No preference enters project SQL, files, backups or support previews.

High contrast is enabled by either the local checkbox or the OS preference. Reduced motion similarly honors either request. Explicit light/dark overrides OS appearance; system mode follows subsequent OS changes. Changing appearance/contrast/motion does not resend native zoom. A zoom error appears beside its labeled field with Retry zoom, and a shell notice points to Settings. Late zoom responses cannot replace a newer request's displayed result. No preference failure gates local writing.

## Tokens and style ownership

`theme/tokens.css` owns CSS values; `theme/theme.ts` supplies the corresponding Mantine context and component defaults. Because runtime theme-variable injection is disabled, maintain both when changing theme dimensions or palette. Base library variables remain in bundled Mantine CSS; Collie's static bridge overrides its selected palette and roles.

| Product role | Values / Mantine mapping |
| --- | --- |
| Surround, surface, muted surface | `--collie-background`, `--collie-surface`, `--collie-surface-muted`; bridge to body/default/disabled variables |
| Text and secondary text | Warm graphite/light ink; bridge to text, dimmed, placeholder and bright; supporting text stays near 14px |
| Accent and selection | Ten green shades in both theme/CSS; shade 7 light, shade 3 dark; semantic foreground/background and filled/light/outline/primary aliases |
| Error and warning | Dedicated text/surface roles; status icons and titles convey severity independently of color |
| Typography | System sans for interface, local Source Serif 4 for prose, system monospace for support preview; interface 16px, manuscript 19px/1.6 |
| Spacing | 4/8/12/16/24/32/48px semantic scale; Mantine xs/sm/md/lg/xl map to 4/8/16/24/32px |
| Radius and density | 8px controls, 12px surfaces; controls aim for at least 44px; labels/actions wrap |
| Focus and elevation | Offset 3px ring, 4px high-contrast ring; shadow reserved for overlays, borders on ordinary surfaces |
| Motion | Short 120ms fades; zero-duration overlay transitions and near-zero global animation when reduced motion is requested |
| Contrast/forced colors | Separate light/dark high-contrast tokens; native forced-color semantics and Highlight focus, with no forced-color opt-out |

All authored classes are semantic lowercase hyphenated names. Mantine's supported theme `classNames` slots connect shared controls to CSS Modules. [Styles API](https://mantine.dev/styles/styles-api/).

| Owner | Styles / responsibility |
| --- | --- |
| `assets/main.css` | Global resets, base elements, selection, focus and reduced-motion rules only |
| `theme/tokens.css` | Font faces, palette and semantic dimensions, theme/contrast variants and Mantine variable bridge |
| `App.module.css` | Shell header/footer, attribution, skip link, content measure and storage disclosure |
| `components/ui/controls.module.css` | Buttons, labeled fields/errors, choices, action menus, dialogs, base surfaces and dialog scroll locking |
| `components/ui/feedback.module.css` | Shared section surfaces, banners and empty states |
| `features/settings/SettingsPanel.module.css` | Appearance/accessibility arrangement, privacy disclosure and support preview |
| `features/projects/Projects.css` | Existing aggregate workspace rules moved intact in role to the current `.projects` owner, with color tokens and local manuscript fonts; no session mutation |
| `components/ErrorBoundary.module.css` | Provider-independent fallback window and reload control |

The existing workspace is still a single mounted feature. Its legacy child selectors are scoped under `.projects` rather than left in root CSS. As later stages change those panels, extract each panel's presentation with its owner; do not use this transitional sheet as a destination for new unrelated feature rules. I02 does not claim the old panels have received their final redesign. No utility stacks, generated-hash selectors, broad `.mantine-*` rules or app-authored layout style props were added.

## Real product interactions

- The header uses labeled Mantine buttons and App menu. Menu items retain Tutorial, Data Locations/recovery, and Settings entry points. Selection closes the menu before focusing its existing destination; dismissal returns focus. This is still in-document navigation and does not unmount the workspace.
- Settings uses labeled native selects for appearance/zoom and Mantine checkboxes for contrast/motion. Field error text is associated with its input and announced. Primary, secondary and quiet buttons share defaults; pending work retains readable wording and prevents duplicate submission.
- Review support preview opens a titled Mantine modal with keyboard containment, explicit Close, Escape/outside dismissal and return to its trigger. The initial empty state offers Prepare content-free preview. Only that action requests the existing sanitized summary. Returned text remains selectable/read-only; refresh is explicit. Closing during a request invalidates its UI result, without reopening the dialog or sending data. Existing preview content remains available on reopen.
- The dialog remains dismissible during this read-only operation. Future dialogs that own unsaved edits must supply their own guarded close semantics; a generic close is not discard authorization. I03/I07 still own editor-selection restoration when adding editing dialogs.
- Content-free support/privacy wording is preserved. Technical engine information remains reachable in Local storage details. Storage failure still has the existing visible project warning; this disclosure is not a substitute for urgent draft protection.
- The initial-window citeproc attribution remains uncollapsed, in ordinary 16px body text before project content. Native Help → Third-party licenses still exposes the same bundled source/notices. File pickers and native confirmations are unchanged.

Mantine documents modal focus containment/return, Escape/outside controls, and the scroll-lock helper. I02 retains those interaction defaults except the style-injecting scroll helper described below. [Modal documentation](https://mantine.dev/core/modal/), [Menu documentation](https://mantine.dev/core/menu/).

## CSP, fonts, and portals

Use `@mantine/core/styles.layer.css` bundled by the existing Vite pipeline. Set `withCssVariables={false}` and `withGlobalClasses={false}`. No `ColorSchemeScript`, inline bootstrap, responsive style props, `hiddenFrom`/`visibleFrom`, or other generated-style feature is used. Responsive presentation belongs in static scoped CSS. These provider switches are documented options for externally managed CSS variables/classes. [MantineProvider](https://mantine.dev/theming/mantine-provider/).

Production retains `style-src 'self'` and now explicitly states `style-src-elem 'self'; style-src-attr 'none'`. Inline style text/tags remain denied; no nonce, `unsafe-inline`, remote style/font/icon source, new script permission, or new renderer network origin is added. Development keeps its pre-existing loopback-only HMR policy. Both production protocol responses and the session header policy use the same CSP constant.

Mantine's current Box/Popover/Transition source passes runtime positioning, component variables and transition values through React style objects. The installed React DOM client assigns individual CSSOM properties (`style[name]`/`style.setProperty`), rather than parsed style text. CSP permits those assignments while denying style attributes set as text. This is the implementation basis, not an observed Electron result. [MDN style-src-attr](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src-attr).

`AppDialog` sets `lockScroll={false}` to avoid react-remove-scroll's unnonced generated stylesheet. Its scoped CSS locks document scrolling while a dialog-content element is present, including the exit transition. The dialog content retains its own bounded scrolling; no global test hook or raw HTML is used. Menu and modal portals remain children of the same trusted document and inherit root tokens. There is no iframe or secondary origin. Future components with generated style tags must get their own documented static solution or a real response-bound nonce; never introduce a constant nonce or broad CSP exception.

The four existing Source Serif TTFs are referenced by CSS URLs and emitted as local Vite assets. The exact bundled-asset protocol allowlist now accepts `.ttf` alongside JS/CSS; its exact URL lookup, symlink/root checks, and denial of unlisted files are preserved. Existing font bytes, OFL notices and `resources/asset-manifest.json` origins are unchanged. No font download occurs at app startup.

## Redistribution and remaining gates

Mantine MIT, Lucide ISC/retained Feather MIT, and dependency notices are copied to the existing packaged `resources/licenses/dependencies/` directory and recorded in its inventory. Existing React/React DOM/scheduler and tslib notices are included for the UI dependency graph. The react-remove-scroll-bar 2.3.8 npm artifact and its gitHead omit LICENSE; its current upstream MIT text is retained with the exact retrieval URL/date in the inventory instead of inventing a package-supplied file. The existing builder `licenses/**` allowlist includes these artifacts without new packaging infrastructure. Citeproc CPAL source/attribution and all prior notices remain.

SQL/minimum reader **9**, editor AST **1**, archive container **1**, and compilation model **2** are unchanged. No migration, AI, purchase, entitlement, file-lifecycle, or editor transaction change was made. User-owned checks still need to establish visual quality, all keyboard/screen-reader behavior, narrow-window/200% zoom, font loading and strict packaged CSP behavior. Development HMR is insufficient evidence of production CSP. Existing release NO-GO and I10/I14 provider gates remain open.
