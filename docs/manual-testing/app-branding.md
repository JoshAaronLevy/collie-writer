App branding implementation complete. As a user:

Use the pinned Node/npm setup in the [README](../../README.md). Save or locally protect any writing before closing an older running app. These steps are for you to perform; the assistant has not launched or packaged the app.

1. When I run `npm run dev`, the header shows the approved collie holding a pencil beside **Collie Writer** and the development label. The complete head, ears and pencil remain visible, with the pale green background.
2. When I choose **App menu → About and help**, I see the larger matching logo beside the About heading and introduction. Version, licenses and existing help actions remain available. Returning to Projects or writing retains the small header logo without adding an extra illustration to the workspace.
3. When I narrow the window, change appearance between light and dark, or use my preferred interface zoom/high-contrast setting, the logo keeps its proportions and its original colors, and the adjacent name and controls remain readable. With a screen reader, the decorative image does not repeat the adjacent product name or add an extra focus stop.
4. When I look at the Dock after starting the macOS development app, it shows the collie artwork. On Windows, the running window uses the collie icon in native surfaces that show its window icon. Platform cache behavior has not yet been observed.
5. For packaged presentation, when I create a development package myself using `npm run build:mac` on macOS or `npm run build:win` on Windows and open the resulting development app, its header/About images still load. The macOS app in Finder/Dock, or Windows app in Explorer and its installer/uninstaller, uses the collie artwork. Windows development artifacts remain unsigned. If the OS shows a cached older icon, fully quit and reopen the newly produced app before reporting the surface that differs. Existing signing and release approval requirements remain separate.

**Implementation complete — awaiting user testing.** Report any step and surface whose appearance differs. No automated suites are requested.
