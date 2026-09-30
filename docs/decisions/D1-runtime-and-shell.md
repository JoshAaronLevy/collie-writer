# D1 — Runtime and shell foundation

Accepted for the local Stage 1 checkpoint, September 29, 2026. Native Windows and Intel Mac results remain pending. See [validation](../validation/stage-01.md).

## Runtime choice

Pin Electron **44.5.0**, host Node **24.21.0**, npm **11.19.0**, electron-vite **5.0.0**, electron-builder **26.15.3** and Node types **24.19.0**. Retain the single-package pipeline and existing locked React/Vite/TypeScript versions. Added test tools: Vitest **4.1.11**, Playwright **1.63.0**, Happy DOM **20.14.5**. No production dependency or native storage driver is added.

The [Electron release feed](https://releases.electronjs.org/releases.json) reports 44.5.0 with Node 24.21.0 and Chromium 152.0.7977.130. The actual arm64 Electron process reports those versions, ABI 149 and N-API 10. The downloaded host Node archive was checked against Node's published SHA-256 list before use. Its bundled npm is 11.19.0. [Node's release schedule](https://nodejs.org/en/about/previous-releases) identifies Node 24 as an LTS line. Electron's [support policy](https://www.electronjs.org/docs/latest/tutorial/electron-timelines) and current feed supersede the unsupported scaffold runtime. Recheck maintained patches before release; an exact pin is not a perpetual security guarantee.

Installed electron-vite requires Node `^20.19.0 || >=22.12.0`, and builder requires Node `>=14.0.0`. The selected host satisfies both. Actual typecheck, builds, sandboxed preload and unsigned arm64 package execution establish this local compatibility result. No native addon compatibility is inferred from it. Vitest can resolve a separate internal Vite dependency; application builds remain Vite 7.3.6.

The product's provisional floor stays macOS 15+ and supported Windows 11 x64. Local validation is macOS 27.0 arm64 only, not minimum-OS validation. Native CI uses the documented [GitHub runner labels](https://docs.github.com/en/actions/reference/runners/github-hosted-runners): `macos-15`, `macos-15-intel`, `windows-2025`. Windows Server CI does not replace Windows 11 interactive QA. No job was dispatched in this session.

## Security boundary

Following the [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security), explicitly enable sandbox/context isolation and disable Node, subframe Node, webviews, insecure content and renderer navigation. Remove both runtime toolkit dependencies and their broad bridge/fallback. The [sandboxed preload is bundled](https://electron-vite.org/guide/dev#limitations-of-sandboxing) into a single CommonJS file whose only external require is Electron.

The only public API is `getInfo()`. It internally creates a UUID-v4 request ID and invokes `app.getInfo`. Main validates owning WebContents identity, main-frame identity and exact expected document URL, then the exact one-field request. It returns only name/version/channel/platform in a typed result. Malformed/oversized requests return bounded validation errors, invalid senders return denial, unknown channels have no handler. Preload verifies the response ID and schema and converts transport exceptions to a content-free error. No raw events, exceptions, paths or environment values cross the bridge. Shared contracts import neither Electron nor filesystem APIs.

`collie://app/index.html` uses a standard secure [custom protocol](https://www.electronjs.org/docs/latest/api/protocol). An inventory of `index.html` and bounded-name JS/CSS files under `assets/` is created from the build directory; resolved paths must remain contained and symlinks are rejected. The handler matches exact URLs and GET only, returns precise MIME types and `nosniff`, and has no arbitrary path, index fallback, query, redirect or network forwarding. A normalized traversal that resolves to an allowed URL can only retrieve that same public bundled asset; it cannot resolve a filesystem path.

Production CSP is `default-src 'none'`, with self-only scripts/styles/images/fonts, `connect-src 'none'`, and no frames, objects, forms or base URL changes. Session request policy independently denies other schemes/origins. Permissions, devices, downloads, popups, webviews and navigation are denied. There is no renderer external-link API. The unpackaged native Development menu can request an HTTP(S) URL; bounded scheme/credential validation plus a native confirmation precedes `shell.openExternal`. Tests disable that route. Product Help is local.

Only unpackaged development accepts a strictly parsed `http://127.0.0.1:<port>` server. CSP allows its matching WebSocket and inline refresh scripts/styles for Vite. No eval exception is added. Packaged builds ignore `ELECTRON_RENDERER_URL`, tested with a hostile supplied value.

## Profiles, packaging and limits

All Stage 1 artifacts deliberately use `.dev`. The production and beta namespaces remain reserved in the plan, not exposed through a runtime environment switch. Chromium preferences use a distinct `.dev` app-data root; project storage does not exist. Stage 4 must implement verified local storage and must not treat Windows roaming preferences as a suitable working database location.

Tests supply a marked generated OS-temporary directory and 256-bit ownership token before startup. Root and cleanup checks reject personal/home/nested roots, symlinked roots/known children and incorrect ownership. Test mode denies Node TCP/HTTP/TLS/UDP/fetch plus Electron session network traffic; the harness retains its local debugging connection. This is an accidental-egress guard for trusted tests, not an OS security sandbox for hostile Node code.

The positive builder allowlist contains compiled main/preload/renderer and package metadata only. No updater/feed, Linux target, camera/microphone/folder privacy strings, unsigned-memory or DYLD entitlement remains. Retain JIT permission as the Chromium runtime requirement; signed entitlement validation belongs to Stage 21. `npmRebuild: false` is temporary because there are no native production dependencies; D2 must decide it explicitly. Temporary packaging icons remain until Stage 21. Missing legal author metadata produces a builder warning intentionally; do not invent a seller.

No data format or migration was introduced. No project file, recovery database, editor, commerce, AI SDK, analytics, ad SDK or content service exists. Stage 2 and later gates remain unchanged.
